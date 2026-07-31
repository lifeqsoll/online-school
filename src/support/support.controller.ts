import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { AuthUser } from '../rbac/auth-user';
import {
  CreateSupportThreadDto,
  PostSupportMessageDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('threads')
  create(
    @CurrentUser() user: AuthUser,
    @Body(SanitizePipe) dto: CreateSupportThreadDto,
  ) {
    return this.support.create(user, dto);
  }

  @Get('threads/mine')
  listMine(@CurrentUser() user: AuthUser) {
    return this.support.listMine(user);
  }

  @Get('threads/inbox')
  listInbox(@CurrentUser() user: AuthUser) {
    return this.support.listInbox(user);
  }

  @Get('threads/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.get(user, id);
  }

  @Post('threads/:id/messages')
  postMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(SanitizePipe) dto: PostSupportMessageDto,
  ) {
    return this.support.postMessage(user, id, dto);
  }

  @Patch('threads/:id/close')
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.close(user, id);
  }
}
