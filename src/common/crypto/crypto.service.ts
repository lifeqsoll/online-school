import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from 'crypto';

@Injectable()
export class CryptoService {
  private readonly encryptionKey: Buffer;
  private readonly emailHmacKey: Buffer;

  constructor(private readonly config: ConfigService) {
    this.encryptionKey = this.decodeKey(
      this.config.getOrThrow<string>('encryptionKey'),
      'ENCRYPTION_KEY',
    );
    this.emailHmacKey = this.decodeKey(
      this.config.getOrThrow<string>('emailHmacKey'),
      'EMAIL_HMAC_KEY',
    );
  }

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [version, ivB64, tagB64, dataB64] = payload.split(':');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
      throw new Error('Invalid ciphertext format');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  emailBlindIndex(email: string): string {
    const normalized = this.normalizeEmail(email);
    return createHmac('sha256', this.emailHmacKey)
      .update(normalized)
      .digest('hex');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private decodeKey(value: string, name: string): Buffer {
    const buf = Buffer.from(value, 'base64');
    if (buf.length !== 32) {
      throw new Error(`${name} must be a base64-encoded 32-byte key`);
    }
    return buf;
  }
}
