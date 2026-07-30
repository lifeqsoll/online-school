import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RefreshTokenService } from '../refresh-token.service';
import { AccessTokenPayload } from '../types/jwt-payload';
import { AuthUser } from '../../rbac/auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwtAccessSecret'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    if (await this.refreshTokens.isAccessBlacklisted(payload.jti)) {
      throw new UnauthorizedException('Token revoked');
    }

    const realUserId = payload.sub;
    const effectiveId = payload.imp?.targetUserId ?? payload.sub;

    const realUser = await this.prisma.user.findUnique({
      where: { id: realUserId },
    });
    const effectiveUser =
      effectiveId === realUserId
        ? realUser
        : await this.prisma.user.findUnique({ where: { id: effectiveId } });

    if (!realUser?.isActive || !effectiveUser?.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: effectiveUser.id,
      realUserId: realUser.id,
      globalRole: effectiveUser.globalRole,
      realGlobalRole: realUser.globalRole,
      jti: payload.jti,
      impersonation: payload.imp ?? null,
    };
  }
}
