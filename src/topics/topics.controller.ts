import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../rbac/auth-user';
import { TopicsService } from './topics.service';

class CreateTopicDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

class UpdateTopicDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

class TopicIdsDto {
  @IsArray()
  @IsString({ each: true })
  topicIds!: string[];
}

@Controller()
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Post('courses/:courseId/topics')
  create(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Body() dto: CreateTopicDto,
  ) {
    return this.topics.create(user, courseId, dto);
  }

  @Get('courses/:courseId/topics')
  list(@CurrentUser() user: AuthUser, @Param('courseId') courseId: string) {
    return this.topics.list(user, courseId);
  }

  @Patch('topics/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTopicDto,
  ) {
    return this.topics.update(user, id, dto);
  }

  @Delete('topics/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.topics.remove(user, id);
  }

  @Put('lessons/:id/topics')
  setLesson(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TopicIdsDto,
  ) {
    return this.topics.setLessonTopics(user, id, dto.topicIds);
  }

  @Put('assignments/:id/topics')
  setAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TopicIdsDto,
  ) {
    return this.topics.setAssignmentTopics(user, id, dto.topicIds);
  }
}
