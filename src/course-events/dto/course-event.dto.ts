import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { CourseEventType } from '@prisma/client';

export class CreateCourseEventDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(CourseEventType)
  type!: CourseEventType;

  @IsISO8601()
  startsAt!: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsUrl()
  meetingUrl?: string;

  @IsOptional()
  @IsString()
  lessonId?: string;

  @IsOptional()
  @IsString()
  assignmentId?: string;
}

export class UpdateCourseEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(CourseEventType)
  type?: CourseEventType;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @IsUrl()
  meetingUrl?: string | null;

  @IsOptional()
  @IsString()
  lessonId?: string | null;

  @IsOptional()
  @IsString()
  assignmentId?: string | null;
}
