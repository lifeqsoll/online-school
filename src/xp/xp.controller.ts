import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../rbac/auth-user';
import { XpService } from './xp.service';

@Controller('courses/:courseId')
export class XpController {
  constructor(private readonly xp: XpService) {}

  @Get('xp/me')
  me(@CurrentUser() user: AuthUser, @Param('courseId') courseId: string) {
    return this.xp.getMyXp(user, courseId);
  }

  @Get('leaderboard')
  leaderboard(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Number(limit) : 20;
    return this.xp.leaderboard(user, courseId, Number.isFinite(n) ? n : 20);
  }
}
