import { MessagingService } from './messaging.service';
import { buildPlanTemplate, planWhatsAppContext } from './plan-templates';

// Synthetic values only. Global fetch is a mock; no provider, database or worker contact.
describe('approved event-specific plan templates', () => {
  let service: MessagingService;
  let network: jest.Mock;
  const original = { ...process.env };
  const options = {
    phone: '+491701234567',
    empName: 'Max Beispiel',
    dateFormatted: '24.11.2026',
    schedule:
      'Standort Nord, Halle A, 06:00 bis 14:00 Uhr | Standort Süd, Halle B, 15:00 bis offenes Ende',
    treffpunktInfo: 'Büro, Treffzeit: 05:45',
    planId: 'plan-synthetic',
    employeeId: 'worker-synthetic',
  };
  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'synthetic';
    process.env.WHATSAPP_ACCESS_TOKEN = 'synthetic-not-a-secret';
    service = new MessagingService({} as any);
    network = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'synthetic-acceptance' }] }),
      });
    global.fetch = network;
  });
  afterAll(() => {
    process.env = original;
  });
  const sent = () => JSON.parse(network.mock.calls[0][1].body).template;
  it.each(['ASSIGNED', 'UPDATED'] as const)(
    '%s uses six ordered parameters and exact plan/worker button routing',
    async (event) => {
      const result = await service.sendShiftPlanNotification({
        ...options,
        event,
      });
      expect(result).toMatchObject({ success: true, method: 'META_TEMPLATE' });
      expect(sent()).toMatchObject({
        name: 'schichtinformation_v2',
        language: { code: 'de' },
      });
      expect(sent().components[0].parameters.map((p: any) => p.text)).toEqual([
        options.empName,
        options.dateFormatted,
        event === 'UPDATED' ? 'Aktualisiert' : 'Neu zugewiesen',
        options.schedule,
        options.treffpunktInfo,
        'Nicht angegeben',
      ]);
      expect(
        sent()
          .components.slice(1)
          .map((b: any) => b.parameters[0].payload),
      ).toEqual([
        'CONFIRM_plan-synthetic_worker-synthetic',
        'SICK_plan-synthetic_worker-synthetic',
        'CUSTOM_plan-synthetic_worker-synthetic',
      ]);
      expect(sent().components.map((c: any) => c.type)).toEqual([
        'body',
        'button',
        'button',
        'button',
      ]);
    },
  );
  it.each([
    ['CANCELLED', 'schicht_absage_v1'],
    ['REMOVED', 'einsatz_ausgetragen_v1'],
  ] as const)(
    '%s has three variables, no response buttons or wrong-event fallback',
    async (event, name) => {
      await service.sendShiftPlanNotification({ ...options, event });
      expect(sent().name).toBe(name);
      expect(sent().components).toHaveLength(1);
      expect(sent().components[0].parameters.map((p: any) => p.text)).toEqual([
        options.empName,
        options.dateFormatted,
        options.schedule,
      ]);
    },
  );
  it('uses missing-data labels, never guesses a location or time', () => {
    const context = planWhatsAppContext(
      { id: 'p', date: '2026-11-24' },
      { id: 'w' },
    );
    expect(context.schedule).toBe(
      'Nicht angegeben, Nicht angegeben, Nicht angegeben',
    );
    expect(context.meeting).toBe('Nicht angegeben, Treffzeit: Nicht angegeben');
    expect(JSON.stringify(context)).not.toMatch(
      /Duisburg|07:45|Haupttor|08:00/,
    );
  });
  it('keeps every location, actual hall time, open end and this plan’s ordered worker segments, excluding all private notes', () => {
    const context = planWhatsAppContext(
      {
        id: 'p',
        date: '2026-11-24',
        notes: 'PRIVATE PLAN',
        locations: [
          {
            warehouseName: 'Nord',
            hallName: 'A',
            startTime: '06:00',
            endTime: '10:00',
            notes: 'PRIVATE LOCATION',
          },
          {
            warehouse: { name: 'Süd' },
            hall: { name: 'B' },
            startTime: '11:00',
            isOpenEnd: true,
          },
        ],
        employeeSegments: [
          {
            planId: 'p',
            employeeId: 'w',
            order: 1,
            treffpunkt: 'Tor',
            treffpunktTime: '10:45',
            startTime: '11:00',
            endTime: '14:00',
            notes: 'PRIVATE WORKER',
          },
          { planId: 'other', employeeId: 'w', treffpunkt: 'UNRELATED' },
        ],
      },
      { id: 'w', notes: 'PRIVATE HEALTH' },
    );
    expect(context.schedule).toBe(
      'Nord, A, 06:00 bis 10:00 Uhr | Süd, B, 11:00 bis offenes Ende | Abschnitt 1: Tor, 11:00 bis 14:00 Uhr',
    );
    expect(context.meeting).toBe('Tor, Treffzeit: 10:45');
    expect(JSON.stringify(context)).not.toMatch(/PRIVATE|UNRELATED/);
  });
  it.each(['ASSIGNED', 'UPDATED', 'CANCELLED', 'REMOVED'] as const)(
    'blocks oversized %s without API, truncation or manual bypass link',
    async (event) => {
      const result = await service.sendShiftPlanNotification({
        ...options,
        event,
        schedule: 'x'.repeat(1100),
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('maximal 1024');
      expect(result.waLink).toBeUndefined();
      expect(network).not.toHaveBeenCalled();
    },
  );
  it('accepts exactly 1024 UTF-16 units and rejects 1025, with the full input preserved', async () => {
    const base = buildPlanTemplate('UPDATED', {
      name: options.empName,
      date: options.dateFormatted,
      schedule: '',
      meeting: options.treffpunktInfo,
    });
    const room = 1024 - base.body.length + 'Nicht angegeben'.length;
    await service.sendShiftPlanNotification({
      ...options,
      event: 'UPDATED',
      schedule: 'x'.repeat(room),
    });
    expect(network).toHaveBeenCalledTimes(1);
    expect(sent().components[0].parameters[3].text).toHaveLength(room);
    const result = await service.sendShiftPlanNotification({
      ...options,
      event: 'UPDATED',
      schedule: 'x'.repeat(room + 1),
    });
    expect(result.success).toBe(false);
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('normalizes newline/tab whitespace without cutting meaningful text', async () => {
    await service.sendShiftPlanNotification({
      ...options,
      schedule: 'Nord\nA\t06:00 bis 14:00',
    });
    expect(sent().components[0].parameters[3].text).toBe(
      'Nord A 06:00 bis 14:00',
    );
  });
  it('never drops plan routing buttons or falls back to old text after Meta rejects the template', async () => {
    network.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { code: 132000, message: 'button parameter mismatch' },
      }),
    });
    const interactive = jest.spyOn(service, 'sendWhatsAppInteractive');
    const direct = jest.spyOn(service, 'sendWhatsAppDirect');
    const result = await service.sendShiftPlanNotification({ ...options });
    expect(result.success).toBe(false);
    expect(network).toHaveBeenCalledTimes(1);
    expect(interactive).not.toHaveBeenCalled();
    expect(direct).not.toHaveBeenCalled();
    expect(result.waLink && decodeURIComponent(result.waLink)).toContain(
      'Schichtdatum',
    );
  });
  it('guards the generic template endpoint against oversized content, private notes and missing routing', async () => {
    const values = [
      options.empName,
      options.dateFormatted,
      'Aktualisiert',
      'x'.repeat(1100),
      'Büro',
      'Nicht angegeben',
    ];
    expect(
      (
        await service.sendWhatsAppTemplate(
          options.phone,
          'schichtinformation_v2',
          values,
          'de',
          ['a', 'b', 'c'],
        )
      ).success,
    ).toBe(false);
    values[3] = 'Nord';
    values[5] = 'PRIVATE';
    expect(
      (
        await service.sendWhatsAppTemplate(
          options.phone,
          'schichtinformation_v2',
          values,
          'de',
          ['a', 'b', 'c'],
        )
      ).success,
    ).toBe(false);
    values[5] = 'Nicht angegeben';
    expect(
      (
        await service.sendWhatsAppTemplate(
          options.phone,
          'schichtinformation_v2',
          values,
        )
      ).success,
    ).toBe(false);
    expect(network).not.toHaveBeenCalled();
  });
});

