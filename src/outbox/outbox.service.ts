import { Injectable } from '@nestjs/common';
import { OutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    tx: Tx | PrismaService,
    type: string,
    payload: Record<string, unknown>,
  ) {
    await tx.analyticsOutbox.create({
      data: {
        type,
        payload: payload as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
      },
    });
  }

  async enqueueStandalone(type: string, payload: Record<string, unknown>) {
    return this.enqueue(this.prisma, type, payload);
  }
}
