import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EnrollmentStatus,
  GlobalRole,
  MembershipRole,
  NotificationChannel,
  NotificationKind,
  Prisma,
} from '@prisma/client';
import { CourseAccessService } from '../enrollments/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';

const RANK_THRESHOLDS = [
  { title: 'Новичок', minXp: 0 },
  { title: 'Ученик', minXp: 100 },
  { title: 'Практик', minXp: 200 },
  { title: 'Знаток', minXp: 350 },
  { title: 'Олимпиадник', minXp: 500 },
  { title: 'Призёр', minXp: 750 },
  { title: 'Мастер', minXp: 1000 },
  { title: 'Гроссмейстер', minXp: 1500 },
];

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type SupportBadgeChannel = 'TECH' | 'COURSE' | 'STAFF_TECH' | 'STAFF_COURSE';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  private retentionSince() {
    return new Date(Date.now() - RETENTION_MS);
  }

  private retentionWhere(userId: string): Prisma.NotificationWhereInput {
    return {
      userId,
      createdAt: { gte: this.retentionSince() },
    };
  }

  async createForUser(input: {
    userId: string;
    kind: NotificationKind;
    channel: NotificationChannel;
    title: string;
    body?: string;
    linkUrl?: string;
    courseId?: string;
    meta?: Prisma.InputJsonValue;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        channel: input.channel,
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl,
        courseId: input.courseId,
        meta: input.meta,
      },
    });
  }

  async createMany(
    userIds: string[],
    input: Omit<Parameters<NotificationsService['createForUser']>[0], 'userId'>,
  ) {
    if (!userIds.length) return { count: 0 };
    return this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        kind: input.kind,
        channel: input.channel,
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl,
        courseId: input.courseId,
        meta: input.meta as Prisma.InputJsonValue | undefined,
      })),
    });
  }

  async listMine(
    user: AuthUser,
    opts?: { unreadOnly?: boolean; take?: number },
  ) {
    await this.purgeMisdeliveredStaffNotifs(user.id);

    // Drop expired quietly
    await this.prisma.notification.deleteMany({
      where: {
        userId: user.id,
        createdAt: { lt: this.retentionSince() },
      },
    });

    return this.prisma.notification.findMany({
      where: {
        ...this.retentionWhere(user.id),
        ...(opts?.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts?.take ?? 80, 120),
      include: { course: { select: { id: true, title: true } } },
    });
  }

  /** Remove staff-inbox toasts wrongly delivered to pure students (security hotfix). */
  private async purgeMisdeliveredStaffNotifs(userId: string) {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        globalRole: true,
        memberships: {
          where: { role: MembershipRole.CURATOR },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!row || row.globalRole === GlobalRole.ADMIN) return;

    const isCurator = row.memberships.length > 0;
    await this.prisma.notification.deleteMany({
      where: {
        userId,
        OR: [
          {
            kind: NotificationKind.SUPPORT_REPLY,
            linkUrl: { startsWith: '/admin' },
          },
          {
            kind: NotificationKind.HW_SUBMITTED,
            linkUrl: { startsWith: '/admin' },
          },
          ...(isCurator
            ? []
            : [
                {
                  kind: NotificationKind.SUPPORT_REPLY,
                  linkUrl: { startsWith: '/curator' },
                },
                {
                  kind: NotificationKind.HW_SUBMITTED,
                  linkUrl: { startsWith: '/curator' },
                },
              ]),
        ],
      },
    });
  }

  async unreadCounts(user: AuthUser) {
    await this.purgeMisdeliveredStaffNotifs(user.id);

    const base = {
      ...this.retentionWhere(user.id),
      readAt: null,
    };
    const [
      toast,
      inbox,
      total,
      supportTech,
      supportCourse,
      staffTech,
      staffCourse,
    ] = await Promise.all([
      this.prisma.notification.count({
        where: { ...base, channel: NotificationChannel.TOAST },
      }),
      this.prisma.notification.count({
        where: { ...base, channel: NotificationChannel.INBOX },
      }),
      this.prisma.notification.count({ where: base }),
      this.countSupportBadge(user.id, 'TECH'),
      this.countSupportBadge(user.id, 'COURSE'),
      this.countSupportBadge(user.id, 'STAFF_TECH'),
      this.countSupportBadge(user.id, 'STAFF_COURSE'),
    ]);
    return {
      toast,
      inbox,
      total,
      supportTech,
      supportCourse,
      staffTech,
      staffCourse,
    };
  }

  private linkForSupportChannel(channel: SupportBadgeChannel): string | undefined {
    switch (channel) {
      case 'TECH':
        return '/lk/support/tech';
      case 'COURSE':
        return undefined; // matched via OR below
      case 'STAFF_TECH':
        return '/admin/support';
      case 'STAFF_COURSE':
        return '/curator/support';
    }
  }

  private supportBadgeWhere(
    userId: string,
    channel: SupportBadgeChannel,
  ): Prisma.NotificationWhereInput {
    const base: Prisma.NotificationWhereInput = {
      ...this.retentionWhere(userId),
      readAt: null,
      kind: NotificationKind.SUPPORT_REPLY,
    };
    if (channel === 'COURSE') {
      return {
        ...base,
        OR: [
          { linkUrl: '/lk/support/course' },
          { linkUrl: { contains: 'tab=curator' } },
        ],
      };
    }
    if (channel === 'STAFF_TECH') {
      return {
        ...base,
        OR: [
          { linkUrl: '/admin/support' },
          { linkUrl: '/support/inbox' },
          { linkUrl: '/support' },
        ],
        NOT: { linkUrl: { contains: 'channel=COURSE' } },
      };
    }
    if (channel === 'STAFF_COURSE') {
      return {
        ...base,
        OR: [
          { linkUrl: '/curator/support' },
          { linkUrl: { contains: 'channel=COURSE' } },
        ],
      };
    }
    return {
      ...base,
      linkUrl: this.linkForSupportChannel(channel),
    };
  }

  private async countSupportBadge(userId: string, channel: SupportBadgeChannel) {
    return this.prisma.notification.count({
      where: this.supportBadgeWhere(userId, channel),
    });
  }

  async markRead(user: AuthUser, id: string) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== user.id) throw new NotFoundException();
    if (n.readAt) return n;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { ...this.retentionWhere(user.id), readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markSupportChannelRead(user: AuthUser, channel: SupportBadgeChannel) {
    await this.prisma.notification.updateMany({
      where: this.supportBadgeWhere(user.id, channel),
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async listReminders(actor: AuthUser, courseId: string) {
    const canManage = await this.access.canManageCourse(actor, courseId);
    const canView = await this.access.hasContentAccess(actor, courseId);
    if (!canManage && !canView) {
      throw new ForbiddenException();
    }
    return this.prisma.courseReminder.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
      },
    });
  }

  async deleteReminder(actor: AuthUser, courseId: string, reminderId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
    const reminder = await this.prisma.courseReminder.findFirst({
      where: { id: reminderId, courseId },
    });
    if (!reminder) throw new NotFoundException('Reminder not found');

    const related = await this.prisma.notification.findMany({
      where: {
        kind: NotificationKind.REMINDER,
        courseId,
      },
      select: { id: true, meta: true },
    });
    const notifIds = related
      .filter((n) => {
        const meta = n.meta as { reminderId?: string } | null;
        return meta?.reminderId === reminderId;
      })
      .map((n) => n.id);

    await this.prisma.$transaction([
      ...(notifIds.length
        ? [
            this.prisma.notification.deleteMany({
              where: { id: { in: notifIds } },
            }),
          ]
        : []),
      this.prisma.courseReminder.delete({ where: { id: reminderId } }),
    ]);
    return { ok: true };
  }

  async createReminder(
    actor: AuthUser,
    courseId: string,
    dto: { title: string; body: string },
  ) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');

    const reminder = await this.prisma.courseReminder.create({
      data: {
        courseId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        createdById: actor.realUserId,
      },
    });

    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, status: EnrollmentStatus.ACTIVE },
      select: { userId: true },
    });
    await this.createMany(
      enrollments.map((e) => e.userId),
      {
        kind: NotificationKind.REMINDER,
        channel: NotificationChannel.TOAST,
        title: dto.title.trim(),
        body: dto.body.trim(),
        courseId,
        linkUrl: `/lk/courses/${courseId}`,
        meta: { reminderId: reminder.id },
      },
    );

    return reminder;
  }

  async notifySupportReply(params: {
    studentId: string;
    threadId: string;
    channel: 'COURSE' | 'TECH';
    courseId?: string | null;
    preview: string;
  }) {
    const isTech = params.channel === 'TECH';
    return this.createForUser({
      userId: params.studentId,
      kind: NotificationKind.SUPPORT_REPLY,
      channel: NotificationChannel.TOAST,
      title: isTech ? 'Ответ техподдержки' : 'Ответ куратора',
      body: params.preview.slice(0, 200),
      courseId: params.courseId ?? undefined,
      linkUrl: isTech
        ? '/lk/support/tech'
        : params.courseId
          ? `/lk/courses/${params.courseId}?tab=curator`
          : '/lk/support/course',
      meta: { threadId: params.threadId, audience: 'student' },
    });
  }

  async notifyStaffSupportInbound(params: {
    threadId: string;
    channel: 'COURSE' | 'TECH';
    courseId?: string | null;
    subject: string;
    preview: string;
    /** Do not notify the student who wrote the message */
    excludeUserId?: string;
  }) {
    const isTech = params.channel === 'TECH';
    const body = `${params.subject}: ${params.preview}`.slice(0, 200);
    const meta = {
      threadId: params.threadId,
      audience: 'staff' as const,
      supportChannel: params.channel,
    };

    if (isTech) {
      const staff = await this.prisma.user.findMany({
        where: {
          globalRole: { in: [GlobalRole.ADMIN, GlobalRole.SUPPORT] },
          isActive: true,
          notifySupportTech: true,
        },
        select: { id: true, globalRole: true },
      });
      const exclude = params.excludeUserId;
      const adminIds = staff
        .filter((s) => s.globalRole === GlobalRole.ADMIN)
        .map((s) => s.id)
        .filter((id) => id !== exclude);
      const supportIds = staff
        .filter((s) => s.globalRole === GlobalRole.SUPPORT)
        .map((s) => s.id)
        .filter((id) => id !== exclude);

      let count = 0;
      if (adminIds.length) {
        const r = await this.createMany(adminIds, {
          kind: NotificationKind.SUPPORT_REPLY,
          channel: NotificationChannel.TOAST,
          title: 'Новое сообщение в техподдержке',
          body,
          courseId: params.courseId ?? undefined,
          linkUrl: '/admin/support',
          meta,
        });
        count += r.count;
      }
      if (supportIds.length) {
        const r = await this.createMany(supportIds, {
          kind: NotificationKind.SUPPORT_REPLY,
          channel: NotificationChannel.TOAST,
          title: 'Новое сообщение в техподдержке',
          body,
          courseId: params.courseId ?? undefined,
          linkUrl: '/support/inbox',
          meta,
        });
        count += r.count;
      }
      return { count };
    }

    if (!params.courseId) return { count: 0 };

    const curators = await this.prisma.courseMembership.findMany({
      where: {
        courseId: params.courseId,
        role: MembershipRole.CURATOR,
      },
      select: {
        userId: true,
        user: { select: { notifySupportCourse: true, isActive: true } },
      },
    });

    let curatorIds = curators
      .filter((c) => c.user.isActive && c.user.notifySupportCourse)
      .map((c) => c.userId);

    const admins = await this.prisma.user.findMany({
      where: {
        globalRole: GlobalRole.ADMIN,
        isActive: true,
        notifySupportCourse: true,
      },
      select: { id: true },
    });
    let adminIds = admins.map((a) => a.id);

    if (params.excludeUserId) {
      curatorIds = curatorIds.filter((id) => id !== params.excludeUserId);
      adminIds = adminIds.filter((id) => id !== params.excludeUserId);
    }

    let count = 0;
    if (curatorIds.length) {
      const r = await this.createMany(curatorIds, {
        kind: NotificationKind.SUPPORT_REPLY,
        channel: NotificationChannel.TOAST,
        title: 'Сообщение ученика',
        body,
        courseId: params.courseId,
        linkUrl: '/curator/support',
        meta,
      });
      count += r.count;
    }
    if (adminIds.length) {
      const r = await this.createMany(adminIds, {
        kind: NotificationKind.SUPPORT_REPLY,
        channel: NotificationChannel.TOAST,
        title: 'Сообщение ученика (курс)',
        body,
        courseId: params.courseId,
        linkUrl: '/admin/support?channel=COURSE',
        meta,
      });
      count += r.count;
    }
    return { count };
  }

  async notifyHwGraded(params: {
    userId: string;
    courseId: string;
    assignmentId: string;
    assignmentTitle: string;
    scoreXp: number | null;
  }) {
    return this.createForUser({
      userId: params.userId,
      kind: NotificationKind.HW_GRADED,
      channel: NotificationChannel.INBOX,
      title: 'ДЗ проверено',
      body: `«${params.assignmentTitle}»${
        params.scoreXp != null ? ` · ${params.scoreXp} XP` : ''
      }`,
      courseId: params.courseId,
      linkUrl: `/lk/assignments/${params.assignmentId}`,
      meta: { assignmentId: params.assignmentId },
    });
  }

  /** Toast for admins + course curators when HW awaits review */
  async notifyStaffHwSubmitted(params: {
    courseId: string;
    assignmentId: string;
    assignmentTitle: string;
    submissionId: string;
    studentUserId: string;
    studentLabel?: string;
  }) {
    const [admins, curators] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          globalRole: GlobalRole.ADMIN,
          isActive: true,
          notifyHwSubmitted: true,
        },
        select: { id: true },
      }),
      this.prisma.courseMembership.findMany({
        where: {
          courseId: params.courseId,
          role: MembershipRole.CURATOR,
        },
        select: { userId: true },
      }),
    ]);

    const adminIds = new Set(
      admins
        .map((a) => a.id)
        .filter((id) => id !== params.studentUserId),
    );
    const curatorIds = [
      ...new Set(
        curators
          .map((c) => c.userId)
          .filter(
            (id) => id !== params.studentUserId && !adminIds.has(id),
          ),
      ),
    ];

    const who = params.studentLabel?.trim() || 'Ученик';
    const body = `${who} сдал «${params.assignmentTitle}» — нужна проверка`.slice(
      0,
      200,
    );

    const rows: Array<{
      userId: string;
      linkUrl: string;
    }> = [
      ...[...adminIds].map((userId) => ({
        userId,
        linkUrl: `/admin/courses/${params.courseId}?tab=review`,
      })),
      ...curatorIds.map((userId) => ({
        userId,
        linkUrl: `/curator/courses/${params.courseId}?tab=review`,
      })),
    ];

    if (!rows.length) return { count: 0 };

    const result = await this.prisma.notification.createMany({
      data: rows.map((r) => ({
        userId: r.userId,
        kind: NotificationKind.HW_SUBMITTED,
        channel: NotificationChannel.TOAST,
        title: 'Новое ДЗ на проверку',
        body,
        courseId: params.courseId,
        linkUrl: r.linkUrl,
        meta: {
          audience: 'staff',
          submissionId: params.submissionId,
          assignmentId: params.assignmentId,
        } as Prisma.InputJsonValue,
      })),
    });
    return { count: result.count };
  }

  async notifyLessonOpened(params: {
    userIds: string[];
    courseId: string;
    lessonId: string;
    lessonTitle: string;
  }) {
    return this.createMany(params.userIds, {
      kind: NotificationKind.LESSON_OPENED,
      channel: NotificationChannel.INBOX,
      title: 'Открылся урок',
      body: params.lessonTitle,
      courseId: params.courseId,
      linkUrl: `/lk/lessons/${params.lessonId}`,
      meta: { lessonId: params.lessonId },
    });
  }

  async maybeNotifyRankUp(
    userId: string,
    previousTotal: number,
    nextTotal: number,
  ) {
    const prev = RANK_THRESHOLDS.filter((r) => previousTotal >= r.minXp).pop();
    const next = RANK_THRESHOLDS.filter((r) => nextTotal >= r.minXp).pop();
    if (!prev || !next || prev.title === next.title || next.minXp === 0) return;
    return this.createForUser({
      userId,
      kind: NotificationKind.RANK_UP,
      channel: NotificationChannel.INBOX,
      title: 'Новый ранг!',
      body: `Вы получили ранг «${next.title}»`,
      linkUrl: '/lk/stats',
      meta: { rank: next.title, totalXp: nextTotal },
    });
  }

  async totalXpForUser(userId: string) {
    const rows = await this.prisma.xpBalance.findMany({
      where: { userId },
      select: { totalXp: true },
    });
    return rows.reduce((s, r) => s + r.totalXp, 0);
  }
}
