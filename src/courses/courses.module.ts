import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  imports: [EnrollmentsModule],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
