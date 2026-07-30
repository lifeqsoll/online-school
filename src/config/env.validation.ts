import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsString()
  PORT?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  ENCRYPTION_KEY!: string;

  @IsString()
  @IsNotEmpty()
  EMAIL_HMAC_KEY!: string;

  @IsEmail()
  ADMIN_EMAIL!: string;

  @IsString()
  @MinLength(8)
  ADMIN_PASSWORD!: string;

  @IsOptional()
  @IsBooleanString()
  DEV_EXPOSE_RESET_TOKEN?: string;

  @IsOptional()
  @IsString()
  PAYMENT_PROVIDER?: string;

  @IsOptional()
  @IsString()
  PAYMENT_RETURN_URL?: string;

  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  S3_REGION?: string;

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  S3_FORCE_PATH_STYLE?: string;

  @IsOptional()
  @IsString()
  S3_SIGNED_URL_TTL_SEC?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }
  return validated;
}
