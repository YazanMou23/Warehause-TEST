export interface HoursSlot {
  date: Date;
  clockIn: Date;
  clockOut: Date | null;
  totalHours?: number | null;
  source?: string | null;
}

export interface HoursConflict {
  date: string; // YYYY-MM-DD
  existingStart: string; // HH:mm (UTC clock, same as stored)
  existingEnd: string | null;
  existingHours: number | null;
  source: string | null;
  kind: 'BLOCK' | 'WARN';
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

/** Two slots overlap or start at the same time. A missing end counts as a single point in time. */
export function slotsOverlap(a: HoursSlot, b: HoursSlot): boolean {
  const aStart = a.clockIn.getTime();
  const bStart = b.clockIn.getTime();
  if (aStart === bStart) return true;
  const aEnd = (a.clockOut ?? a.clockIn).getTime();
  const bEnd = (b.clockOut ?? b.clockIn).getTime();
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Compares a new slot with hours the employee already has.
 * Same date and overlapping/identical time -> BLOCK. Same date, different time (e.g. second shift) -> WARN.
 */
export function findHoursConflicts(candidate: HoursSlot, existing: HoursSlot[]): HoursConflict[] {
  const out: HoursConflict[] = [];
  for (const e of existing) {
    if (dayKey(e.date) !== dayKey(candidate.date)) continue;
    out.push({
      date: dayKey(candidate.date),
      existingStart: hhmm(e.clockIn),
      existingEnd: e.clockOut ? hhmm(e.clockOut) : null,
      existingHours: e.totalHours ?? null,
      source: e.source ?? null,
      kind: slotsOverlap(candidate, e) ? 'BLOCK' : 'WARN',
    });
  }
  return out;
}

export function formatBlockMessage(blocks: HoursConflict[]): string {
  const lines = blocks.map((c) => {
    const [yy, mm, dd] = c.date.split('-');
    const range = c.existingEnd ? `${c.existingStart}-${c.existingEnd}` : c.existingStart;
    const h = c.existingHours != null ? `${c.existingHours} h, ` : '';
    const src = c.source === 'SCAN' ? 'Scan' : c.source === 'MANUAL' ? 'manuell' : (c.source ?? 'unbekannt');
    return `${dd}.${mm}.${yy}: ${h}${range} (${src})`;
  });
  return `Bereits registriert: ${lines.join('; ')}. Bitte den vorhandenen Eintrag bearbeiten, statt die Stunden erneut zu registrieren.`;
}
