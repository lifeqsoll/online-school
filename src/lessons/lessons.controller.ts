import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { AuthUser } from '../rbac/auth-user';
import {
  CreateLessonDto,
  ExternalVideoDto,
  UpdateLessonDto,
} from './dto/lesson.dto';
import { LessonsService } from './lessons.service';

@Controller()
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Post('modules/:moduleId/lessons')
  create(
    @CurrentUser() user: AuthUser,
    @Param('moduleId') moduleId: string,
    @Body(SanitizePipe) dto: CreateLessonDto,
  ) {
    return this.lessons.create(user, moduleId, dto);
  }

  @Patch('lessons/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(SanitizePipe) dto: UpdateLessonDto,
  ) {
    return this.lessons.update(user, id, dto);
  }

  @Delete('lessons/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lessons.remove(user, id);
  }

  @Patch('lessons/:id/video/external')
  setExternal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ExternalVideoDto,
  ) {
    return this.lessons.setExternalVideo(user, id, dto);
  }

  @Post('lessons/:id/video/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 500 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.lessons.setUploadedVideo(user, id, file);
  }

  @Get('lessons/:id/playback')
  playback(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lessons.playback(user, id);
  }
}
