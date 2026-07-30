import { IsEnum, IsString } from 'class-validator';
import { StoredFileOwnerType } from '@prisma/client';

export class UploadFileDto {
  @IsEnum(StoredFileOwnerType)
  ownerType!: StoredFileOwnerType;

  @IsString()
  ownerId!: string;
}
