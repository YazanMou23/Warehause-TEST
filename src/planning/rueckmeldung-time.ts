export interface TimeSegment {
  employeeId?: string;
  planId?: string | null;
  order?: number;
  startTime?: string | null;
  endTime?: string | null;
}
export interface TimeLocation {
  startTime?: string | null;
  endTime?: string | null;
  isOpenEnd?: boolean;
}

const HHMM = /^\d{1,2}:\d{2}$/;
const toMin = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};
const clock = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Time text for one worker row in the Rückmeldungsliste.
 * Same sources and order as the WhatsApp message: the worker's own segments,
 * then explicit location times, then the stored plan-employee window.
 * Never invents a default: returns "-" when nothing is known.
 */
export function rueckmeldungShiftTime(input: {
  segments?: TimeSegment[];
  locations?: TimeLocation[];
  startTime?: string | Date | null;
  endTime?: string | Date | null;
}): string {
  const segs = (input.segments ?? []).filter(
    (s) => s.startTime && HHMM.test(s.startTime),
  );
  if (segs.length) {
    const ordered = segs
      .slice()
      .sort((a, b) => toMin(a.startTime!) - toMin(b.startTime!));
    const ends = ordered.filter((s) => s.endTime && HHMM.test(s.endTime));
    const last = ends.length
      ? ends.reduce((a, b) => (toMin(b.endTime!) > toMin(a.endTime!) ? b : a))
      : null;
    return `${ordered[0].startTime} - ${last ? last.endTime : 'offenes Ende'}`;
  }
  const locs = (input.locations ?? []).filter(
    (l) => l.startTime && HHMM.test(l.startTime),
  );
  if (locs.length) {
    const start = locs
      .map((l) => l.startTime!)
      .sort((a, b) => toMin(a) - toMin(b))[0];
    const open = locs.some((l) => l.isOpenEnd || !l.endTime);
    const ends = locs
      .filter((l) => !l.isOpenEnd && l.endTime && HHMM.test(l.endTime))
      .map((l) => l.endTime!)
      .sort((a, b) => toMin(b) - toMin(a));
    return `${start} - ${open || !ends.length ? 'offenes Ende' : ends[0]}`;
  }
  const s = clock(input.startTime);
  const e = clock(input.endTime);
  return s && e ? `${s} - ${e}` : '-';
}
