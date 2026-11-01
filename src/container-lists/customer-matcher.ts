export const KNOWN_CONTAINER_SITES = [
  'Gant',
  'Brooks',
  'Schwalbe',
  'WE-Britax',
  'Medisana',
  'Zwilling',
  'ProHeq',
  'LOXX',
] as const;

export type KnownContainerSite = (typeof KNOWN_CONTAINER_SITES)[number];
export type CustomerMatchType = 'exact' | 'ambiguous' | 'unknown' | 'none';

export interface CustomerMatchResult {
  detectedCustomerRaw: string | null;
  matchedSite: KnownContainerSite | null;
  matchType: CustomerMatchType;
  candidates: KnownContainerSite[];
  requiresConfirmation: boolean;
  warning?: string;
}

export interface OtherWorkEntry {
  personal?: number;
  von?: string;
  bis?: string;
  bemerkung?: string;
}

const EXACT_SITE_ALIASES: Record<KnownContainerSite, string[]> = {
  Gant: ['gant', 'we gant', 'we-gant', 'gant logistik', 'gant logistics'],
  Brooks: ['brooks', 'we brooks', 'we-brooks', 'brooks running', 'brooks sports', 'brooks sport'],
  Schwalbe: [
    'schwalbe',
    'we schwalbe',
    'we-schwalbe',
    'we.schwalbe',
    'we.-schwalbe',
    'ralf bohle',
    'ralf bohle gmbh',
    'bohle schwalbe',
  ],
  'WE-Britax': [
    'we-britax',
    'we.-britax',
    'we.britax',
    'we britax',
    'britax',
    'britax romer',
    'britax römer',
    'britax roemer',
    'britax-romer',
    'britax-römer',
    'britax-roemer',
  ],
  Medisana: ['medisana', 'we medisana', 'we-medisana', 'medisana gmbh'],
  Zwilling: [
    'zwilling',
    'we zwilling',
    'we-zwilling',
    'zwilling j a henckels',
    'zwilling henckels',
  ],
  ProHeq: [
    'proheq',
    'pro heq',
    'we proheq',
    'we-proheq',
    'we.proheq',
    'we.-proheq',
    'wmf proheq',
    'proheq gmbh',
  ],
  LOXX: ['loxx', 'we loxx', 'we-loxx', 'loxx logistik', 'loxx logistics', 'rhenus loxx'],
};

const CORE_SITE_TOKENS: Record<KnownContainerSite, string> = {
  Gant: 'gant',
  Brooks: 'brooks',
  Schwalbe: 'schwalbe',
  'WE-Britax': 'britax',
  Medisana: 'medisana',
  Zwilling: 'zwilling',
  ProHeq: 'proheq',
  LOXX: 'loxx',
};

