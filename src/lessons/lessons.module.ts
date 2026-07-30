import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { StorageModule } from '../storage/storage.module';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [EnrollmentsModule, StorageModule],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
