import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { PaymentsModule } from '../payments/payments.module';
import { CourseAccessService } from './course-access.service';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

@Module({
  imports: [OutboxModule, PaymentsModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, CourseAccessService],
  exports: [EnrollmentsService, CourseAccessService],
})
export class EnrollmentsModule {}
