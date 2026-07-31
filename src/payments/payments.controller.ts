import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthUser } from '../rbac/auth-user';
import { MockConfirmDto } from './dto/mock-confirm.dto';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('courses/:id/checkout')
  checkout(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.checkout(user, id);
  }

  @Get('payments/:id')
  getPayment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.getPayment(user, id);
  }

  @Post('payments/mock/confirm')
  mockConfirm(@CurrentUser() user: AuthUser, @Body() dto: MockConfirmDto) {
    return this.payments.mockConfirm(user, dto.paymentId);
  }

  @Post('payments/mock/fail')
  mockFail(@CurrentUser() user: AuthUser, @Body() dto: MockConfirmDto) {
    return this.payments.mockFail(user, dto.paymentId);
  }

  @Post('payments/mock/cancel')
  mockCancel(@CurrentUser() user: AuthUser, @Body() dto: MockConfirmDto) {
    return this.payments.mockCancel(user, dto.paymentId);
  }

  @Public()
  @HttpCode(501)
  @Post('payments/webhooks/yookassa')
  yookassaWebhook() {
    return {
      error: 'YooKassa not configured',
      message: 'Real YooKassa webhook will be enabled later',
    };
  }
}
