import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { IMAGE_MIMES, MAX_PNG_PDF_BYTES } from '../files/files.mime';
import { MAIL_SENDER, MailSender } from '../mail/mail.sender';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.auth.toPublicUser(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const data: Prisma.UserUpdateInput = {};

    if (dto.firstName !== undefined) {
      data.firstNameEnc = this.crypto.encrypt(dto.firstName);
    }
    if (dto.lastName !== undefined) {
      data.lastNameEnc = this.crypto.encrypt(dto.lastName);
    }
    if (dto.bio !== undefined) {
      data.bio = dto.bio.trim() || null;
    }
    if (dto.nickname !== undefined) {
      const nick = dto.nickname.trim();
      data.nickname = nick.length ? nick : null;
    }
    if (dto.notifyHwSubmitted !== undefined) {
      const existing = await this.prisma.user.findUnique({
        where: { id },
        select: { globalRole: true },
      });
      if (existing?.globalRole === 'ADMIN') {
        data.notifyHwSubmitted = dto.notifyHwSubmitted;
      }
    }
    if (dto.notifyCourseReviews !== undefined) {
      const existing = await this.prisma.user.findUnique({
        where: { id },
        select: { globalRole: true },
      });
      if (existing?.globalRole === 'ADMIN') {
        data.notifyCourseReviews = dto.notifyCourseReviews;
      }
    }
    if (dto.notifySupportTech !== undefined) {
      const existing = await this.prisma.user.findUnique({
        where: { id },
        select: { globalRole: true },
      });
      if (existing?.globalRole === 'ADMIN') {
        data.notifySupportTech = dto.notifySupportTech;
      }
    }
    if (dto.notifySupportCourse !== undefined) {
      const existing = await this.prisma.user.findUnique({
        where: { id },
        select: { globalRole: true },
      });
      if (existing?.globalRole === 'ADMIN') {
        data.notifySupportCourse = dto.notifySupportCourse;
      }
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
      });
      return this.auth.toPublicUser(user);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Nickname already taken');
      }
      throw e;
    }
  }

  async requestEmailChange(id: string, newEmailRaw: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const newEmail = this.crypto.normalizeEmail(newEmailRaw);
    const newHash = this.crypto.emailBlindIndex(newEmail);
    const current = this.crypto.decrypt(user.emailEnc);

    if (newEmail === current) {
      throw new BadRequestException('This is already your email');
    }

    const taken = await this.prisma.user.findUnique({
      where: { emailHash: newHash },
    });
    if (taken) {
      throw new ConflictException('Email already registered');
    }

    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.emailVerificationCode.updateMany({
        where: { userId: id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.emailVerificationCode.create({
        data: {
          userId: id,
          codeHash: this.crypto.hashToken(code),
          expiresAt,
        },
      }),
      this.prisma.user.update({
        where: { id },
        data: {
          pendingEmailEnc: this.crypto.encrypt(newEmail),
          pendingEmailHash: newHash,
        },
      }),
    ]);

    await this.mail.sendEmailChangeCode(current, code);

    const result: {
      message: string;
      pendingEmail: string;
      code?: string;
    } = {
      message: 'Verification code sent to your current email',
      pendingEmail: newEmail,
    };
    if (this.config.get<boolean>('devExposeResetToken')) {
      result.code = code;
    }
    return result;
  }

  async confirmEmailChange(id: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.pendingEmailEnc || !user.pendingEmailHash) {
      throw new BadRequestException('No email change pending');
    }

    const record = await this.prisma.emailVerificationCode.findFirst({
      where: {
        userId: id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        codeHash: this.crypto.hashToken(code.trim()),
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    const stillTaken = await this.prisma.user.findFirst({
      where: {
        emailHash: user.pendingEmailHash,
        id: { not: id },
      },
    });
    if (stillTaken) {
      throw new ConflictException('Email already registered');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      return tx.user.update({
        where: { id },
        data: {
          emailEnc: user.pendingEmailEnc!,
          emailHash: user.pendingEmailHash!,
          pendingEmailEnc: null,
          pendingEmailHash: null,
          emailVerifiedAt: new Date(),
        },
      });
    });

    return this.auth.toPublicUser(updated);
  }

  async cancelEmailChange(id: string) {
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        pendingEmailEnc: null,
        pendingEmailHash: null,
      },
    });
    await this.prisma.emailVerificationCode.updateMany({
      where: { userId: id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return this.auth.toPublicUser(updated);
  }

  async uploadAvatar(id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    const mime = file.mimetype || '';
    if (!IMAGE_MIMES.has(mime)) {
      throw new BadRequestException('Allowed: PNG, JPEG, WebP');
    }
    if (file.size > MAX_PNG_PDF_BYTES) {
      throw new BadRequestException('Avatar exceeds 20 MB limit');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const ext =
      mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const key = `users/${id}/avatar/${randomUUID()}.${ext}`;

    await this.storage.uploadObject(key, file.buffer, mime);

    if (user.avatarStorageKey) {
      try {
        await this.storage.deleteObject(user.avatarStorageKey);
      } catch {
        /* ignore old key cleanup */
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { avatarStorageKey: key },
    });
    return this.auth.toPublicUser(updated);
  }

  async removeAvatar(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.avatarStorageKey) {
      try {
        await this.storage.deleteObject(user.avatarStorageKey);
      } catch {
        /* ignore */
      }
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { avatarStorageKey: null },
    });
    return this.auth.toPublicUser(updated);
  }

  async listForAdmin() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return Promise.all(users.map((u) => this.auth.toPublicUser(u)));
  }
}
