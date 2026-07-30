import { PaymentProvider as PaymentProviderEnum } from '@prisma/client';

export type CreatePaymentInput = {
  paymentId: string;
  amountCents: number;
  currency: string;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
};

export type CreatePaymentResult = {
  providerPaymentId: string;
  confirmationUrl: string;
};

export interface PaymentProvider {
  readonly name: PaymentProviderEnum;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
