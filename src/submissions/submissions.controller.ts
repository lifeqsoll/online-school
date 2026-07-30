import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../rbac/auth-user';
import {
  GradeSubmissionDto,
  SaveAnswersDto,
} from './dto/submission.dto';
import { SubmissionsService } from './submissions.service';

@Controller()
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post('assignments/:id/submissions')
  create(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.submissions.createAttempt(user, id);
  }

  @Patch('submissions/:id')
  save(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SaveAnswersDto,
  ) {
    return this.submissions.saveAnswers(user, id, dto);
  }

  @Post('submissions/:id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.submissions.submit(user, id);
  }

  @Get('assignments/:id/submissions/me')
  listMine(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.submissions.listMine(user, id);
  }

  @Get('courses/:courseId/submissions')
  listCourse(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Query('status') status?: SubmissionStatus,
  ) {
    return this.submissions.listCourse(user, courseId, status);
  }

  @Post('submissions/:id/grade')
  grade(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: GradeSubmissionDto,
  ) {
    return this.submissions.grade(user, id, dto);
  }
}