export function normalizeCustomerToken(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[._,/\\()+&:;'"-]+/g, ' ')
    .replace(/\b(gmbh|ag|kg|co|inc|ltd|llc|logistik|logistics)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches a raw customer name extracted from a document against known warehouse sites.
 * - Exact normalized match -> matchType: 'exact', requiresConfirmation: false
 * - Partial / ambiguous match -> matchType: 'ambiguous', requiresConfirmation: true
 * - Unknown customer name -> matchType: 'unknown', requiresConfirmation: true
 * - Empty / missing -> matchType: 'none', requiresConfirmation: true
 */
export function matchCustomerSite(rawCustomer: string | null | undefined): CustomerMatchResult {
  const rawTrimmed = (rawCustomer ?? '').trim();
  if (!rawTrimmed) {
    return {
      detectedCustomerRaw: null,
      matchedSite: null,
      matchType: 'none',
      candidates: [],
      requiresConfirmation: true,
      warning:
        'Kein Kunde im Dokument erkannt. Bitte wählen und bestätigen Sie den Kunden manuell.',
    };
  }

  const lowerCleaned = rawTrimmed
    .toLowerCase()
    .replace(/[._,/\\()+&:;'"-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalized = normalizeCustomerToken(rawTrimmed);

  // Ambiguous prefix "WE" alone matches WE-Britax, WE.-ProHeq, WE-Schwalbe
  if (lowerCleaned === 'we' || normalized === 'we') {
    const candidates: KnownContainerSite[] = ['WE-Britax', 'ProHeq', 'Schwalbe'];
    return {
      detectedCustomerRaw: rawTrimmed,
      matchedSite: null,
      matchType: 'ambiguous',
      candidates,
      requiresConfirmation: true,
      warning: `Mehrdeutige Kundenangabe "${rawTrimmed}" erkannt (mögliche Treffer: ${candidates.join(', ')}). Bitte ausdrücklich bestätigen.`,
    };
  }

  // 1. Check exact alias match first
  for (const site of KNOWN_CONTAINER_SITES) {
    const aliases = EXACT_SITE_ALIASES[site].map((a) => normalizeCustomerToken(a));
    if (aliases.includes(normalized) || aliases.includes(lowerCleaned)) {
      return {
        detectedCustomerRaw: rawTrimmed,
        matchedSite: site,
        matchType: 'exact',
        candidates: [site],
        requiresConfirmation: false,
      };
    }
  }

  // Strip leading "we " if present and check exact core token
  const withoutWe = normalized.replace(/^we\s+/, '').trim();
  for (const site of KNOWN_CONTAINER_SITES) {
    const aliases = EXACT_SITE_ALIASES[site].map((a) =>
      normalizeCustomerToken(a).replace(/^we\s+/, '').trim(),
    );
    if (withoutWe && aliases.includes(withoutWe)) {
      return {
        detectedCustomerRaw: rawTrimmed,
        matchedSite: site,
        matchType: 'exact',
        candidates: [site],
        requiresConfirmation: false,
      };
    }
  }

  // 2. Check partial / substring / multi-candidate matches
  const matchedCandidates = new Set<KnownContainerSite>();
  const words = withoutWe.split(/\s+/).filter(Boolean);

  for (const site of KNOWN_CONTAINER_SITES) {
    const core = CORE_SITE_TOKENS[site];
    if (withoutWe.includes(core)) {
      matchedCandidates.add(site);
      continue;
    }
    for (const w of words) {
      if (w.length >= 3 && (core.startsWith(w) || w.startsWith(core))) {
        matchedCandidates.add(site);
      }
    }
  }

  if (matchedCandidates.size > 0) {
    const candidates = Array.from(matchedCandidates);
    return {
      detectedCustomerRaw: rawTrimmed,
      matchedSite: candidates.length === 1 ? candidates[0] : null,
      matchType: 'ambiguous',
      candidates,
      requiresConfirmation: true,
      warning:
        candidates.length === 1
          ? `Teilübereinstimmung für Kunde "${rawTrimmed}" → "${candidates[0]}". Bitte Kunden ausdrücklich bestätigen.`
          : `Mehrdeutige Kundenangabe "${rawTrimmed}" (Kandidaten: ${candidates.join(', ')}). Bitte Kunden auswählen und bestätigen.`,
    };
  }

  // 3. Unknown customer name
  return {
    detectedCustomerRaw: rawTrimmed,
    matchedSite: null,
    matchType: 'unknown',
    candidates: [],
    requiresConfirmation: true,
    warning: `Unbekannter Kunde "${rawTrimmed}" im Dokument erkannt. Bitte gültigen Kunden manuell auswählen und bestätigen.`,
  };
}

/**
 * Extracts raw customer candidate from free text (PDF text, CSV text, filename, etc.).
 * Never invents a default customer.
 */
export function extractRawCustomerFromText(
  text: string | null | undefined,
  filename?: string | null,
): string | null {
  const combined = `${text ?? ''}\n${filename ?? ''}`;
  if (!combined.trim()) return null;

  // 1. Explicit "Kunde: <value>" or "Customer: <value>" pattern
  const explicitMatch = combined.match(
    /(?:kunde|kundenname|auftraggeber|client)\s*[:=-]\s*([^\r\n,;|]+)/i,
  );
  if (explicitMatch && explicitMatch[1]?.trim()) {
    const rawSegment = explicitMatch[1]
      .split(
        /\b(?:we-datum|datum|container|containernr|fuß|fuss|anzahl|artikel|karton|kartons|termin|ankunft|beginn|start|ende|dauer|personal|wartezeit|wickel|preis|bemerkung)\b/i,
      )[0]
      .trim();
    if (rawSegment && !/^(datum|preis|wartezeit|bemerkung)$/i.test(rawSegment)) {
      return rawSegment;
    }
  }

  // 2. Check for known customer tokens in text or filename
  const foundSites: KnownContainerSite[] = [];
  for (const site of KNOWN_CONTAINER_SITES) {
    const core = CORE_SITE_TOKENS[site];
    const regex = new RegExp(`\\b(?:we[.-]?\\s*)?${core}\\b`, 'i');
    if (regex.test(combined)) {
      foundSites.push(site);
    }
  }

  if (foundSites.length === 1) {
    return foundSites[0];
  }
  if (foundSites.length > 1) {
    return foundSites.join(' / ');
  }

  return null;
}

export interface ParsedClockTime {
  minutes: number | null;
  formatted: string | null;
  isUnclear: boolean;
  reason?: string;
}

/**
 * Parses a clock time (HH:MM, HH:MM:SS, or "9.00" when inside a von-bis range).
 * Never treats decimal hours as clock times unless explicitly flagged.
 */
export function parseClockTime(
  raw: string | number | Date | null | undefined,
  allowDotSeparator = false,
): ParsedClockTime {
  if (raw === null || raw === undefined || raw === '') {
    return { minutes: null, formatted: null, isUnclear: false };
  }

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const h = raw.getUTCHours();
    const m = raw.getUTCMinutes();
    return {
      minutes: h * 60 + m,
      formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      isUnclear: false,
    };
  }

  if (typeof raw === 'number') {
    if (raw >= 0 && raw < 1) {
      const totalMins = Math.round(raw * 1440);
      const h = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      return {
        minutes: h * 60 + m,
        formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        isUnclear: false,
      };
    }
    return {
      minutes: null,
      formatted: null,
      isUnclear: true,
      reason: `Zahlenwert "${raw}" ist keine gültige Uhrzeit (Dezimalstunden dürfen nicht als Uhrzeit interpretiert werden).`,
    };
  }

  const s = String(raw).trim();
  if (!s) return { minutes: null, formatted: null, isUnclear: false };

  // Non-time status words like "abgesagt"
  if (/^(abgesagt|cancelled|storno|-+)$/i.test(s)) {
    return { minutes: null, formatted: null, isUnclear: false };
  }

  // Standard HH:MM or HH:MM:SS
  const colonMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return {
        minutes: h * 60 + m,
        formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        isUnclear: false,
      };
    }
    return {
      minutes: null,
      formatted: null,
      isUnclear: true,
      reason: `Ungültige Uhrzeit "${s}" (Stunden 0–23, Minuten 0–59 erwartet).`,
    };
  }

  // Dot separator like "9.00" in Gant ("9.00 bis 9.50") ONLY when allowDotSeparator is true
  if (allowDotSeparator) {
    const dotMatch = s.match(/^(\d{1,2})\.(\d{2})$/);
    if (dotMatch) {
      const h = parseInt(dotMatch[1], 10);
      const m = parseInt(dotMatch[2], 10);
      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        return {
          minutes: h * 60 + m,
          formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          isUnclear: false,
        };
      }
    }
  }

  return {
    minutes: null,
    formatted: null,
    isUnclear: true,
    reason: `Unklares Uhrzeitformat "${s}".`,
  };
}

/**
 * Splits a combined Wartezeit range string (e.g. "09:00 bis 09:50", "9.00 bis 9.50", "08:00-09:30")
 * into { von, bis }.
 */
export function splitWartezeitRange(
  vonRaw?: string | null,
  bisRaw?: string | null,
): { von: string | null; bis: string | null; isUnclear: boolean; reason?: string } {
  const v = (vonRaw ?? '').trim();
  const b = (bisRaw ?? '').trim();

  if (!v && !b) {
    return { von: null, bis: null, isUnclear: false };
  }

  // Check if vonRaw already contains a range like "09:00 bis 09:50" or "08:00-09:30" or "9.00 bis 9.50"
  const rangeMatch = v.match(
    /^(\d{1,2}[:.]\d{2}(?::\d{2})?)\s*(?:bis|-|–|—|to)\s*(\d{1,2}[:.]\d{2}(?::\d{2})?)$/i,
  );
  if (rangeMatch) {
    const p1 = parseClockTime(rangeMatch[1], true);
    const p2 = parseClockTime(rangeMatch[2], true);
    if (p1.isUnclear || p2.isUnclear || p1.minutes === null || p2.minutes === null) {
      return {
        von: rangeMatch[1],
        bis: rangeMatch[2],
        isUnclear: true,
        reason: p1.reason || p2.reason || `Unklares Wartezeit-Intervall "${v}".`,
      };
    }
    return { von: p1.formatted, bis: p2.formatted, isUnclear: false };
  }

  if (v && b) {
    const p1 = parseClockTime(v, true);
    const p2 = parseClockTime(b, true);
    if (p1.isUnclear || p2.isUnclear || p1.minutes === null || p2.minutes === null) {
      return {
        von: v,
        bis: b,
        isUnclear: true,
        reason: p1.reason || p2.reason || `Unklares Wartezeit-Intervall "${v} bis ${b}".`,
      };
    }
    return { von: p1.formatted, bis: p2.formatted, isUnclear: false };
  }

  return {
    von: v || null,
    bis: b || null,
    isUnclear: true,
    reason: `Unvollständige Wartezeit Von–Bis Angabe ("${v || b}").`,
  };
}

/**
 * Formats Wartezeit Von-Bis as ONE combined text cell (e.g. "09:00 bis 09:50").
 */
export function formatCombinedWartezeitCell(
  vonRaw?: string | null,
  bisRaw?: string | null,
): string | null {
  const v = (vonRaw ?? '').trim();
  const b = (bisRaw ?? '').trim();
  if (!v && !b) return null;

  const split = splitWartezeitRange(v, b);
  if (split.von && split.bis) {
    return `${split.von} bis ${split.bis}`;
  }
  return v || b || null;
}

/**
 * Parses a duration string or number into decimal hours.
 * - "1:40" or "1:40 Std." -> 1 hour 40 minutes = 1.6666667 hours (NEVER 1.40 decimal hours!)
 * - "3,75" or "3,75 Std." -> 3.75 hours
 * - "1.40" (dot with non-quarter two digits) -> flagged as unclear rather than guessing!
 */
export function parseDurationToHours(raw: string | number | null | undefined): {
  hours: number | null;
  isUnclear: boolean;
  reason?: string;
} {
  if (raw === null || raw === undefined || raw === '') {
    return { hours: null, isUnclear: false };
  }

  if (typeof raw === 'number') {
    if (isNaN(raw) || raw < 0) {
      return { hours: null, isUnclear: true, reason: `Ungültige Dauer "${raw}".` };
    }
    return { hours: raw, isUnclear: false };
  }

  const cleaned = String(raw)
    .replace(/std\.?|stunden?|hours?|hrs?|h\b/gi, '')
    .trim();
  if (!cleaned) return { hours: null, isUnclear: false };

  // Colon format: H:MM or HH:MM or HH:MM:SS -> strictly hours + minutes/60
  const colonMatch = cleaned.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    const s = colonMatch[3] ? parseInt(colonMatch[3], 10) : 0;
    if (m >= 60 || s >= 60 || colonMatch[2].length !== 2) {
      return {
        hours: null,
        isUnclear: true,
        reason: `Unklares Zeitformat "${raw}" (Minuten müssen zweistellig 00–59 sein).`,
      };
    }
    return { hours: h + m / 60 + s / 3600, isUnclear: false };
  }

  // German comma decimal format: "3,75" or "4,5"
  const commaMatch = cleaned.match(/^(\d+),(\d+)$/);
  if (commaMatch) {
    const val = parseFloat(`${commaMatch[1]}.${commaMatch[2]}`);
    return { hours: val, isUnclear: false };
  }

  // Integer format: "0", "3", "6"
  if (/^\d+$/.test(cleaned)) {
    return { hours: parseInt(cleaned, 10), isUnclear: false };
  }

  // Dot format: e.g. "1.40" vs "3.75"
  const dotMatch = cleaned.match(/^(\d+)\.(\d+)$/);
  if (dotMatch) {
    const frac = dotMatch[2];
    const num = parseFloat(cleaned);
    // If someone wrote "1.40" or "2.30" (two digits after dot, <= 59, not .25/.50/.75/.00), it is ambiguous between 1:40 (1h40m) and 1.40 decimal hours!
    if (
      frac.length === 2 &&
      !['00', '25', '50', '75'].includes(frac) &&
      parseInt(frac, 10) < 60
    ) {
      return {
        hours: null,
        isUnclear: true,
        reason: `Unklares Dauerformat "${raw}": Punkt-Notation ist mehrdeutig zwischen Uhrzeit/Stunden:Minuten (${dotMatch[1]}:${frac}) und Dezimalstunden (${dotMatch[1]},${frac}).`,
      };
    }
    return { hours: num, isUnclear: false };
  }

  return {
    hours: null,
    isUnclear: true,
    reason: `Unklares Dauerformat "${raw}".`,
  };
}

