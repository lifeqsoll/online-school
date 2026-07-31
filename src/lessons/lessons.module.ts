import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { LessonContentAccessService } from './lesson-content-access.service';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [EnrollmentsModule, StorageModule, NotificationsModule],
  controllers: [LessonsController],
  providers: [LessonsService, LessonContentAccessService],
  exports: [LessonsService, LessonContentAccessService],
})
export class LessonsModule {}
