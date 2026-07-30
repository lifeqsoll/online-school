import { IsString } from 'class-validator';

export class GrantEnrollDto {
  @IsString()
  userId!: string;
}
