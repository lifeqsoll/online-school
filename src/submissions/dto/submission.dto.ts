import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaveAnswerDto {
  @IsString()
  questionId!: string;

  @Allow()
  value!: unknown;
}

export class SaveAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveAnswerDto)
  answers!: SaveAnswerDto[];
}

export class GradeAnswerDto {
  @IsString()
  questionId!: string;

  @IsInt()
  @Min(0)
  pointsAwarded!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;
}

export class GradeSubmissionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradeAnswerDto)
  answers!: GradeAnswerDto[];

  /** Used when assignment has no OPEN questions (e.g. FILE-only). */
  @IsOptional()
  @IsInt()
  @Min(0)
  scoreXp?: number;
}
