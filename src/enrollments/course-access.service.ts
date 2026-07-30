import { Injectable } from '@nestjs/common';
import { GlobalRole, MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';

@Injectable()
export class CourseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async isCurator(userId: string, courseId: string): Promise<boolean> {
    const m = await this.prisma.courseMembership.findUnique({
      where: { courseId_userId: { courseId, userId } },
    });
    return m?.role === MembershipRole.CURATOR;
  }

  async canManageCourse(user: AuthUser, courseId: string): Promise<boolean> {
    if (user.realGlobalRole === GlobalRole.ADMIN) return true;
    return this.isCurator(user.id, courseId);
  }

  async hasContentAccess(user: AuthUser, courseId: string): Promise<boolean> {
    if (user.realGlobalRole === GlobalRole.ADMIN) return true;
    if (await this.isCurator(user.id, courseId)) return true;
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId: user.id } },
    });
    return enrollment?.status === 'ACTIVE';
  }

  async curatorSharesEnrollmentWith(
    curatorId: string,
    studentId: string,
  ): Promise<boolean> {
    const memberships = await this.prisma.courseMembership.findMany({
      where: { userId: curatorId, role: MembershipRole.CURATOR },
      select: { courseId: true },
    });
    if (memberships.length === 0) return false;
    const courseIds = memberships.map((m) => m.courseId);
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        userId: studentId,
        courseId: { in: courseIds },
        status: 'ACTIVE',
      },
    });
    return !!enrollment;
  }
}
