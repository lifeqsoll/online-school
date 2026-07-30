import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TopicMasteryService } from './topic-mastery.service';

@Module({
  imports: [EnrollmentsModule, OutboxModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, TopicMasteryService],
  exports: [TopicMasteryService],
})
export class AnalyticsModule {}
