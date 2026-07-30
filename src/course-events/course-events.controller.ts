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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { AuthUser } from '../rbac/auth-user';
import { CourseEventsService } from './course-events.service';
import {
  CreateCourseEventDto,
  UpdateCourseEventDto,
} from './dto/course-event.dto';

@Controller()
export class CourseEventsController {
  constructor(private readonly events: CourseEventsService) {}

  @Get('courses/:courseId/events')
  list(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.events.listCourseEvents(
      user,
      courseId,
      new Date(from),
      new Date(to),
    );
  }

  @Post('courses/:courseId/events')
  create(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Body(SanitizePipe) dto: CreateCourseEventDto,
  ) {
    return this.events.create(user, courseId, dto);
  }

  @Patch('events/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(SanitizePipe) dto: UpdateCourseEventDto,
  ) {
    return this.events.update(user, id, dto);
  }

  @Delete('events/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.events.remove(user, id);
  }

  @Get('me/calendar')
  mine(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.events.calendarMine(user, new Date(from), new Date(to));
  }
}
