import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { AuthUser } from '../rbac/auth-user';
import {
  NotificationsService,
  SupportBadgeChannel,
} from './notifications.service';

class CreateReminderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

class MarkSupportReadDto {
  @IsIn(['TECH', 'COURSE', 'STAFF_TECH', 'STAFF_COURSE'])
  channel!: SupportBadgeChannel;
}

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('me/notifications')
  list(
    @CurrentUser() user: AuthUser,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notifications.listMine(user, {
      unreadOnly: unreadOnly === '1' || unreadOnly === 'true',
    });
  }

  @Get('me/notifications/unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCounts(user);
  }

  @Patch('me/notifications/:id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user, id);
  }

  @Post('me/notifications/read-all')
  markAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Post('me/notifications/read-support')
  markSupport(
    @CurrentUser() user: AuthUser,
    @Body(SanitizePipe) dto: MarkSupportReadDto,
  ) {
    return this.notifications.markSupportChannelRead(user, dto.channel);
  }

  @Get('courses/:courseId/reminders')
  listReminders(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ) {
    return this.notifications.listReminders(user, courseId);
  }

  @Post('courses/:courseId/reminders')
  createReminder(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Body(SanitizePipe) dto: CreateReminderDto,
  ) {
    return this.notifications.createReminder(user, courseId, dto);
  }

  @Delete('courses/:courseId/reminders/:reminderId')
  deleteReminder(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Param('reminderId') reminderId: string,
  ) {
    return this.notifications.deleteReminder(user, courseId, reminderId);
  }
}
