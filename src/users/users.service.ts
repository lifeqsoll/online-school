import { Injectable, NotFoundException } from '@nestjs/common';
import { CryptoService } from '../common/crypto/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly auth: AuthService,
  ) {}

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.auth.toPublicUser(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        firstNameEnc:
          dto.firstName !== undefined
            ? this.crypto.encrypt(dto.firstName)
            : undefined,
        lastNameEnc:
          dto.lastName !== undefined
            ? this.crypto.encrypt(dto.lastName)
            : undefined,
      },
    });
    return this.auth.toPublicUser(user);
  }

  async listForAdmin() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return users.map((u) => this.auth.toPublicUser(u));
  }
}
