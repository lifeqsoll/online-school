import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox/outbox.module';
import { UsersModule } from '../users/users.module';
import { SupportController } from './support.controller';
import { SupportOpsController } from './support-ops.controller';
import { SupportOpsService } from './support-ops.service';
import { SupportService } from './support.service';

@Module({
  imports: [
    EnrollmentsModule,
    NotificationsModule,
    AuthModule,
    OutboxModule,
    UsersModule,
  ],
  controllers: [SupportController, SupportOpsController],
  providers: [SupportService, SupportOpsService],
})
export class SupportModule {}
