/**
 * Admin seed — run after Docker + migrate:
 *   npx prisma db seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, GlobalRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { createCipheriv, createHmac, randomBytes } from 'crypto';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function decodeKey(value: string, name: string): Buffer {
  const buf = Buffer.from(value, 'base64');
  if (buf.length !== 32) {
    throw new Error(`${name} must be base64-encoded 32 bytes`);
  }
  return buf;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function emailBlindIndex(email: string, hmacKey: Buffer): string {
  return createHmac('sha256', hmacKey)
    .update(normalizeEmail(email))
    .digest('hex');
}

async function main() {
  const connectionString = requireEnv('DATABASE_URL');
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const encryptionKey = decodeKey(requireEnv('ENCRYPTION_KEY'), 'ENCRYPTION_KEY');
  const emailHmacKey = decodeKey(requireEnv('EMAIL_HMAC_KEY'), 'EMAIL_HMAC_KEY');
  const email = requireEnv('ADMIN_EMAIL');
  const password = requireEnv('ADMIN_PASSWORD');

  const emailHash = emailBlindIndex(email, emailHmacKey);
  const emailEnc = encrypt(normalizeEmail(email), encryptionKey);
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.user.upsert({
    where: { emailHash },
    create: {
      emailEnc,
      emailHash,
      passwordHash,
      globalRole: GlobalRole.ADMIN,
      isActive: true,
    },
    update: {
      emailEnc,
      passwordHash,
      globalRole: GlobalRole.ADMIN,
      isActive: true,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Admin seeded for ${normalizeEmail(email)}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
