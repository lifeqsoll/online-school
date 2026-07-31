import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { CourseAccessService } from '../enrollments/course-access.service';
import { CreateModuleDto, UpdateModuleDto } from './dto/module.dto';

@Injectable()
export class CourseModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  async create(actor: AuthUser, courseId: string, dto: CreateModuleDto) {
    await this.requireManage(actor, courseId);
    return this.prisma.courseModule.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        radarLabel: dto.radarLabel?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateModuleDto) {
    const mod = await this.prisma.courseModule.findUnique({ where: { id } });
    if (!mod) throw new NotFoundException('Module not found');
    await this.requireManage(actor, mod.courseId);
    return this.prisma.courseModule.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        sortOrder: dto.sortOrder,
        ...(dto.radarLabel !== undefined
          ? { radarLabel: dto.radarLabel?.trim() || null }
          : {}),
      },
    });
  }

  private async requireManage(actor: AuthUser, courseId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException('Cannot manage this course');
    }
  }
}
