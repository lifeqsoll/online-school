import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdjustXpDto {
  @IsInt()
  @Min(-5000)
  @Max(5000)
  delta!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class RadarBonusDto {
  @IsString()
  moduleId!: string;

  @IsInt()
  @Min(-100)
  @Max(100)
  delta!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class OpsCompleteLessonDto {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class SetGlobalRoleDto {
  @IsString()
  @MinLength(1)
  globalRole!: 'STUDENT' | 'ADMIN' | 'SUPPORT';
}
