import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SupportChannel } from '@prisma/client';

export class CreateSupportThreadDto {
  @IsEnum(SupportChannel)
  channel!: SupportChannel;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class PostSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
