import { IsString, MinLength } from 'class-validator';

export class ImpersonateDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}