export interface RowWaitingCalculation {
  workerHours: number;
  baseWorkerHours: number;
  deductionWorkerHours: number;
  waitingDurationHours: number;
  warnings: string[];
}

/**
 * Calculates waiting worker-hours for a single row:
 *   waiting duration (bis - von) * personal - sum(otherWorkDuration * otherWorkPersonal)
 * Never infers shared workers from overlapping container rows; only deducts explicit anderweitigeArbeiten entries.
 */
export function calculateRowWaitingWorkerHours(row: {
  personal?: number | string | null;
  wartezeitVon?: string | null;
  wartezeitBis?: string | null;
  wartezeitStd?: number | string | null;
  anderweitigeArbeiten?: OtherWorkEntry[] | null;
}): RowWaitingCalculation {
  const warnings: string[] = [];
  const personalCount =
    row.personal !== null && row.personal !== undefined && String(row.personal).trim() !== ''
      ? Number(row.personal)
      : null;

  let waitingDurationHours = 0;
  let baseWorkerHours = 0;
  let vonMinutes: number | null = null;
  let bisMinutes: number | null = null;

  const hasVonOrBis = Boolean(
    (row.wartezeitVon && String(row.wartezeitVon).trim()) ||
      (row.wartezeitBis && String(row.wartezeitBis).trim()),
  );

  if (hasVonOrBis) {
    const split = splitWartezeitRange(row.wartezeitVon, row.wartezeitBis);
    if (split.isUnclear) {
      if (split.reason) warnings.push(split.reason);
    } else if (split.von && split.bis) {
      const pVon = parseClockTime(split.von, true);
      const pBis = parseClockTime(split.bis, true);
      if (pVon.minutes !== null && pBis.minutes !== null) {
        if (pBis.minutes < pVon.minutes) {
          warnings.push(
            `Wartezeit Ende (${split.bis}) liegt vor Wartezeit Beginn (${split.von}).`,
          );
        } else {
          vonMinutes = pVon.minutes;
          bisMinutes = pBis.minutes;
          waitingDurationHours = (pBis.minutes - pVon.minutes) / 60;
          if (waitingDurationHours > 0 && (!personalCount || personalCount <= 0)) {
            warnings.push(
              `Wartezeit (${split.von} bis ${split.bis}) angegeben, aber Personal-Anzahl fehlt oder ist 0.`,
            );
          } else if (personalCount && personalCount > 0) {
            baseWorkerHours = waitingDurationHours * personalCount;
          }
        }
      }
    }
  } else if (
    row.wartezeitStd !== null &&
    row.wartezeitStd !== undefined &&
    String(row.wartezeitStd).trim() !== ''
  ) {
    const parsed = parseDurationToHours(row.wartezeitStd);
    if (parsed.isUnclear) {
      if (parsed.reason) warnings.push(parsed.reason);
    } else if (parsed.hours !== null && parsed.hours > 0) {
      waitingDurationHours = parsed.hours;
      baseWorkerHours = parsed.hours;
    }
  }

  // Deductions for explicit anderweitigeArbeiten entries on this row
  let deductionWorkerHours = 0;
  const entries = Array.isArray(row.anderweitigeArbeiten) ? row.anderweitigeArbeiten : [];
  for (const entry of entries) {
    if (!entry) continue;
    const workers = Number(entry.personal);
    if (!workers || isNaN(workers) || workers <= 0) {
      warnings.push('Abzug für anderweitige Arbeit hat keine gültige Personal-Anzahl.');
      continue;
    }
    if (personalCount !== null && workers > personalCount) {
      warnings.push(
        `Abzug für anderweitige Arbeit (${workers} Personal) überschreitet Personal-Anzahl der Zeile (${personalCount}).`,
      );
    }
    const splitEntry = splitWartezeitRange(entry.von, entry.bis);
    if (splitEntry.isUnclear || !splitEntry.von || !splitEntry.bis) {
      warnings.push(
        splitEntry.reason ||
          `Unvollständige Zeitangabe für anderweitige Arbeit (${entry.von || ''}–${entry.bis || ''}).`,
      );
      continue;
    }
    const eVon = parseClockTime(splitEntry.von, true);
    const eBis = parseClockTime(splitEntry.bis, true);
    if (eVon.minutes === null || eBis.minutes === null || eBis.minutes <= eVon.minutes) {
      warnings.push(
        `Ungültiges Zeitfenster für anderweitige Arbeit (${splitEntry.von} bis ${splitEntry.bis}).`,
      );
      continue;
    }

    // Clamp to waiting window if waiting window is known
    const effStart = vonMinutes !== null ? Math.max(vonMinutes, eVon.minutes) : eVon.minutes;
    const effEnd = bisMinutes !== null ? Math.min(bisMinutes, eBis.minutes) : eBis.minutes;
    if (effEnd > effStart) {
      const effWorkers =
        personalCount !== null && personalCount > 0 ? Math.min(workers, personalCount) : workers;
      deductionWorkerHours += ((effEnd - effStart) / 60) * effWorkers;
    }
  }

  const workerHours = Math.max(0, baseWorkerHours - deductionWorkerHours);
  return {
    workerHours,
    baseWorkerHours,
    deductionWorkerHours,
    waitingDurationHours,
    warnings,
  };
}

