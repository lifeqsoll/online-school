import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MockPaymentProvider } from './mock-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const mode = (config.get<string>('paymentProvider') ?? 'mock').toLowerCase();
        if (mode !== 'mock') {
          throw new Error(
            `PAYMENT_PROVIDER=${mode} is not configured. Use mock until a real provider is wired.`,
          );
        }
        return new MockPaymentProvider(config);
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
