import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { AuthUser } from '../rbac/auth-user';
import { CancelEnrollmentDto } from './dto/cancel.dto';
import { GrantEnrollDto } from './dto/grant.dto';
import { EnrollmentsService } from './enrollments.service';

@Controller()
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post('courses/:id/enroll')
  enroll(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.enrollments.enrollFree(user, id);
  }

  @Post('courses/:id/grants')
  grant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: GrantEnrollDto,
  ) {
    return this.enrollments.grant(user, id, dto.userId);
  }

  @Post('courses/:courseId/enrollments/:userId/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Param('userId') userId: string,
    @Body(SanitizePipe) dto: CancelEnrollmentDto,
  ) {
    return this.enrollments.cancelEnrollment(user, courseId, userId, dto);
  }

  @Get('me/enrollments')
  mine(@CurrentUser() user: AuthUser) {
    return this.enrollments.listMine(user.id);
  }

  @Get('courses/:id/enrollments')
  listForCourse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.enrollments.listForCourse(user, id);
  }
}
