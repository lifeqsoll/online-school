import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { CryptoService } from '../common/crypto/crypto.service';
import { RedisService } from '../redis/redis.service';

type RefreshSession = {
  userId: string;
  familyId: string;
  expiresAt: string;
};

@Injectable()
export class RefreshTokenService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    config: ConfigService,
  ) {
    this.ttlSeconds = config.get<number>('refreshTtlSeconds') ?? 60 * 60 * 24 * 7;
  }

  async create(userId: string): Promise<{ refreshToken: string; familyId: string }> {
    const familyId = randomUUID();
    const refreshToken = randomUUID() + randomUUID();
    await this.store(refreshToken, { userId, familyId, expiresAt: this.expiresAtIso() });
    await this.redis.set(this.familyKey(familyId), '0', this.ttlSeconds);
    await this.redis.raw.sadd(this.familyMembersKey(familyId), this.crypto.hashToken(refreshToken));
    await this.redis.raw.expire(this.familyMembersKey(familyId), this.ttlSeconds);
    return { refreshToken, familyId };
  }

  async rotate(
    oldToken: string,
  ): Promise<{ refreshToken: string; userId: string; familyId: string }> {
    const hash = this.crypto.hashToken(oldToken);
    const usedFamily = await this.redis.get(this.usedKey(hash));
    if (usedFamily) {
      await this.revokeFamily(usedFamily);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const key = this.refreshKey(hash);
    const raw = await this.redis.get(key);

    if (!raw) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = JSON.parse(raw) as RefreshSession;
    const familyRevoked = await this.redis.get(this.familyKey(session.familyId));
    if (familyRevoked === '1') {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    await this.redis.del(key);
    await this.redis.raw.srem(
      this.familyMembersKey(session.familyId),
      hash,
    );

    const refreshToken = randomUUID() + randomUUID();
    await this.store(refreshToken, {
      userId: session.userId,
      familyId: session.familyId,
      expiresAt: this.expiresAtIso(),
    });
    await this.redis.raw.sadd(
      this.familyMembersKey(session.familyId),
      this.crypto.hashToken(refreshToken),
    );
    await this.redis.raw.expire(
      this.familyMembersKey(session.familyId),
      this.ttlSeconds,
    );
    await this.redis.set(this.familyKey(session.familyId), '0', this.ttlSeconds);

    // Mark old hash as used-in-family for reuse detection
    await this.redis.set(
      this.usedKey(hash),
      session.familyId,
      this.ttlSeconds,
    );

    return {
      refreshToken,
      userId: session.userId,
      familyId: session.familyId,
    };
  }

  async revoke(token: string): Promise<void> {
    const hash = this.crypto.hashToken(token);
    const raw = await this.redis.get(this.refreshKey(hash));
    await this.redis.del(this.refreshKey(hash));
    if (!raw) return;
    const session = JSON.parse(raw) as RefreshSession;
    await this.redis.raw.srem(this.familyMembersKey(session.familyId), hash);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    // Scan refresh keys — acceptable for Foundation; optimize later with user index set.
    const stream = this.redis.raw.scanStream({
      match: 'os:refresh:*',
      count: 100,
    });
    for await (const keys of stream) {
      for (const key of keys as string[]) {
        const raw = await this.redis.get(key);
        if (!raw) continue;
        const session = JSON.parse(raw) as RefreshSession;
        if (session.userId === userId) {
          await this.revokeFamily(session.familyId);
        }
      }
    }
  }

  async blacklistAccessJti(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.redis.set(this.accessBlKey(jti), '1', ttlSeconds);
  }

  async isAccessBlacklisted(jti: string): Promise<boolean> {
    return this.redis.exists(this.accessBlKey(jti));
  }

  private async store(token: string, session: RefreshSession): Promise<void> {
    await this.redis.set(
      this.refreshKey(this.crypto.hashToken(token)),
      JSON.stringify(session),
      this.ttlSeconds,
    );
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.redis.set(this.familyKey(familyId), '1', this.ttlSeconds);
    const members = await this.redis.raw.smembers(this.familyMembersKey(familyId));
    if (members.length > 0) {
      await this.redis.del(...members.map((h) => this.refreshKey(h)));
    }
    await this.redis.del(this.familyMembersKey(familyId));
  }

  private expiresAtIso(): string {
    return new Date(Date.now() + this.ttlSeconds * 1000).toISOString();
  }

  private refreshKey(hash: string) {
    return `os:refresh:${hash}`;
  }

  private familyKey(familyId: string) {
    return `os:refresh_family:${familyId}`;
  }

  private familyMembersKey(familyId: string) {
    return `os:refresh_family_members:${familyId}`;
  }

  private usedKey(hash: string) {
    return `os:refresh_used:${hash}`;
  }

  private accessBlKey(jti: string) {
    return `os:access_bl:${jti}`;
  }
}
