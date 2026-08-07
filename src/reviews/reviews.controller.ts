import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { AuthUser } from '../rbac/auth-user';
import {
  CreateReviewDto,
  ModerateReviewDto,
  ReviewsService,
  UpdateReviewDto,
} from './reviews.service';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('courses/:courseId/reviews')
  listApproved(@Param('courseId') courseId: string) {
    return this.reviews.listApproved(courseId);
  }

  @Get('courses/:courseId/reviews/eligibility')
  eligibility(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ) {
    return this.reviews.eligibility(user, courseId);
  }

  @Post('courses/:courseId/reviews')
  create(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Body(SanitizePipe) dto: CreateReviewDto,
  ) {
    return this.reviews.create(user, courseId, dto);
  }

  @Patch('reviews/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(SanitizePipe) dto: UpdateReviewDto,
  ) {
    return this.reviews.update(user, id, dto);
  }

  @Delete('reviews/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reviews.remove(user, id);
  }

  @Post('courses/:courseId/reviews/request')
  request(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
  ) {
    return this.reviews.requestReviews(user, courseId);
  }

  @Get('reviews/pending')
  listPending(@CurrentUser() user: AuthUser) {
    return this.reviews.listPending(user);
  }

  @Get('reviews/pending-count')
  async pendingCount(@CurrentUser() user: AuthUser) {
    return { count: await this.reviews.pendingCount(user) };
  }

  @Patch('reviews/:id/moderate')
  moderate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(SanitizePipe) dto: ModerateReviewDto,
  ) {
    return this.reviews.moderate(user, id, dto);
  }
}
