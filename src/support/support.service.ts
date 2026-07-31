import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GlobalRole,
  MembershipRole,
  SupportChannel,
  SupportThreadStatus,
} from '@prisma/client';
import { CryptoService } from '../common/crypto/crypto.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import {
  CreateSupportThreadDto,
  PostSupportMessageDto,
} from './dto/support.dto';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly crypto: CryptoService,
  ) {}

  async create(actor: AuthUser, dto: CreateSupportThreadDto) {
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

    const thread = await this.prisma.supportThread.create({
      data: {
        channel: dto.channel,
        courseId: dto.channel === SupportChannel.COURSE ? dto.courseId : null,
        createdById: actor.id,
        subject: dto.subject.trim(),
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
      },
    });

    return this.serializeThread(thread, actor.id);
  }

  async listMine(actor: AuthUser) {
    const threads = await this.prisma.supportThread.findMany({
      where: { createdById: actor.id },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        course: { select: { id: true, title: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return threads.map((t) => this.serializeThread(t, actor.id));
  }

  async listInbox(actor: AuthUser) {
    if (actor.realGlobalRole === GlobalRole.ADMIN) {
      const threads = await this.prisma.supportThread.findMany({
        where: { channel: SupportChannel.TECH },
        orderBy: { lastMessageAt: 'desc' },
        include: {
          course: { select: { id: true, title: true } },
          createdBy: true,
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      return threads.map((t) => this.serializeThread(t, actor.id));
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
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return threads.map((t) => this.serializeThread(t, actor.id));
  }

  async get(actor: AuthUser, id: string) {
    const thread = await this.prisma.supportThread.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true } },
        createdBy: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: true },
        },
      },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    await this.assertCanRead(actor, thread);
    return this.serializeThread(thread, actor.id, true);
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

    return this.get(actor, id);
  }

  async close(actor: AuthUser, id: string) {
    const thread = await this.prisma.supportThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException('Thread not found');
    await this.assertCanWrite(actor, thread);
    await this.prisma.supportThread.update({
      where: { id },
      data: { status: SupportThreadStatus.CLOSED },
    });
    return this.get(actor, id);
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
      actor.realGlobalRole === GlobalRole.ADMIN
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

  private serializeThread(
    thread: {
      id: string;
      channel: SupportChannel;
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
    withMessages = false,
  ) {
    const last = thread.messages?.[0];
    return {
      id: thread.id,
      channel: thread.channel,
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
      messages: withMessages
        ? (thread.messages ?? []).map((m) => ({
            id: m.id,
            senderId: m.senderId,
            body: m.body,
            createdAt: m.createdAt,
            sender: m.sender ? this.displayUser(m.sender) : undefined,
            mine: m.senderId === viewerId,
          }))
        : undefined,
    };
  }
}
