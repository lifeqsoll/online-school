import { Injectable } from '@nestjs/common';
import { Enrollment, RefundStatus } from '@prisma/client';

export const REFUND_WINDOW_DAYS = 5;

@Injectable()
export class RefundsService {
  /** Mark enrollment refund-eligible if cancelled within N days of enroll. No payout. */
  markEligibleIfWithinDays(
    enrollment: Pick<Enrollment, 'createdAt'>,
    cancelledAt: Date = new Date(),
    days = REFUND_WINDOW_DAYS,
  ): RefundStatus {
    const ms = days * 24 * 60 * 60 * 1000;
    if (cancelledAt.getTime() - enrollment.createdAt.getTime() <= ms) {
      return RefundStatus.ELIGIBLE;
    }
    return RefundStatus.NONE;
  }

  /**
   * Future: call payment provider / create payout job.
   * v1 stub — does not move money.
   */
  async processRefund(_enrollmentId: string): Promise<{
    ok: false;
    reason: 'not_implemented';
  }> {
    return { ok: false, reason: 'not_implemented' };
  }
}
