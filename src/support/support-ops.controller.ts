import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GlobalRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { AuthUser } from '../rbac/auth-user';
import { Roles } from '../rbac/decorators/roles.decorator';
import { RolesGuard } from '../rbac/guards/roles.guard';
import {
  AdjustXpDto,
  OpsCompleteLessonDto,
  RadarBonusDto,
  SetGlobalRoleDto,
} from './dto/support-ops.dto';
import { SupportOpsService } from './support-ops.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

@Controller()
export class SupportOpsController {
  constructor(
    private readonly ops: SupportOpsService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('support/users/search')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN, GlobalRole.SUPPORT)
  search(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    return this.ops.searchUsers(user, q ?? '');
  }

  @Get('support/users/:id')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN, GlobalRole.SUPPORT)
  card(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ops.getStudentCard(user, id);
  }

  @Get('support/courses/:courseId/modules')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN, GlobalRole.SUPPORT)
  modules(@CurrentUser() user: AuthUser, @Param('courseId') courseId: string) {
    return this.ops.listCourseModules(user, courseId);
  }

  @Post('support/users/:id/courses/:courseId/xp')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN, GlobalRole.SUPPORT)
  xp(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('courseId') courseId: string,
    @Body(SanitizePipe) dto: AdjustXpDto,
  ) {
    return this.ops.adjustXp(user, id, courseId, dto);
  }

  @Post('support/users/:id/lessons/:lessonId/grant')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN, GlobalRole.SUPPORT)
  grant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.ops.grantLesson(user, id, lessonId);
  }

  @Post('support/users/:id/lessons/:lessonId/complete')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN, GlobalRole.SUPPORT)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Body(SanitizePipe) dto: OpsCompleteLessonDto,
  ) {
    return this.ops.setLessonComplete(
      user,
      id,
      lessonId,
      dto.completed !== false,
    );
  }

  @Post('support/users/:id/lessons/:lessonId/attendance')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN, GlobalRole.SUPPORT)
  attendance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Body(SanitizePipe) dto: OpsCompleteLessonDto,
  ) {
    return this.ops.setAttendance(
      user,
      id,
      lessonId,
      dto.completed !== false,
    );
  }

  @Post('support/users/:id/courses/:courseId/radar-bonus')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN, GlobalRole.SUPPORT)
  radar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('courseId') courseId: string,
    @Body(SanitizePipe) dto: RadarBonusDto,
  ) {
    return this.ops.addRadarBonus(user, id, courseId, dto);
  }

  @Post('support/users/:id/password-reset')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN, GlobalRole.SUPPORT)
  reset(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.ops.triggerPasswordReset(user, id, req.ip);
  }

  @Get('admin/staff/ratings')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN)
  staffRatings(@CurrentUser() user: AuthUser) {
    return this.ops.listStaffRatings(user);
  }

  @Get('admin/staff/:userId/ratings')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN)
  agentRatings(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
  ) {
    return this.ops.listAgentRatings(user, userId);
  }

  @Patch('admin/users/:id/role')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN)
  async setRole(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(SanitizePipe) dto: SetGlobalRoleDto,
  ) {
    if (!['STUDENT', 'ADMIN', 'SUPPORT'].includes(dto.globalRole)) {
      throw new BadRequestException('Invalid role');
    }
    if (id === actor.realUserId && dto.globalRole !== 'ADMIN') {
      throw new ForbiddenException('Cannot demote yourself');
    }
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { globalRole: dto.globalRole as GlobalRole },
    });
    return this.users.getById(updated.id);
  }
}
