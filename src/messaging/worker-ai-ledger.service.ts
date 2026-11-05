import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerAiLedger, WORKER_AI_LIMITS } from './worker-ai.service';

@Injectable()
export class PrismaWorkerAiLedger extends WorkerAiLedger {
  constructor(private readonly prisma: PrismaService) { super(); }

  async reserve(workerId: string, _now: Date, maxUsd: number): Promise<string | null> {
    const micros = Math.ceil(maxUsd * 1_000_000);
    if (!workerId || !Number.isSafeInteger(micros) || micros <= 0 || micros > 5_000_000) return null;
    // All reservations and settlements share one transaction-scoped Postgres lock.
    // ReadCommitted deliberately gets a fresh snapshot after a waiter gets the lock.
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(71052026)`;
      // DB clock prevents app clock skew from moving usage to a different period.
      const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const now = rows[0].now;
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const minute = new Date(now.getTime() - 60_000);
      const [daily, recent, totals] = await Promise.all([
        tx.workerAiUsage.count({ where: { workerId, createdAt: { gte: day } } }),
        tx.workerAiUsage.count({ where: { workerId, createdAt: { gte: minute } } }),
        tx.workerAiUsage.findMany({ where: { createdAt: { gte: month } }, select: { reservedMicros:true, actualMicros:true } }),
      ]);
      const spent = totals.reduce((n, row) => n + (row.actualMicros ?? row.reservedMicros), 0);
      if (daily >= WORKER_AI_LIMITS.daily || recent >= WORKER_AI_LIMITS.perMinute || spent + micros > WORKER_AI_LIMITS.monthlyUsd * 1_000_000) return null;
      return (await tx.workerAiUsage.create({ data: { workerId, createdAt: now, reservedMicros: micros }, select: { id:true } })).id;
    }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 5000 });
  }

  async settle(reservation: string, actualUsd: number): Promise<void> {
    const actual = Math.ceil(actualUsd * 1_000_000);
    if (!Number.isSafeInteger(actual) || actual < 0) throw new Error('Invalid AI usage');
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(71052026)`;
      const row = await tx.workerAiUsage.findUniqueOrThrow({ where:{ id:reservation } });
      // No release if usage is invalid, repeated or unexpectedly above reservation.
      if (row.actualMicros !== null || actual > row.reservedMicros) throw new Error('AI reservation cannot be settled');
      await tx.workerAiUsage.update({ where:{ id:reservation }, data:{ actualMicros: actual } });
    }, { isolationLevel:'ReadCommitted', maxWait:5000, timeout:5000 });
  }
}
