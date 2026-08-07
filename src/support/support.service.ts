import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GlobalRole,
  MembershipRole,
  StoredFileOwnerType,
  SupportChannel,
  SupportThreadStatus,
  SupportTopic,
} from '@prisma/client';
import { CryptoService } from '../common/crypto/crypto.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { StorageService } from '../storage/storage.service';
import {
  COURSE_TOPICS,
  CreateSupportThreadDto,
  PostSupportMessageDto,
  RateSupportThreadDto,
  TECH_TOPICS,
  TOPIC_LABELS,
} from './dto/support.dto';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly enrollments: EnrollmentsService,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  async create(actor: AuthUser, dto: CreateSupportThreadDto) {
    this.assertTopicForChannel(dto.channel, dto.topic);

    if (dto.channel === SupportChannel.COURSE) {
      if (!dto.courseId) {
        throw new BadRequestException('courseId is required for COURSE support');
      }
      const enrolled = await this.access.hasContentAccess(actor, dto.courseId);
      if (!enrolled) {
        throw new ForbiddenException('No access to this course');
      }
    } else if (dto.courseId) {
      throw new BadRequestException('courseId is only for COURSE channel');
    }

    if (
      (dto.topic === SupportTopic.OTHER_COURSE ||
        dto.topic === SupportTopic.OTHER_TECH) &&
      !dto.subject?.trim()
    ) {
      throw new BadRequestException('Укажите тему для «Другое»');
    }

    const subject =
      dto.topic === SupportTopic.OTHER_COURSE ||
      dto.topic === SupportTopic.OTHER_TECH
        ? dto.subject.trim()
        : dto.subject?.trim() || TOPIC_LABELS[dto.topic];

    const thread = await this.prisma.supportThread.create({
      data: {
        channel: dto.channel,
        topic: dto.topic,
        courseId: dto.channel === SupportChannel.COURSE ? dto.courseId : null,
        createdById: actor.id,
        subject,
        messages: {
          create: {
            senderId: actor.id,
            body: dto.body.trim(),
          },
        },
      },
      include: {
        course: { select: { id: true, title: true } },
        messages: { orderBy: { createdAt: 'asc' }, take: 1 },
        rating: true,
      },
    });

    try {
      await this.notifications.notifyStaffSupportInbound({
        threadId: thread.id,
        channel: thread.channel,
        courseId: thread.courseId,
        subject: thread.subject,
        preview: dto.body.trim(),
        excludeUserId: actor.id,
      });
    } catch {
      /* non-blocking */
    }

    return {
      ...this.serializeThreadSync(thread, actor.id),
      firstMessageId: thread.messages[0]?.id ?? null,
    };
  }

  async listMine(actor: AuthUser) {
    const threads = await this.prisma.supportThread.findMany({
      where: { createdById: actor.id },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        course: { select: { id: true, title: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        rating: true,
      },
    });
    return threads.map((t) => this.serializeThreadSync(t, actor.id));
  }

  async listInbox(actor: AuthUser) {
    if (actor.realGlobalRole === GlobalRole.ADMIN) {
      const threads = await this.prisma.supportThread.findMany({
        orderBy: { lastMessageAt: 'desc' },
        include: {
          course: { select: { id: true, title: true } },
          createdBy: true,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { sender: true },
          },
          rating: true,
        },
      });
      return threads.map((t) => this.serializeThreadSync(t, actor.id));
    }

    if (actor.realGlobalRole === GlobalRole.SUPPORT) {
      const threads = await this.prisma.supportThread.findMany({
        where: { channel: SupportChannel.TECH },
        orderBy: { lastMessageAt: 'desc' },
        include: {
          course: { select: { id: true, title: true } },
          createdBy: true,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { sender: true },
          },
          rating: true,
        },
      });
      return threads.map((t) => this.serializeThreadSync(t, actor.id));
    }

    const memberships = await this.prisma.courseMembership.findMany({
      where: { userId: actor.id, role: MembershipRole.CURATOR },
      select: { courseId: true },
    });
    const courseIds = memberships.map((m) => m.courseId);
    if (!courseIds.length) return [];

    const threads = await this.prisma.supportThread.findMany({
      where: {
        channel: SupportChannel.COURSE,
        courseId: { in: courseIds },
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        course: { select: { id: true, title: true } },
        createdBy: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { sender: true },
        },
        rating: true,
      },
    });
    return threads.map((t) => this.serializeThreadSync(t, actor.id));
  }

  async get(actor: AuthUser, id: string) {
    const thread = await this.prisma.supportThread.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true } },
        createdBy: true,
        rating: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: true },
        },
      },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    await this.assertCanRead(actor, thread);
    const full = await this.serializeThreadFull(thread, actor.id);
    let canCancelCourse = false;
    let enrollmentActive = false;
    if (
      thread.topic === SupportTopic.COURSE_CANCEL &&
      thread.courseId &&
      (await this.access.canManageCourse(actor, thread.courseId))
    ) {
      const enr = await this.prisma.enrollment.findUnique({
        where: {
          courseId_userId: {
            courseId: thread.courseId,
            userId: thread.createdById,
          },
        },
        select: { status: true, createdAt: true },
      });
      enrollmentActive = enr?.status === 'ACTIVE';
      canCancelCourse = enrollmentActive;
    }
    return { ...full, canCancelCourse, enrollmentActive };
  }

  async postMessage(actor: AuthUser, id: string, dto: PostSupportMessageDto) {
    const thread = await this.prisma.supportThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException('Thread not found');
    await this.assertCanWrite(actor, thread);
    if (thread.status === SupportThreadStatus.CLOSED) {
      throw new BadRequestException('Thread is closed');
    }

    await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: {
          threadId: id,
          senderId: actor.id,
          body: dto.body.trim(),
        },
      }),
      this.prisma.supportThread.update({
        where: { id },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    if (actor.id !== thread.createdById) {
      try {
        await this.notifications.notifySupportReply({
          studentId: thread.createdById,
          threadId: id,
          channel: thread.channel,
          courseId: thread.courseId,
          preview: dto.body.trim(),
        });
      } catch {
        /* non-blocking */
      }
    } else {
      try {
        await this.notifications.notifyStaffSupportInbound({
          threadId: id,
          channel: thread.channel,
          courseId: thread.courseId,
          subject: thread.subject,
          preview: dto.body.trim(),
          excludeUserId: actor.id,
        });
      } catch {
        /* non-blocking */
      }
    }

    return this.get(actor, id);
  }

  async close(actor: AuthUser, id: string) {
    const thread = await this.prisma.supportThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException('Thread not found');
    await this.assertCanWrite(actor, thread);
    await this.prisma.supportThread.update({
      where: { id },
      data: {
        status: SupportThreadStatus.CLOSED,
        closedById: actor.id,
      },
    });
    return this.get(actor, id);
  }

  async cancelCourse(actor: AuthUser, threadId: string, reason?: string) {
    const thread = await this.prisma.supportThread.findUnique({
      where: { id: threadId },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.topic !== SupportTopic.COURSE_CANCEL) {
      throw new BadRequestException('Only COURSE_CANCEL threads support cancel');
    }
    if (!thread.courseId) {
      throw new BadRequestException('Thread has no course');
    }
    if (!(await this.access.canManageCourse(actor, thread.courseId))) {
      throw new ForbiddenException();
    }

    const result = await this.enrollments.cancelEnrollment(
      actor,
      thread.courseId,
      thread.createdById,
      { threadId, reason },
    );

    const hint = result.refundEligible
      ? 'Возврат возможен (окно 5 дней). Автовыплата пока не выполняется.'
      : 'Вне окна возврата 5 дней.';

    if (thread.status === SupportThreadStatus.OPEN) {
      await this.prisma.$transaction([
        this.prisma.supportMessage.create({
          data: {
            threadId,
            senderId: actor.id,
            body: `Курс отменён. Доступ закрыт. ${hint}`,
          },
        }),
        this.prisma.supportThread.update({
          where: { id: threadId },
          data: { lastMessageAt: new Date() },
        }),
      ]);
    }

    return {
      ...result,
      thread: await this.get(actor, threadId),
    };
  }

  async rate(actor: AuthUser, id: string, dto: RateSupportThreadDto) {
    const thread = await this.prisma.supportThread.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, include: { sender: true } },
        rating: true,
      },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.createdById !== actor.id) {
      throw new ForbiddenException('Only the author can rate');
    }
    if (thread.status !== SupportThreadStatus.CLOSED) {
      throw new BadRequestException('Rate after the thread is closed');
    }
    if (thread.rating) {
      throw new BadRequestException('Already rated');
    }

    const agentId = await this.resolveAgentId(thread);
    if (!agentId || agentId === actor.id) {
      throw new BadRequestException('Нет сотрудника для оценки');
    }

    await this.prisma.supportRating.create({
      data: {
        threadId: id,
        raterId: actor.id,
        agentId,
        score: dto.score,
        comment: dto.comment?.trim() || null,
      },
    });

    return this.get(actor, id);
  }

  private async resolveAgentId(thread: {
    closedById: string | null;
    createdById: string;
    messages: Array<{ senderId: string; sender?: { globalRole: GlobalRole } }>;
  }) {
    if (thread.closedById && thread.closedById !== thread.createdById) {
      return thread.closedById;
    }
    for (const m of thread.messages) {
      if (m.senderId === thread.createdById) continue;
      return m.senderId;
    }
    return thread.closedById;
  }

  private assertTopicForChannel(channel: SupportChannel, topic: SupportTopic) {
    const ok =
      channel === SupportChannel.COURSE
        ? COURSE_TOPICS.includes(topic)
        : TECH_TOPICS.includes(topic);
    if (!ok) {
      throw new BadRequestException('Topic does not match channel');
    }
  }

  private async assertCanRead(
    actor: AuthUser,
    thread: {
      createdById: string;
      channel: SupportChannel;
      courseId: string | null;
    },
  ) {
    if (thread.createdById === actor.id) return;
    if (
      thread.channel === SupportChannel.TECH &&
      (actor.realGlobalRole === GlobalRole.ADMIN ||
        actor.realGlobalRole === GlobalRole.SUPPORT)
    ) {
      return;
    }
    if (thread.channel === SupportChannel.COURSE && thread.courseId) {
      if (await this.access.canManageCourse(actor, thread.courseId)) return;
    }
    throw new ForbiddenException('No access to this thread');
  }

  private async assertCanWrite(
    actor: AuthUser,
    thread: {
      createdById: string;
      channel: SupportChannel;
      courseId: string | null;
    },
  ) {
    await this.assertCanRead(actor, thread);
  }

  private displayUser(user: {
    id: string;
    emailEnc: string;
    firstNameEnc: string | null;
    nickname?: string | null;
    globalRole: GlobalRole;
  }) {
    let firstName: string | null = null;
    let email: string | null = null;
    try {
      firstName = user.firstNameEnc
        ? this.crypto.decrypt(user.firstNameEnc)
        : null;
    } catch {
      firstName = null;
    }
    try {
      email = this.crypto.decrypt(user.emailEnc);
    } catch {
      email = null;
    }
    return {
      id: user.id,
      firstName,
      nickname: user.nickname ?? null,
      email,
      globalRole: user.globalRole,
    };
  }

  private serializeThreadSync(
    thread: {
      id: string;
      channel: SupportChannel;
      topic: SupportTopic;
      courseId: string | null;
      createdById: string;
      subject: string;
      status: SupportThreadStatus;
      lastMessageAt: Date;
      createdAt: Date;
      course?: { id: string; title: string } | null;
      createdBy?: {
        id: string;
        emailEnc: string;
        firstNameEnc: string | null;
        nickname?: string | null;
        globalRole: GlobalRole;
      };
      rating?: {
        id: string;
        score: number;
        comment: string | null;
        agentId: string;
      } | null;
      messages?: Array<{
        id: string;
        senderId: string;
        body: string;
        createdAt: Date;
        sender?: {
          id: string;
          emailEnc: string;
          firstNameEnc: string | null;
          nickname?: string | null;
          globalRole: GlobalRole;
        };
      }>;
    },
    viewerId: string,
  ) {
    const last = thread.messages?.[0];
    let lastAgent: ReturnType<SupportService['displayUser']> | null = null;
    if (thread.messages?.length) {
      for (const m of thread.messages) {
        if (m.senderId === thread.createdById) continue;
        if (m.sender) {
          lastAgent = this.displayUser(m.sender);
          break;
        }
      }
    }
    return {
      id: thread.id,
      channel: thread.channel,
      topic: thread.topic,
      topicLabel: TOPIC_LABELS[thread.topic],
      courseId: thread.courseId,
      course: thread.course ?? null,
      createdById: thread.createdById,
      createdBy: thread.createdBy
        ? this.displayUser(thread.createdBy)
        : undefined,
      subject: thread.subject,
      status: thread.status,
      lastMessageAt: thread.lastMessageAt,
      createdAt: thread.createdAt,
      preview: last?.body?.slice(0, 160) ?? null,
      isMine: thread.createdById === viewerId,
      lastAgent,
      canRate:
        thread.status === SupportThreadStatus.CLOSED &&
        thread.createdById === viewerId &&
        !thread.rating,
      myRating: thread.rating
        ? {
            score: thread.rating.score,
            comment: thread.rating.comment,
          }
        : null,
    };
  }

  private async serializeThreadFull(
    thread: {
      id: string;
      channel: SupportChannel;
      topic: SupportTopic;
      courseId: string | null;
      createdById: string;
      subject: string;
      status: SupportThreadStatus;
      lastMessageAt: Date;
      createdAt: Date;
      course?: { id: string; title: string } | null;
      createdBy?: {
        id: string;
        emailEnc: string;
        firstNameEnc: string | null;
        nickname?: string | null;
        globalRole: GlobalRole;
      };
      rating?: {
        id: string;
        score: number;
        comment: string | null;
        agentId: string;
      } | null;
      messages: Array<{
        id: string;
        senderId: string;
        body: string;
        createdAt: Date;
        sender?: {
          id: string;
          emailEnc: string;
          firstNameEnc: string | null;
          nickname?: string | null;
          globalRole: GlobalRole;
        };
      }>;
    },
    viewerId: string,
  ) {
    const base = this.serializeThreadSync(thread, viewerId);
    const attachments = await this.loadMessageAttachments(
      thread.messages.map((m) => m.id),
    );
    return {
      ...base,
      messages: thread.messages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        body: m.body,
        createdAt: m.createdAt,
        sender: m.sender ? this.displayUser(m.sender) : undefined,
        mine: m.senderId === viewerId,
        attachments: attachments.get(m.id) ?? [],
      })),
    };
  }

  private async loadMessageAttachments(messageIds: string[]) {
    if (!messageIds.length) return new Map<string, Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      url: string;
    }>>();

    const files = await this.prisma.storedFile.findMany({
      where: {
        ownerType: StoredFileOwnerType.SUPPORT_MESSAGE,
        ownerId: { in: messageIds },
      },
      orderBy: { createdAt: 'asc' },
    });

    const byMsg = new Map<
      string,
      Array<{
        id: string;
        originalName: string;
        mimeType: string;
        sizeBytes: number;
        url: string;
      }>
    >();

    for (const f of files) {
      let url = '';
      try {
        url = await this.storage.getSignedGetUrl(f.storageKey);
      } catch {
        url = '';
      }
      const list = byMsg.get(f.ownerId) ?? [];
      list.push({
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        url,
      });
      byMsg.set(f.ownerId, list);
    }
    return byMsg;
  }

}
