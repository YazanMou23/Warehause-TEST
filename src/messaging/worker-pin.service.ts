import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Worker PIN verification for the WhatsApp self-service conversation.
 *
 * Decided by the owner (2026-11-28): the attendance/shift buttons (CONFIRM/SICK/CUSTOM)
 * stay open; every other inbound worker interaction (questions, menus, notes, language,
 * courtesy) requires a verified session. The manager generates a random 6-digit PIN per
 * worker on the Employees page and hands it over in person. Only a bcrypt hash is stored.
 *
 * - Verified state is in-memory for 24 hours and lost on restart (fail closed),
 *   same pattern as the language sessions.
 * - Max 3 wrong attempts per UTC day, then locked until the next UTC day. The counter
 *   lives in the DB so a restart cannot reset the lockout.
 * - Workers without a PIN keep phone-only identity (gradual rollout).
 * - The PIN text is never logged and never reaches the AI path.
 */
@Injectable()
export class WorkerPinService {
  private readonly logger = new Logger(WorkerPinService.name);

  private readonly verified = new Map<string, number>(); // workerId -> expiry epoch ms
  private readonly heldTexts = new Map<string, string>(); // workerId -> held question

  static readonly SESSION_MS = 24 * 60 * 60 * 1000;
  static readonly MAX_ATTEMPTS = 3;
  static readonly PIN_REGEX = /^\d{6}$/;

  constructor(private readonly prisma: PrismaService) {}

  isVerified(workerId: string): boolean {
    const expiry = this.verified.get(workerId);
    if (!expiry) return false;
    if (expiry < Date.now()) {
      this.verified.delete(workerId);
      return false;
    }
    return true;
  }

  async hasPin(workerId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: { whatsappPinHash: true },
    });
    return Boolean(user?.whatsappPinHash);
  }

  /** Holds one question while the PIN is asked; overwritten by a newer text. */
  holdText(workerId: string, text: string): void {
    this.heldTexts.set(workerId, text.slice(0, 1000));
  }

  /** Returns and clears the held question after a successful verification. */
  takeHeldText(workerId: string): string | null {
    const text = this.heldTexts.get(workerId) ?? null;
    this.heldTexts.delete(workerId);
    return text;
  }

  private utcToday(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Verifies a 6-digit PIN attempt against the stored hash.
   * Never logs the attempt value. 'locked' also covers a correct PIN after 3 failures.
   */
  async tryVerify(workerId: string, pin: string): Promise<'ok' | 'wrong' | 'locked'> {
    const user = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: { whatsappPinHash: true, whatsappPinFailedAttempts: true, whatsappPinFailedDay: true },
    });
    if (!user?.whatsappPinHash) return 'wrong';

    const today = this.utcToday();
    const attempts = user.whatsappPinFailedDay === today ? user.whatsappPinFailedAttempts : 0;
    if (attempts >= WorkerPinService.MAX_ATTEMPTS) return 'locked';

    const ok = await bcrypt.compare(pin, user.whatsappPinHash);
    if (ok) {
      await this.prisma.user.update({
        where: { id: workerId },
        data: { whatsappPinFailedAttempts: 0, whatsappPinFailedDay: null },
      });
      this.verified.set(workerId, Date.now() + WorkerPinService.SESSION_MS);
      this.logger.log(`[Worker PIN] Worker verified for 24h`);
      return 'ok';
    }

    const next = attempts + 1;
    await this.prisma.user.update({
      where: { id: workerId },
      data: { whatsappPinFailedAttempts: next, whatsappPinFailedDay: today },
    });
    this.logger.log(`[Worker PIN] Failed attempt ${next}/${WorkerPinService.MAX_ATTEMPTS} (UTC day)`);
    return next >= WorkerPinService.MAX_ATTEMPTS ? 'locked' : 'wrong';
  }
}
