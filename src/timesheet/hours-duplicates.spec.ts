import { findHoursConflicts, formatBlockMessage, slotsOverlap, HoursSlot } from './hours-duplicates';

const slot = (date: string, a: string, b: string | null, extra: Partial<HoursSlot> = {}): HoursSlot => ({
  date: new Date(`${date}T00:00:00Z`),
  clockIn: new Date(`${date}T${a}:00Z`),
  clockOut: b ? new Date(`${date}T${b}:00Z`) : null,
  ...extra,
});

describe('hours duplicate detection', () => {
  it('blocks the same sheet scanned again', () => {
    const c = findHoursConflicts(slot('2026-11-24', '08:00', '14:00'), [slot('2026-11-24', '08:00', '14:00', { totalHours: 6, source: 'SCAN' })]);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe('BLOCK');
    expect(c[0].existingHours).toBe(6);
  });
  it('blocks overlapping times on the same date', () => {
    expect(findHoursConflicts(slot('2026-11-24', '10:00', '16:00'), [slot('2026-11-24', '08:00', '12:00')])[0].kind).toBe('BLOCK');
  });
  it('blocks the same start time even when an end is missing', () => {
    expect(findHoursConflicts(slot('2026-11-24', '08:00', null), [slot('2026-11-24', '08:00', '12:00')])[0].kind).toBe('BLOCK');
  });
  it('warns, not blocks, for a second shift the same day', () => {
    const c = findHoursConflicts(slot('2026-11-24', '18:00', '22:00'), [slot('2026-11-24', '08:00', '12:00')]);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe('WARN');
  });
  it('touching ranges do not overlap', () => {
    expect(slotsOverlap(slot('2026-11-24', '08:00', '12:00'), slot('2026-11-24', '12:00', '16:00'))).toBe(false);
  });
  it('ignores other dates', () => {
    expect(findHoursConflicts(slot('2026-11-25', '08:00', '14:00'), [slot('2026-11-24', '08:00', '14:00')])).toHaveLength(0);
  });
  it('writes a readable German message', () => {
    const c = findHoursConflicts(slot('2026-11-24', '08:00', '14:00'), [slot('2026-11-24', '08:00', '14:00', { totalHours: 6, source: 'SCAN' })]);
    expect(formatBlockMessage(c)).toBe('Bereits registriert: 24.11.2026: 6 h, 08:00-14:00 (Scan). Bitte den vorhandenen Eintrag bearbeiten, statt die Stunden erneut zu registrieren.');
  });
});
