import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { OutboxModule } from '../outbox/outbox.module';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';

@Module({
  imports: [EnrollmentsModule, OutboxModule],
  controllers: [EngagementController],
  providers: [EngagementService],
})
export class EngagementModule {}
