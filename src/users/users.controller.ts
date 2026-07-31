import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { MAX_UPLOAD_BYTES } from '../files/files.mime';
import { AuthUser } from '../rbac/auth-user';
import {
  ConfirmEmailChangeDto,
  RequestEmailChangeDto,
} from './dto/email-change.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getById(user.id);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body(SanitizePipe) dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(user.id, dto);
  }

  @Post('me/email/request')
  requestEmailChange(
    @CurrentUser() user: AuthUser,
    @Body(SanitizePipe) dto: RequestEmailChangeDto,
  ) {
    return this.users.requestEmailChange(user.id, dto.newEmail);
  }

  @Post('me/email/confirm')
  confirmEmailChange(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    return this.users.confirmEmailChange(user.id, dto.code);
  }

  @Post('me/email/cancel')
  cancelEmailChange(@CurrentUser() user: AuthUser) {
    return this.users.cancelEmailChange(user.id);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.users.uploadAvatar(user.id, file);
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.users.removeAvatar(user.id);
  }
}
