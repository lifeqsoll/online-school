import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StoredFileOwnerType } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../rbac/auth-user';
import { UploadFileDto } from './dto/upload-file.dto';
import { MAX_PNG_PDF_BYTES } from './files.mime';
import { FilesService } from './files.service';

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('files')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PNG_PDF_BYTES },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadFileDto,
  ) {
    return this.files.upload(user, body.ownerType, body.ownerId, file);
  }

  @Get('files')
  list(
    @CurrentUser() user: AuthUser,
    @Query('ownerType') ownerType: StoredFileOwnerType,
    @Query('ownerId') ownerId: string,
  ) {
    return this.files.list(user, ownerType, ownerId);
  }

  @Get('files/:id/download')
  download(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.files.download(user, id);
  }

  @Delete('files/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.files.remove(user, id);
  }
}
