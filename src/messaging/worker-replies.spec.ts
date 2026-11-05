import { workerReply, WorkerReplyKey } from './worker-replies';
import { SupportedLanguage } from './whatsapp-self-service.service';
describe('Consistent worker replies', () => {
  it.each(['de', 'tr', 'ar', 'uk'] as SupportedLanguage[])('covers all routing replies in %s without IDs or delivery promises', lang => {
    for (const key of ['NO_PENDING','MULTIPLE_PENDING','MULTIPLE_NOTES','NOTE_SAVED'] as WorkerReplyKey[]) {
      const text = workerReply(key, lang);
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/undefined|UUID|weitergeleitet|Ihre |Ihnen/);
    }
  });
  it('uses informal German and says saved, not delivered', () => {
    expect(workerReply('NOTE_SAVED', 'de')).toBe('✅ Deine Nachricht wurde für die Schichtleitung gespeichert.');
  });
});
