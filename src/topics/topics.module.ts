import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { OutboxModule } from '../outbox/outbox.module';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';

@Module({
  imports: [EnrollmentsModule, OutboxModule],
  controllers: [TopicsController],
  providers: [TopicsService],
  exports: [TopicsService],
})
export class TopicsModule {}
