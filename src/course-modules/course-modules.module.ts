import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { CourseModulesController } from './course-modules.controller';
import { CourseModulesService } from './course-modules.service';

@Module({
  imports: [EnrollmentsModule],
  controllers: [CourseModulesController],
  providers: [CourseModulesService],
  exports: [CourseModulesService],
})
export class CourseModulesModule {}
