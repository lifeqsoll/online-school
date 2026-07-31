import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { XpController } from './xp.controller';
import { XpService } from './xp.service';

@Module({
  imports: [EnrollmentsModule, NotificationsModule],
  controllers: [XpController],
  providers: [XpService],
  exports: [XpService],
})
export class XpModule {}
