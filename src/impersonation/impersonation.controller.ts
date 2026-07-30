import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../rbac/auth-user';
import { ImpersonateDto } from './dto/impersonate.dto';
import { ImpersonationService } from './impersonation.service';

@Controller('auth')
export class ImpersonationController {
  constructor(private readonly impersonation: ImpersonationService) {}

  @Post('impersonate')
  start(
    @CurrentUser() user: AuthUser,
    @Body() dto: ImpersonateDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.impersonation.start(user, dto.userId, req.ip, userAgent);
  }

  @Post('impersonate/stop')
  stop(
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.impersonation.stop(user, req.ip, userAgent);
  }
}
