import { PlanningService } from './planning.service';
import { confirmationMessage } from './confirmation-message';

describe('read-only confirmation message state', () => {
  it('does not present a button placeholder as received text', () => {
    expect(
      confirmationMessage({
        confirmationStatus: 'CUSTOM_RESPONSE',
        responseNote: 'Wartet auf individuelle Textnachricht',
        responseChannel: 'WHATSAPP_BUTTON',
      }),
    ).toEqual({ messageState: 'AWAITING_TEXT', messageText: null });
  });
  it('handles legacy waiting rows without channel', () => {
    expect(
      confirmationMessage({
        confirmationStatus: 'CUSTOM_RESPONSE',
        responseNote: 'Wartet auf individuelle Textnachricht',
      }).messageState,
    ).toBe('AWAITING_TEXT');
  });
  it.each([null, '', '   '])(
    'empty custom response %s is not a received message',
    (responseNote) => {
      expect(
        confirmationMessage({
          confirmationStatus: 'CUSTOM_RESPONSE',
          responseNote,
        }),
      ).toEqual({ messageState: 'EMPTY', messageText: null });
    },
  );
  it.each(['PENDING', 'CONFIRMED', 'SICK'])(
    'ordinary %s status notes are not worker messages',
    (confirmationStatus) => {
      expect(
        confirmationMessage({
          confirmationStatus,
          responseNote: 'Status note',
          responseChannel: 'WHATSAPP_BUTTON',
        }),
      ).toEqual({ messageState: 'NONE', messageText: null });
    },
  );
  it('preserves complete text, whitespace, multiline and HTML-like text as data', () => {
    const text = '  Hallo\n<script>literal only</script>\n' + 'x'.repeat(3000);
    expect(
      confirmationMessage({
        confirmationStatus: 'CUSTOM_RESPONSE',
        responseNote: text,
        responseChannel: 'WHATSAPP_TEXT',
      }),
    ).toEqual({ messageState: 'RECEIVED', messageText: text });
  });
  it('a real text message equal to the placeholder is still received text', () => {
    expect(
      confirmationMessage({
        confirmationStatus: 'CUSTOM_RESPONSE',
        responseNote: 'Wartet auf individuelle Textnachricht',
        responseChannel: 'WHATSAPP_TEXT',
      }).messageState,
    ).toBe('RECEIVED');
  });
  it('manual custom text is received with its separate manual channel intact', () => {
    expect(
      confirmationMessage({
        confirmationStatus: 'CUSTOM_RESPONSE',
        responseNote: 'Manuell erfasst',
        responseChannel: 'MANUAL',
      }),
    ).toEqual({ messageState: 'RECEIVED', messageText: 'Manuell erfasst' });
  });
  it('keeps received text visible alongside an absence override without changing attendance', async () => {
    const date = new Date('2026-11-24T00:00:00Z');
    const db: any = {
      planEmployee: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              planId: 'p',
              employeeId: 'w',
              confirmationStatus: 'CUSTOM_RESPONSE',
              responseNote: 'Bitte anrufen',
              responseChannel: 'WHATSAPP_TEXT',
              respondedAt: date,
              employee: { name: 'Max Beispiel' },
              plan: { date, locations: [], employeeSegments: [] },
            },
          ]),
      },
      employeeAbsence: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              employeeId: 'w',
              date,
              status: 'KRANK',
              reason: 'absence reason',
            },
          ]),
      },
    };
    const svc = new PlanningService(db, {} as any, {} as any);
    const result = await svc.getConfirmations({});
    expect(result.data[0]).toMatchObject({
      status: 'SICK',
      messageState: 'RECEIVED',
      messageText: 'Bitte anrufen',
      responseChannel: 'WHATSAPP_TEXT',
      respondedAt: date,
    });
    expect(result.sickCount).toBe(1);
  });
});
