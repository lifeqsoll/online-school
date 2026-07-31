import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { LessonType } from '@prisma/client';

export class CreateLessonDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsEnum(LessonType)
  type?: LessonType;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  scheduledAt?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl({ require_protocol: true })
  meetingUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  contentUnlockDaysBefore?: number;

  @IsOptional()
  @IsBoolean()
  contentUnlockedForAll?: boolean;
}

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsEnum(LessonType)
  type?: LessonType;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  /** ISO datetime; null clears schedule and removes calendar event */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  scheduledAt?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl({ require_protocol: true })
  meetingUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  contentUnlockDaysBefore?: number;

  @IsOptional()
  @IsBoolean()
  contentUnlockedForAll?: boolean;
}

export class ExternalVideoDto {
  @IsUrl({ require_protocol: true })
  url!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;
}

export class LessonContentGrantDto {
  @IsString()
  userId!: string;
}
