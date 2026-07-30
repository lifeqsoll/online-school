import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../rbac/auth-user';
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

  @Get('me/enrollments')
  mine(@CurrentUser() user: AuthUser) {
    return this.enrollments.listMine(user.id);
  }
}
