import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Headers,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from '../common/decorators/public.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../rbac/auth-user';

@Controller('auth')
@Throttle({ auth: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body(SanitizePipe) dto: RegisterDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.auth.register(dto, req.ip, userAgent);
  }

  @Public()
  @HttpCode(200)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body(SanitizePipe) dto: LoginDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.auth.login(dto, req.ip, userAgent);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.auth.refresh(dto.refreshToken, req.ip, userAgent);
  }

  @HttpCode(204)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthUser,
    @Body() dto: LogoutDto,
    @Req() req: { ip?: string; user?: AuthUser },
    @Headers('user-agent') userAgent?: string,
  ) {
    await this.auth.logout({
      userId: user.realUserId,
      jti: user.jti,
      refreshToken: dto.refreshToken,
      ip: req.ip,
      userAgent,
    });
  }

  @Public()
  @HttpCode(200)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  async forgotPassword(
    @Body(SanitizePipe) dto: ForgotPasswordDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.auth.forgotPassword(dto.email, req.ip, userAgent);
  }

  @Public()
  @HttpCode(204)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    await this.auth.resetPassword(
      dto.token,
      dto.newPassword,
      req.ip,
      userAgent,
    );
  }
}
