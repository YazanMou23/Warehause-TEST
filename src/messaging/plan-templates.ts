export type PlanTemplateEvent =
  | 'ASSIGNED'
  | 'UPDATED'
  | 'CANCELLED'
  | 'REMOVED';
export const PLAN_TEMPLATE_NAMES = {
  ASSIGNED: 'schichtinformation_v2',
  UPDATED: 'schichtinformation_v2',
  CANCELLED: 'schicht_absage_v1',
  REMOVED: 'einsatz_ausgetragen_v1',
} as const;
export const cleanPlanValue = (
  value: string | number | null | undefined,
): string =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim() || 'Nicht angegeben';

export function buildPlanTemplate(
  event: PlanTemplateEvent,
  values: {
    name: string;
    date: string;
    schedule: string;
    meeting?: string;
  },
) {
  const p = [
    values.name,
    values.date,
    ...(event === 'ASSIGNED' || event === 'UPDATED'
      ? [
          event === 'UPDATED' ? 'Aktualisiert' : 'Neu zugewiesen',
          values.schedule,
          values.meeting,
          'Nicht angegeben',
        ]
      : [values.schedule]),
  ].map(cleanPlanValue);
  let body: string;
  if (event === 'CANCELLED') {
    body = `Hallo ${p[0]},\n📅 Schichtdatum: ${p[1]}.\n❌ Deine Schicht wurde abgesagt.\n🏢 Betroffener Einsatz: ${p[2]}.\nFür diesen Einsatz musst du nicht erscheinen. Andere Schichten bleiben unverändert. Bei Fragen wende dich bitte an die Einsatzleitung.`;
  } else if (event === 'REMOVED') {
    body = `Hallo ${p[0]},\n📅 Schichtdatum: ${p[1]}.\n🔄 Du bist nicht mehr für folgenden Einsatz eingeteilt: ${p[2]}.\nDas betrifft nur diesen Einsatz. Andere Schichten bleiben unverändert. Bei Fragen wende dich bitte an die Einsatzleitung.`;
  } else {
    body = `Hallo ${p[0]},\n📅 Schichtdatum: ${p[1]}.\n📌 Status deiner Schicht: ${p[2]}.\n🏢 Dein Einsatzplan: ${p[3]}.\n📍 Treffpunkt: ${p[4]}.\n📝 Hinweise für dich: ${p[5]}.\nBitte prüfe die Angaben. Rückfragen oder Änderungen klärst du mit der Einsatzleitung. Deine erste Rückmeldung bleibt verbindlich.`;
  }
  return { name: PLAN_TEMPLATE_NAMES[event], parameters: p, body };
}

interface OperationalSegment {
  notes?: string | null;
  employeeId: string;
  planId?: string | null;
  order?: number;
  treffpunkt?: string | null;
  treffpunktTime?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}
interface OperationalLocation {
  notes?: string | null;
  warehouseName?: string | null;
  hallName?: string | null;
  warehouse?: { name: string } | null;
  hall?: { name: string } | null;
  startTime?: string | null;
  endTime?: string | null;
  isOpenEnd?: boolean;
}
interface OperationalPlan {
  notes?: string | null;
  id: string;
  date: string | Date;
  shift?: string | null;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  warehouseName?: string;
  hallName?: string;
  locations?: OperationalLocation[];
  employeeSegments?: OperationalSegment[];
  treffpunkt?: string | null;
  treffpunktTime?: string | null;
}
interface OperationalEmployee {
  notes?: string | null;
  id: string;
  treffpunkt?: string | null;
  treffpunktTime?: string | null;
}

// Legacy plans store only the shift name ("Frühschicht"); new ones already
// store "06:00 - 14:00 (Frühschicht)". Add the nominal hours to bare names so
// the worker always sees the hours, matching getShiftTimeWindow().
export function shiftWithHours(shift?: string | null): string | null {
  const text = (shift ?? '').trim();
  if (!text) return null;
  if (/\d{1,2}:\d{2}/.test(text)) return text;
  const lower = text.toLowerCase();
  if (lower.includes('spät')) return `${text}, 14:00 bis 22:00 Uhr`;
  if (lower.includes('nacht')) return `${text}, 22:00 bis 06:00 Uhr`;
  if (lower.includes('früh')) return `${text}, 06:00 bis 14:00 Uhr`;
  return text;
}

// Only operational fields are allowed. Never copy plan, location, absence or worker notes.
export function planWhatsAppContext(
  plan: OperationalPlan,
  employee: OperationalEmployee,
  segments?: OperationalSegment[],
) {
  const workerSegments = (segments ?? plan.employeeSegments ?? [])
    .filter(
      (s) =>
        s.employeeId === employee.id && (!s.planId || s.planId === plan.id),
    )
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const clock = (value: string | Date | null | undefined) => {
    if (!value) return 'Nicht angegeben';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Nicht angegeben'
      : date.toLocaleTimeString('de-DE', {
          timeZone: 'Europe/Berlin',
          hour: '2-digit',
          minute: '2-digit',
        });
  };
  const planTime =
    shiftWithHours(plan.shift) ||
    (plan.startTime && plan.endTime
      ? `${clock(plan.startTime)} bis ${clock(plan.endTime)} Uhr`
      : 'Nicht angegeben');
  const locations = plan.locations?.length
    ? plan.locations
    : [{ warehouseName: plan.warehouseName, hallName: plan.hallName }];
  const schedule = locations
    .map((loc) => {
      const time = loc.startTime
        ? `${loc.startTime} bis ${loc.isOpenEnd ? 'offenes Ende' : cleanPlanValue(loc.endTime)}${loc.isOpenEnd ? '' : ' Uhr'}`
        : planTime;
      return `${cleanPlanValue(loc.warehouseName || loc.warehouse?.name)}, ${cleanPlanValue(loc.hallName || loc.hall?.name)}, ${time}`;
    })
    .join(' | ');
  const segmentTimes = workerSegments
    .map(
      (s, i) =>
        `Abschnitt ${i + 1}: ${cleanPlanValue(s.treffpunkt)}, ${cleanPlanValue(s.startTime)} bis ${cleanPlanValue(s.endTime)} Uhr`,
    )
    .join(' | ');
  const meetingRows = workerSegments.length
    ? workerSegments
    : [
        {
          treffpunkt: plan.treffpunkt || employee.treffpunkt,
          treffpunktTime: plan.treffpunktTime || employee.treffpunktTime,
        },
      ];
  const meeting = meetingRows
    .map(
      (s) =>
        `${cleanPlanValue(s.treffpunkt)}, Treffzeit: ${cleanPlanValue(s.treffpunktTime)}`,
    )
    .join(' | ');
  const date = new Date(plan.date);
  return {
    schedule: segmentTimes ? `${schedule} | ${segmentTimes}` : schedule,
    meeting,
    dateFormatted: Number.isNaN(date.getTime())
      ? 'Nicht angegeben'
      : date.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
  };
}
