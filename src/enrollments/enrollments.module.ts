import { Module } from '@nestjs/common';
import { CourseAccessService } from './course-access.service';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

@Module({
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, CourseAccessService],
  exports: [EnrollmentsService, CourseAccessService],
})
export class EnrollmentsModule {}
