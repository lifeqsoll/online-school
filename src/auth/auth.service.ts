import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, GlobalRole, User } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { MAIL_SENDER, MailSender } from '../mail/mail.sender';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenService } from './refresh-token.service';
import { AccessTokenPayload, JwtImpersonation } from './types/jwt-payload';

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  async register(dto: RegisterDto, ip?: string, userAgent?: string) {
    const email = this.crypto.normalizeEmail(dto.email);
    const emailHash = this.crypto.emailBlindIndex(email);
    const existing = await this.prisma.user.findUnique({ where: { emailHash } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const user = await this.prisma.user.create({
      data: {
        emailEnc: this.crypto.encrypt(email),
        emailHash,
        passwordHash: await this.crypto.hashPassword(dto.password),
        firstNameEnc: dto.firstName
          ? this.crypto.encrypt(dto.firstName)
          : null,
        lastNameEnc: dto.lastName ? this.crypto.encrypt(dto.lastName) : null,
        globalRole: GlobalRole.STUDENT,
      },
    });

    await this.audit.append({
      action: AuditAction.USER_CREATE,
      actorId: user.id,
      targetId: user.id,
      ip,
      userAgent,
    });

    const tokens = await this.issueTokens(user);
    await this.audit.append({
      action: AuditAction.LOGIN,
      actorId: user.id,
      ip,
      userAgent,
    });

    return {
      user: await this.toPublicUser(user),
      ...tokens,
    };
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const emailHash = this.crypto.emailBlindIndex(dto.email);
    const user = await this.prisma.user.findUnique({ where: { emailHash } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await this.crypto.verifyPassword(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user);
    await this.audit.append({
      action: AuditAction.LOGIN,
      actorId: user.id,
      ip,
      userAgent,
    });

    return {
      user: await this.toPublicUser(user),
      ...tokens,
    };
  }

  async refresh(refreshToken: string, ip?: string, userAgent?: string) {
    const rotated = await this.refreshTokens.rotate(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.signAccessToken(user);
    await this.audit.append({
      action: AuditAction.REFRESH,
      actorId: user.id,
      ip,
      userAgent,
    });

    return {
      accessToken,
      refreshToken: rotated.refreshToken,
    };
  }

  async logout(params: {
    userId: string;
    jti?: string;
    refreshToken?: string;
    accessExp?: number;
    ip?: string;
    userAgent?: string;
  }) {
    if (params.refreshToken) {
      await this.refreshTokens.revoke(params.refreshToken);
    }
    if (params.jti && params.accessExp) {
      const ttl = Math.max(1, params.accessExp - Math.floor(Date.now() / 1000));
      await this.refreshTokens.blacklistAccessJti(params.jti, ttl);
    }
    await this.audit.append({
      action: AuditAction.LOGOUT,
      actorId: params.userId,
      ip: params.ip,
      userAgent: params.userAgent,
    });
  }

  async forgotPassword(emailRaw: string, ip?: string, userAgent?: string) {
    const generic = {
      message: 'If the email exists, a reset link was sent',
    };
    const emailHash = this.crypto.emailBlindIndex(emailRaw);
    const user = await this.prisma.user.findUnique({ where: { emailHash } });
    if (!user || !user.isActive) {
      return generic;
    }

    const token = randomBytes(32).toString('hex');
    const ttlMinutes =
      this.config.get<number>('passwordResetTtlMinutes') ?? 45;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.crypto.hashToken(token),
        expiresAt,
      },
    });

    const email = this.crypto.decrypt(user.emailEnc);
    await this.mail.sendPasswordReset(email, token);

    await this.audit.append({
      action: AuditAction.PASSWORD_RESET_REQUEST,
      actorId: user.id,
      targetId: user.id,
      ip,
      userAgent,
    });

    if (this.config.get<boolean>('devExposeResetToken')) {
      return { ...generic, resetToken: token };
    }
    return generic;
  }

  async resetPassword(
    token: string,
    newPassword: string,
    ip?: string,
    userAgent?: string,
  ) {
    const tokenHash = this.crypto.hashToken(token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!record) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await this.crypto.hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    await this.refreshTokens.revokeAllForUser(record.userId);
    await this.audit.append({
      action: AuditAction.PASSWORD_RESET_COMPLETE,
      actorId: record.userId,
      targetId: record.userId,
      ip,
      userAgent,
    });
  }

  async signAccessToken(user: User, imp?: JwtImpersonation): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: imp?.impersonatorId ?? user.id,
      globalRole: user.globalRole,
      jti: randomUUID(),
      ...(imp ? { imp } : {}),
    };
    return this.jwt.signAsync(payload);
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const accessToken = await this.signAccessToken(user);
    const { refreshToken } = await this.refreshTokens.create(user.id);
    return { accessToken, refreshToken };
  }

  async toPublicUser(user: User) {
    let avatarUrl: string | null = null;
    if (user.avatarStorageKey) {
      try {
        avatarUrl = await this.storage.getSignedGetUrl(user.avatarStorageKey);
      } catch {
        avatarUrl = null;
      }
    }
    return {
      id: user.id,
      email: this.crypto.decrypt(user.emailEnc),
      firstName: user.firstNameEnc
        ? this.crypto.decrypt(user.firstNameEnc)
        : null,
      lastName: user.lastNameEnc ? this.crypto.decrypt(user.lastNameEnc) : null,
      nickname: user.nickname ?? null,
      bio: user.bio ?? null,
      avatarUrl,
      pendingEmail: user.pendingEmailEnc
        ? this.crypto.decrypt(user.pendingEmailEnc)
        : null,
      globalRole: user.globalRole,
      isActive: user.isActive,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      ...(user.globalRole === 'ADMIN'
        ? {
            notifyHwSubmitted: user.notifyHwSubmitted,
            notifyCourseReviews: user.notifyCourseReviews,
            notifySupportTech: user.notifySupportTech,
            notifySupportCourse: user.notifySupportCourse,
          }
        : {}),
    };
  }
}
