import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { MAX_UPLOAD_BYTES } from '../files/files.mime';
import { AuthUser } from '../rbac/auth-user';
import { CoursesService } from './courses.service';
import {
  AssignCuratorDto,
  CreateCourseDto,
  UpdateCourseDto,
} from './dto/course.dto';

@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Public()
  @Get()
  list(
    @CurrentUser() user: AuthUser | undefined,
    @Query('managedOnly') managedOnly?: string,
  ) {
    return this.courses.list(user, {
      managedOnly: managedOnly === '1' || managedOnly === 'true',
    });
  }

  @Public()
  @Get(':idOrSlug')
  get(
    @CurrentUser() user: AuthUser | undefined,
    @Param('idOrSlug') idOrSlug: string,
  ) {
    return this.courses.getForViewer(user, idOrSlug);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(SanitizePipe) dto: CreateCourseDto,
  ) {
    return this.courses.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(SanitizePipe) dto: UpdateCourseDto,
  ) {
    return this.courses.update(user, id, dto);
  }

  @Post(':id/cover')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  uploadCover(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.courses.uploadCover(user, id, file);
  }

  @Delete(':id/cover')
  removeCover(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.removeCover(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.remove(user, id);
  }

  @Get(':id/curators')
  listCurators(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.listCurators(user, id);
  }

  @Post(':id/curators')
  assignCurator(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignCuratorDto,
  ) {
    return this.courses.assignCurator(user, id, dto.userId);
  }

  @Delete(':id/curators/:userId')
  removeCurator(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.courses.removeCurator(user, id, userId);
  }
}
