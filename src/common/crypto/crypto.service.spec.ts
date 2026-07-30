import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes } from 'crypto';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let crypto: CryptoService;

  const encryptionKey = randomBytes(32).toString('base64');
  const emailHmacKey = randomBytes(32).toString('base64');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              encryptionKey,
              emailHmacKey,
            }),
          ],
        }),
      ],
      providers: [CryptoService],
    }).compile();

    crypto = moduleRef.get(CryptoService);
  });

  it('hashes and verifies password', async () => {
    const hash = await crypto.hashPassword('Secret123!');
    expect(hash).not.toContain('Secret123!');
    expect(await crypto.verifyPassword(hash, 'Secret123!')).toBe(true);
    expect(await crypto.verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('encrypt/decrypt round-trip', () => {
    const enc = crypto.encrypt('user@example.com');
    expect(enc.startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(enc)).toBe('user@example.com');
  });

  it('email blind index is stable and normalized', () => {
    const a = crypto.emailBlindIndex('  Foo@Bar.COM ');
    const b = crypto.emailBlindIndex('foo@bar.com');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('hashToken is sha256 hex', () => {
    const token = 'abc';
    expect(crypto.hashToken(token)).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
  });
});
