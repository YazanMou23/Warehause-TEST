import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** At-most-once handler admission across workers/processes/restarts. Uses an
 * existing ActionLog primary key, no migration. No raw phone/body/message ID.
 * Claims are never released after uncertain sends: retries must not reply twice.
 * This is not a transactional WhatsApp outbox or an exactly-once guarantee. */
@Injectable()
export class WorkerInboundLedger {
  constructor(private readonly prisma: PrismaService) {}
  async claim(messageId: string, workerId: string): Promise<boolean> {
    if (!messageId || messageId.length > 512) return false;
    const digest=createHash('sha256').update(`whatsapp-inbound:${messageId}`).digest('hex');
    try {
      await this.prisma.actionLog.create({data:{id:`wa-in-${digest}`,userId:workerId,action:'WHATSAPP_INBOUND_CLAIMED',details:'Inbound admitted once; claim retained on processing/delivery failure.'}});
      return true;
    } catch(error:any) {
      if(error?.code==='P2002') return false;
      throw error; // Database unavailable: fail closed, no outbound/assignment writes.
    }
  }
}
