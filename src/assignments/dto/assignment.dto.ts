import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AssignmentResponseMode,
  AssignmentScope,
  QuestionType,
  ShortMatch,
} from '@prisma/client';

export class QuestionDto {
  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsString()
  @MaxLength(5000)
  prompt!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  points?: number;

  @IsOptional()
  options?: { id: string; text: string }[];

  @IsOptional()
  correctKeys?: string[];

  @IsOptional()
  @IsEnum(ShortMatch)
  shortMatch?: ShortMatch;

  @IsOptional()
  @IsNumber()
  numberTolerance?: number;

  /** CHOICE: allow selecting multiple options */
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  /** OPEN: max answer length (default 500) */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAnswerLength?: number;
}

export class CreateAssignmentDto {
  @IsEnum(AssignmentScope)
  scope!: AssignmentScope;

  @IsOptional()
  @IsString()
  lessonId?: string;

  @IsOptional()
  @IsString()
  moduleId?: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsInt()
  @Min(0)
  maxXp!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsEnum(AssignmentResponseMode)
  responseMode?: AssignmentResponseMode;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions?: QuestionDto[];
}

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxXp?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsEnum(AssignmentResponseMode)
  responseMode?: AssignmentResponseMode;
}

export class ReplaceQuestionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];
}
