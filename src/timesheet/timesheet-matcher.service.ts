import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type MatchConfidence = 'exact' | 'fuzzy' | 'none';

export interface MatchResult {
  found: boolean;
  confidence: MatchConfidence;
  /** Numeric match score 0–100 */
  score: number;
  employeeId?: string;
  matchedName?: string;
}

@Injectable()
export class TimesheetMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find the best employee in the DB for a given OCR-extracted name.
   *
   * Strategy stack (returns highest score across all strategies):
   *   1. Full normalized name Levenshtein
   *   2. Token-set matching (handles reversed names: "Müller Max" ↔ "Max Müller")
   *   3. First-name-only (single OCR token matched against first DB name token)
   *   4. Initial matching ("M. Müller" → "Max Müller")
   */
  async findBestMatch(ocrName: string): Promise<MatchResult> {
    if (!ocrName?.trim() || ocrName.toLowerCase().includes('unbekannt')) {
      return { found: false, confidence: 'none', score: 0 };
    }

    const normalized = this.normalize(ocrName);
    const ocrTokens  = normalized.split(/\s+/).filter(Boolean);

    const employees = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
    });

    if (employees.length === 0) {
      return { found: false, confidence: 'none', score: 0 };
    }

    let best: { id: string; name: string; score: number } | null = null;

    for (const emp of employees) {
      const empNorm   = this.normalize(emp.name);
      const empTokens = empNorm.split(/\s+/).filter(Boolean);

      // Strategy 1: full-name Levenshtein
      const s1 = this.levScore(normalized, empNorm);

      // Strategy 2: token-set (any word ordering, e.g. "Müller Max" ↔ "Max Müller")
      const s2 = this.tokenSetScore(ocrTokens, empTokens);

      // Strategy 3: single-token match against any DB token (e.g. only last name written)
      let s3 = 0;
      if (ocrTokens.length === 1 && empTokens.length > 0) {
        for (const empTok of empTokens) {
          const score = this.levScore(ocrTokens[0], empTok);
          if (score > s3) s3 = score;
        }
        // If one token matches an employee token with >= 85%, give a solid match score
        if (s3 >= 85) s3 = Math.max(s3, 80);
      }

      // Strategy 4: initial matching ("M." or "M" → first letter of first name)
      const s4 = this.initialScore(ocrTokens, empTokens);

      // Strategy 5: subset matching in either direction:
      // (a) All OCR tokens match some DB token (e.g. "Abdi Hirad" in "Abdi Hirad Mubarek")
      // (b) All DB tokens match some OCR token (e.g. "Hussein Barakat" in "Hussein Barakat Ali")
      let s5 = 0;
      if (ocrTokens.length >= 2 && empTokens.length >= 2) {
        const allOcrInEmp = ocrTokens.every(ot => empTokens.some(et => this.levScore(ot, et) >= 80));
        const allEmpInOcr = empTokens.every(et => ocrTokens.some(ot => this.levScore(et, ot) >= 80));
        if (allOcrInEmp || allEmpInOcr) {
          s5 = 90;
        }
      }

      const score = Math.max(s1, s2, s3, s4, s5);

      if (!best || score > best.score) {
        best = { id: emp.id, name: emp.name, score };
      }
    }

    if (!best || best.score < 40) {
      return { found: false, confidence: 'none', score: best?.score ?? 0 };
    }

    if (best.score >= 85) {
      return {
        found: true,
        confidence: 'exact',
        score: best.score,
        employeeId: best.id,
        matchedName: best.name,
      };
    }

    if (best.score >= 50) {
      return {
        found: true,
        confidence: 'fuzzy',
        score: best.score,
        employeeId: best.id,
        matchedName: best.name,
      };
    }

    return { found: false, confidence: 'none', score: best.score };
  }

  // ─── Normalization ────────────────────────────────────────────────────────

  /**
   * Normalizes a name for comparison:
   * – lowercases, trims, collapses whitespace
   * – expands German umlauts AND handles all-caps OCR output
   * – removes trailing punctuation (dots after initials)
   */
  normalize(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/^(herr|frau|dr\.?)\s+/i, '')
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/\.\s*/g, ' ')     // "M. Müller" → "M Müller"
      .replace(/,\s*/g, ' ')      // "Müller, Max" → "Müller Max"
      .replace(/[\-_/\\:]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // ─── Scoring strategies ───────────────────────────────────────────────────

  /** Levenshtein-based score 0–100 */
  private levScore(a: string, b: string): number {
    if (a === b) return 100;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 100;
    return Math.max(0, Math.round((1 - this.levenshtein(a, b) / maxLen) * 100));
  }

  /**
   * Token-set score: tries both original and reversed token orderings,
   * returns the best. This handles "Müller Max" matching "Max Müller".
   */
  private tokenSetScore(ocrToks: string[], empToks: string[]): number {
    return Math.max(
      this.compareTokens(ocrToks, empToks),
      this.compareTokens([...ocrToks].reverse(), empToks),
    );
  }

  private compareTokens(a: string[], b: string[]): number {
    if (!a.length || !b.length) return 0;
    let total = 0;
    let matched = 0;
    for (const aTok of a) {
      let best = 0;
      for (const bTok of b) best = Math.max(best, this.levScore(aTok, bTok));
      total += best;
      if (best >= 70) matched++;
    }
    const avg = total / a.length;
    // Completeness bonus when all tokens find a decent pair
    const bonus = matched === Math.min(a.length, b.length) ? 8 : 0;
    return Math.min(100, avg + bonus);
  }

  /**
   * Initial score: handles "M. Müller" → "Max Müller".
   * For each OCR token that is 1 char (or ends with "."), check if the
   * corresponding DB token starts with that char.
   */
  private initialScore(ocrToks: string[], empToks: string[]): number {
    if (ocrToks.length < 2 || empToks.length < 2) return 0;
    let total = 0;
    let count = 0;
    const len = Math.min(ocrToks.length, empToks.length);
    for (let i = 0; i < len; i++) {
      const ot = ocrToks[i].replace(/\.$/, '');
      const et = empToks[i];
      if (ot.length === 1) {
        // Initial: "m" should match "max"
        total += et.startsWith(ot) ? 80 : 0;
      } else {
        total += this.levScore(ot, et);
      }
      count++;
    }
    return count > 0 ? Math.round(total / count) : 0;
  }

  // ─── Levenshtein ─────────────────────────────────────────────────────────

  private levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    if (a.length > b.length) [a, b] = [b, a];

    let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
    for (let j = 1; j <= b.length; j++) {
      const curr = [j];
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr.push(Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost));
      }
      prev = curr;
    }
    return prev[a.length];
  }
}