/**
 * Calculates Schwalbe's unloading work-hours without waiting time for a single row:
 *   (Ende der Entladung - Beginn der Entladung) * Personal Anzahl
 */
export function calculateRowWorkWorkerHoursWithoutWaiting(row: {
  start?: string | null;
  ende?: string | null;
  personal?: number | string | null;
}): { workerHours: number; durationHours: number; warnings: string[] } {
  const warnings: string[] = [];
  const pStart = parseClockTime(row.start, true);
  const pEnde = parseClockTime(row.ende, true);
  if (pStart.isUnclear && pStart.reason) warnings.push(pStart.reason);
  if (pEnde.isUnclear && pEnde.reason) warnings.push(pEnde.reason);

  if (pStart.minutes === null || pEnde.minutes === null) {
    return { workerHours: 0, durationHours: 0, warnings };
  }
  if (pEnde.minutes < pStart.minutes) {
    warnings.push(`Ende der Entladung (${row.ende}) liegt vor Beginn (${row.start}).`);
    return { workerHours: 0, durationHours: 0, warnings };
  }

  const durationHours = (pEnde.minutes - pStart.minutes) / 60;
  const personalCount =
    row.personal !== null && row.personal !== undefined && String(row.personal).trim() !== ''
      ? Number(row.personal)
      : 0;
  const workerHours = personalCount > 0 ? durationHours * personalCount : 0;
  return { workerHours, durationHours, warnings };
}

/**
 * Formats decimal hours in German notation with "Std." suffix:
 * - 0 -> "0 Std."
 * - 3.75 -> "3,75 Std."
 * - 4.5 -> "4,5 Std."
 * - 6 -> "6 Std."
 */
export function formatGermanStd(hours: number): string {
  if (!hours || isNaN(hours) || Math.abs(hours) < 1e-6) {
    return '0 Std.';
  }
  const rounded = Math.round(hours * 100) / 100;
  const formattedNumber = rounded
    .toFixed(2)
    .replace(/\.?0+$/, '')
    .replace('.', ',');
  return `${formattedNumber} Std.`;
}
