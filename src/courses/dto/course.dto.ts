import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class AssignCuratorDto {
  @IsString()
  userId!: string;
}
