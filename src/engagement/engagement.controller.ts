import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { AuthUser } from '../rbac/auth-user';
import {
  EngagementDto,
  EngagementService,
  SetAttendanceDto,
} from './engagement.service';

@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Post('lessons/:id/engagement')
  record(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(SanitizePipe) dto: EngagementDto,
  ) {
    return this.engagement.record(user, id, dto);
  }

  @Get('courses/:courseId/lessons/:lessonId/attendance')
  listAttendance(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.engagement.listAttendance(user, courseId, lessonId);
  }

  @Post('courses/:courseId/lessons/:lessonId/attendance')
  setAttendance(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Body(SanitizePipe) dto: SetAttendanceDto,
  ) {
    return this.engagement.setAttendance(user, courseId, lessonId, dto);
  }
}
