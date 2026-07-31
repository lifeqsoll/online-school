import { Module } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { OutboxModule } from '../outbox/outbox.module';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';

@Module({
  imports: [EnrollmentsModule, OutboxModule, CryptoModule],
  controllers: [EngagementController],
  providers: [EngagementService],
  exports: [EngagementService],
})
export class EngagementModule {}
