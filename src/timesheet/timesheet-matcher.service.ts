import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type MatchConfidence = 'exact' | 'fuzzy' | 'none';

export interface MatchResult {
  found: boolean;
  confidence: MatchConfidence;
  employeeId?: string;
  matchedName?: string;
}

@Injectable()
export class TimesheetMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  async findBestMatch(ocrName: string): Promise<MatchResult> {
    if (!ocrName?.trim()) {
      return { found: false, confidence: 'none' };
    }

    const normalized = this.normalize(ocrName);

    // Load all active employees
    const employees = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
    });

    if (employees.length === 0) {
      return { found: false, confidence: 'none' };
    }

    let bestMatch: { id: string; name: string; distance: number } | null = null;

    for (const emp of employees) {
      const distance = this.levenshtein(normalized, this.normalize(emp.name));

      if (bestMatch === null || distance < bestMatch.distance) {
        bestMatch = { id: emp.id, name: emp.name, distance };
      }
    }

    if (!bestMatch) {
      return { found: false, confidence: 'none' };
    }

    if (bestMatch.distance === 0) {
      return {
        found: true,
        confidence: 'exact',
        employeeId: bestMatch.id,
        matchedName: bestMatch.name,
      };
    }

    // Allow fuzzy match for small distances relative to name length
    const maxAllowedDistance = Math.max(2, Math.floor(normalized.length * 0.25));
    if (bestMatch.distance <= maxAllowedDistance) {
      return {
        found: true,
        confidence: 'fuzzy',
        employeeId: bestMatch.id,
        matchedName: bestMatch.name,
      };
    }

    return { found: false, confidence: 'none' };
  }

  private normalize(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/\s+/g, ' ');
  }

  /**
   * Classic Levenshtein edit-distance implementation.
   * O(n*m) time, O(min(n,m)) space.
   */
  private levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // Ensure a is the shorter string for space optimization
    if (a.length > b.length) [a, b] = [b, a];

    let prev = Array.from({ length: a.length + 1 }, (_, i) => i);

    for (let j = 1; j <= b.length; j++) {
      const curr = [j];
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr.push(Math.min(
          prev[i] + 1,       // deletion
          curr[i - 1] + 1,   // insertion
          prev[i - 1] + cost // substitution
        ));
      }
      prev = curr;
    }

    return prev[a.length];
  }
}
