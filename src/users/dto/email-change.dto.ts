import { IsEmail, IsString, Length } from 'class-validator';

export class RequestEmailChangeDto {
  @IsEmail()
  newEmail!: string;
}

export class ConfirmEmailChangeDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
