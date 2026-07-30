import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../rbac/auth-user';
import { AssignmentsService } from './assignments.service';
import {
  CreateAssignmentDto,
  ReplaceQuestionsDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';

@Controller()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post('courses/:courseId/assignments')
  create(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assignments.create(user, courseId, dto);
  }

  @Get('courses/:courseId/assignments')
  list(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ) {
    return this.assignments.list(user, courseId);
  }

  @Get('assignments/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assignments.get(user, id);
  }

  @Patch('assignments/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignments.update(user, id, dto);
  }

  @Put('assignments/:id/questions')
  replaceQuestions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReplaceQuestionsDto,
  ) {
    return this.assignments.replaceQuestions(user, id, dto);
  }
}
