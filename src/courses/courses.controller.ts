import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
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
  list(@Req() req: { user?: AuthUser }) {
    return this.courses.list(req.user);
  }

  @Get(':idOrSlug')
  get(@Param('idOrSlug') idOrSlug: string) {
    return this.courses.get(idOrSlug);
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

  @Post(':id/curators')
  assignCurator(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignCuratorDto,
  ) {
    return this.courses.assignCurator(user, id, dto.userId);
  }
}
