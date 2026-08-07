import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelEnrollmentDto {
  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
