import { IsString } from 'class-validator';

export class MockConfirmDto {
  @IsString()
  paymentId!: string;
}
