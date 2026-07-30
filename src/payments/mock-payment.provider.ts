import { Injectable } from '@nestjs/common';
import { PaymentProvider as PaymentProviderEnum } from '@prisma/client';
import {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
} from './payment-provider';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = PaymentProviderEnum.MOCK;

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerPaymentId = `mock_${input.paymentId}`;
    const confirmationUrl = `http://localhost:3000/payments/mock/confirm-ui?paymentId=${input.paymentId}`;
    return { providerPaymentId, confirmationUrl };
  }
}
