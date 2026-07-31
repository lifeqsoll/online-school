import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider as PaymentProviderEnum } from '@prisma/client';
import {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
} from './payment-provider';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = PaymentProviderEnum.MOCK;

  constructor(private readonly config: ConfigService) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerPaymentId = `mock_${input.paymentId}`;
    const webAppUrl = (
      this.config.get<string>('webAppUrl') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
    const returnUrl = encodeURIComponent(input.returnUrl);
    const confirmationUrl = `${webAppUrl}/payments/mock?paymentId=${encodeURIComponent(input.paymentId)}&returnUrl=${returnUrl}`;
    return { providerPaymentId, confirmationUrl };
  }
}
