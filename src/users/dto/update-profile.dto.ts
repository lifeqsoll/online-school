import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  /** Empty string clears nickname */
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsString()
  @MinLength(3)
  @MaxLength(24)
  @Matches(/^[a-zA-Zа-яА-ЯёЁ0-9_]+$/, {
    message: 'Nickname: letters, digits, underscore only',
  })
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;
}
