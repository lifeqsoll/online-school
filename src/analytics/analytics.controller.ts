import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../rbac/auth-user';
import { AnalyticsService } from './analytics.service';

@Controller('courses/:courseId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('radar/me')
  radarMe(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ) {
    return this.analytics.radarMe(user, courseId);
  }

  @Get('radar/:userId')
  radarUser(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Param('userId') userId: string,
  ) {
    return this.analytics.radarUser(user, courseId, userId);
  }

  @Get('cold-lessons')
  cold(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ) {
    return this.analytics.coldLessons(user, courseId);
  }

  @Get('struggling-topics')
  struggling(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ) {
    return this.analytics.strugglingTopics(user, courseId);
  }

  @Get('graph')
  graph(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ) {
    return this.analytics.graph(user, courseId);
  }
}
