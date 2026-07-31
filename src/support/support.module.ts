import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [EnrollmentsModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
