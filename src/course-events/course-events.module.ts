import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { CourseEventsController } from './course-events.controller';
import { CourseEventsService } from './course-events.service';

@Module({
  imports: [EnrollmentsModule],
  controllers: [CourseEventsController],
  providers: [CourseEventsService],
  exports: [CourseEventsService],
})
export class CourseEventsModule {}
