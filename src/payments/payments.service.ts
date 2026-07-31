import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  EnrollmentSource,
  PaymentStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async checkout(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.priceCents <= 0) {
      throw new BadRequestException('Free course uses enroll endpoint');
    }

    const existing = await this.prisma.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId: user.id } },
    });
    if (existing) throw new ConflictException('Already enrolled');

    const pending = await this.prisma.payment.findFirst({
      where: {
        courseId,
        userId: user.id,
        status: PaymentStatus.PENDING,
      },
    });
    if (pending) {
      const webAppUrl = (
        this.config.get<string>('webAppUrl') ?? 'http://localhost:5173'
      ).replace(/\/$/, '');
      const returnUrl = encodeURIComponent(
        this.config.getOrThrow<string>('paymentReturnUrl'),
      );
      const confirmationUrl = `${webAppUrl}/payments/mock?paymentId=${encodeURIComponent(pending.id)}&returnUrl=${returnUrl}`;
      return {
        payment: pending,
        confirmationUrl,
      };
    }

    const payment = await this.prisma.payment.create({
      data: {
        courseId,
        userId: user.id,
        amountCents: course.priceCents,
        currency: course.currency,
        provider: this.provider.name,
        status: PaymentStatus.PENDING,
      },
    });

    const created = await this.provider.createPayment({
      paymentId: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      description: `Course: ${course.title}`,
      returnUrl: this.config.getOrThrow<string>('paymentReturnUrl'),
      metadata: { courseId, userId: user.id },
    });

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: created.providerPaymentId,
        confirmationUrl: created.confirmationUrl,
      },
    });

    await this.audit.append({
      action: AuditAction.PAYMENT_CREATE,
      actorId: user.realUserId,
      meta: { paymentId: payment.id, courseId },
    });

    return { payment: updated, confirmationUrl: created.confirmationUrl };
  }

  async getPayment(actor: AuthUser, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        course: { select: { id: true, title: true, slug: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const isOwner =
      payment.userId === actor.id || payment.userId === actor.realUserId;
    const isAdmin = actor.realGlobalRole === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Cannot view this payment');
    }

    return {
      id: payment.id,
      status: payment.status,
      amountCents: payment.amountCents,
      currency: payment.currency,
      provider: payment.provider,
      courseId: payment.courseId,
      course: payment.course,
      createdAt: payment.createdAt,
      confirmationUrl: payment.confirmationUrl,
    };
  }

  async mockConfirm(actor: AuthUser, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const isOwner = payment.userId === actor.id || payment.userId === actor.realUserId;
    const isAdmin = actor.realGlobalRole === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Cannot confirm this payment');
    }

    if (payment.status === PaymentStatus.SUCCEEDED) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { paymentId: payment.id },
      });
      return { payment, enrollment };
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`Payment status is ${payment.status}`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.SUCCEEDED },
      });

      const existing = await tx.enrollment.findUnique({
        where: {
          courseId_userId: {
            courseId: payment.courseId,
            userId: payment.userId,
          },
        },
      });
      if (existing) {
        return { payment: updated, enrollment: existing };
      }

      const enrollment = await tx.enrollment.create({
        data: {
          courseId: payment.courseId,
          userId: payment.userId,
          source: EnrollmentSource.PAYMENT,
          paymentId: payment.id,
        },
      });
      return { payment: updated, enrollment };
    });

    await this.audit.append({
      action: AuditAction.PAYMENT_SUCCEEDED,
      actorId: actor.realUserId,
      targetId: payment.userId,
      meta: { paymentId: payment.id, courseId: payment.courseId },
    });

    return result;
  }

  async mockFail(actor: AuthUser, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const isOwner =
      payment.userId === actor.id || payment.userId === actor.realUserId;
    const isAdmin = actor.realGlobalRole === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Cannot fail this payment');
    }

    if (payment.status === PaymentStatus.SUCCEEDED) {
      throw new BadRequestException('Payment already succeeded');
    }
    if (payment.status === PaymentStatus.FAILED) {
      return { payment };
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`Payment status is ${payment.status}`);
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });

    await this.audit.append({
      action: AuditAction.PAYMENT_CREATE,
      actorId: actor.realUserId,
      meta: { paymentId: payment.id, failed: true },
    });

    return { payment: updated };
  }

  async mockCancel(actor: AuthUser, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const isOwner =
      payment.userId === actor.id || payment.userId === actor.realUserId;
    const isAdmin = actor.realGlobalRole === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Cannot cancel this payment');
    }

    if (payment.status === PaymentStatus.SUCCEEDED) {
      throw new BadRequestException('Payment already succeeded');
    }
    if (
      payment.status === PaymentStatus.CANCELED ||
      payment.status === PaymentStatus.FAILED
    ) {
      return { payment };
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`Payment status is ${payment.status}`);
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.CANCELED },
    });

    return { payment: updated };
  }
}