import { shiftWithHours } from './plan-templates';

describe('shiftWithHours', () => {
  it('keeps shifts that already carry hours', () => {
    expect(shiftWithHours('06:00 - 14:00 (Frühschicht)')).toBe('06:00 - 14:00 (Frühschicht)');
  });
  it('adds nominal hours to bare legacy names', () => {
    expect(shiftWithHours('Frühschicht')).toBe('Frühschicht, 06:00 bis 14:00 Uhr');
    expect(shiftWithHours('Spätschicht')).toBe('Spätschicht, 14:00 bis 22:00 Uhr');
    expect(shiftWithHours('Nachtschicht')).toBe('Nachtschicht, 22:00 bis 06:00 Uhr');
  });
  it('leaves unknown names and empty values alone', () => {
    expect(shiftWithHours('Sonderschicht')).toBe('Sonderschicht');
    expect(shiftWithHours(null)).toBeNull();
  });
  it('shows hours in the WhatsApp schedule for a bare shift name', () => {
    const ctx = planWhatsAppContext(
      { id: 'p', date: '2026-11-25', shift: 'Frühschicht', warehouseName: 'Duisburg', hallName: 'Halle 1' },
      { id: 'e' },
    );
    expect(ctx.schedule).toContain('Frühschicht, 06:00 bis 14:00 Uhr');
  });
});
