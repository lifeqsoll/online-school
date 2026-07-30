import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { AuthUser } from '../rbac/auth-user';
import { CourseModulesService } from './course-modules.service';
import { CreateModuleDto, UpdateModuleDto } from './dto/module.dto';

@Controller()
export class CourseModulesController {
  constructor(private readonly modules: CourseModulesService) {}

  @Post('courses/:courseId/modules')
  create(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Body(SanitizePipe) dto: CreateModuleDto,
  ) {
    return this.modules.create(user, courseId, dto);
  }

  @Patch('modules/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(SanitizePipe) dto: UpdateModuleDto,
  ) {
    return this.modules.update(user, id, dto);
  }
}
