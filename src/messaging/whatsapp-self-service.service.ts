import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TimesheetService } from '../timesheet/timesheet.service';

export type SupportedLanguage = 'de' | 'tr' | 'ar' | 'uk';

export type SelfServiceIntentType =
  | 'HOURS'
  | 'PLANS'
  | 'CROSS_WORKER_ACCESS'
  | 'MUTATION_ATTEMPT'
  | 'UNSUPPORTED';

export type SelfServicePeriodType =
  | 'CURRENT_MONTH'
  | 'MONTH'
  | 'EXACT_DATE'
  | 'UPCOMING'
  | 'HISTORICAL';

export interface ParsedSelfServiceIntent {
  language: SupportedLanguage;
  intent: SelfServiceIntentType;
  periodType: SelfServicePeriodType;
  year?: number;
  month?: number; // 1..12
  date?: string; // YYYY-MM-DD
  isDateAmbiguous?: boolean;
  ambiguityReason?: string;
}

export interface VerifiedWorkerIdentity {
  status: 'MATCHED' | 'UNKNOWN' | 'AMBIGUOUS';
  normalizedPhone: string;
  worker: {
    id: string;
    name: string;
    phone: string;
    role: string;
  } | null;
}

export interface SelfServiceReplyResult {
  handled: boolean;
  status:
    | 'OK'
    | 'CLARIFICATION_NEEDED'
    | 'NO_RECORDS'
    | 'CROSS_WORKER_DENIED'
    | 'MUTATION_DENIED'
    | 'UNKNOWN_IDENTITY'
    | 'AMBIGUOUS_IDENTITY'
    | 'DUPLICATE_MESSAGE'
    | 'UNSUPPORTED_INTENT';
  language: SupportedLanguage;
  intent?: SelfServiceIntentType;
  periodLabel?: string;
  totalHours?: number | null;
  plansCount?: number;
  replyText: string;
}

const MONTH_NAMES_BY_LANG: Record<SupportedLanguage, string[]> = {
  de: [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ],
  tr: [
    'Ocak',
    'Şubat',
    'Mart',
    'Nisan',
    'Mayıs',
    'Haziran',
    'Temmuz',
    'Ağustos',
    'Eylül',
    'Ekim',
    'Kasım',
    'Aralık',
  ],
  ar: [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ],
  uk: [
    'січень',
    'лютий',
    'березень',
    'квітень',
    'травень',
    'червень',
    'липень',
    'серпень',
    'вересень',
    'жовтень',
    'листопад',
    'грудень',
  ],
};

const MONTH_TOKEN_MAP: Array<{ month: number; patterns: RegExp[] }> = [
  {
    month: 1,
    patterns: [
      /\bjanuar\b/i,
      /\bjan\b/i,
      /\bocak\b/i,
      /يناير/,
      /كانون\s*الثاني/,
      /січн[яію]|січень/i,
    ],
  },
  {
    month: 2,
    patterns: [
      /\bfebruar\b/i,
      /\bfeb\b/i,
      /(?:^|[^\p{L}\p{N}])[sş]ubat(?=$|[^\p{L}\p{N}])/iu,
      /فبراير/,
      /شباط/,
      /лют(ий|ого|ому)/i,
    ],
  },
  {
    month: 3,
    patterns: [
      /\bm[äa]e?rz\b/i,
      /\bmart\b/i,
      /مارس/,
      /[آأا]ذار/,
      /берез(ень|ня|ні)/i,
    ],
  },
  {
    month: 4,
    patterns: [
      /\bapril\b/i,
      /\bnisan\b/i,
      /[أإا]بريل/,
      /نيسان/,
      /квіт(ень|ня|ні)/i,
    ],
  },
  {
    month: 5,
    patterns: [
      /\bmai\b/i,
      /\bmay[ıi]s\b/i,
      /مايو/,
      /[أإا]يار/,
      /трав(ень|ня|ні)/i,
    ],
  },
  {
    month: 6,
    patterns: [
      /\bjuni\b/i,
      /\bhaziran\b/i,
      /يونيو/,
      /حزيران/,
      /черв(ень|ня|ні)/i,
    ],
  },
  {
    month: 7,
    patterns: [
      /\bjuli\b/i,
      /\btemmuz\b/i,
      /يوليو/,
      /تموز/,
      /лип(ень|ня|ні)/i,
    ],
  },
  {
    month: 8,
    patterns: [
      /\baugust\b/i,
      /\ba[ğg]ustos\b/i,
      /[أإا]غسطس/,
      /آب/,
      /серп(ень|ня|ні)/i,
    ],
  },
  {
    month: 9,
    patterns: [
      /\bseptember\b/i,
      /\bsep\b/i,
      /\beyl[üu]l\b/i,
      /سبتمبر/,
      /[أإا]يلول/,
      /верес(ень|ня|ні)/i,
    ],
  },
  {
    month: 10,
    patterns: [
      /\boktober\b/i,
      /\bokt\b/i,
      /\bekim\b/i,
      /[أإا]كتوبر/,
      /تشرين\s*ال[أإا]ول/,
      /жовт(ень|ня|ні)/i,
    ],
  },
  {
    month: 11,
    patterns: [
      /\bnovember\b/i,
      /\bnov\b/i,
      /\bkas[ıi]m\b/i,
      /نوفمبر/,
      /تشرين\s*الثاني/,
      /листопад(а|і)?/i,
    ],
  },
  {
    month: 12,
    patterns: [
      /\bdezember\b/i,
      /\bdez\b/i,
      /\baral[ıi]k\b/i,
      /ديسمبر/,
      /كانون\s*ال[أإا]ول/,
      /груд(ень|ня|ні)/i,
    ],
  },
];

@Injectable()
export class WhatsappSelfServiceService {
  private readonly logger = new Logger(WhatsappSelfServiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timesheetService: TimesheetService,
    private readonly configService: ConfigService,
  ) {}

  // ─── 1. Webhook Signature Verification ────────────────────────────────────

  /**
   * Verifies Meta X-Hub-Signature-256 HMAC-SHA256 signature over the raw payload.
   * Rejects requests with missing/invalid signatures or missing app secret.
   */
  verifyWebhookSignature(
    rawBody: Buffer | string | undefined,
    signatureHeader: string | undefined,
    secretOverride?: string,
  ): boolean {
    const candidates = [
      secretOverride,
      this.configService?.get<string>('WHATSAPP_APP_SECRET'),
      this.configService?.get<string>('META_APP_SECRET'),
      process.env.WHATSAPP_APP_SECRET,
      process.env.META_APP_SECRET,
    ];
    const appSecret = candidates
      .find((c): c is string => typeof c === 'string' && c.trim().length > 0)
      ?.trim();

    if (!appSecret) {
      this.logger.error(
        '[WhatsApp Webhook] Missing WHATSAPP_APP_SECRET / META_APP_SECRET configuration; rejecting webhook request.',
      );
      throw new UnauthorizedException('Webhook app secret is not configured');
    }

    if (!signatureHeader || typeof signatureHeader !== 'string') {
      this.logger.warn('[WhatsApp Webhook] Missing X-Hub-Signature-256 header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    const trimmedSig = signatureHeader.trim();
    if (!trimmedSig.toLowerCase().startsWith('sha256=')) {
      this.logger.warn('[WhatsApp Webhook] Malformed X-Hub-Signature-256 header format');
      throw new UnauthorizedException('Invalid webhook signature format');
    }

    const receivedHex = trimmedSig.slice('sha256='.length).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(receivedHex)) {
      this.logger.warn('[WhatsApp Webhook] Non-hex or wrong-length SHA-256 signature');
      throw new UnauthorizedException('Invalid webhook signature digest');
    }

    if (rawBody === undefined || rawBody === null) {
      throw new UnauthorizedException('Missing webhook payload body');
    }

    const payloadBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody), 'utf8');

    const expectedHex = crypto
      .createHmac('sha256', appSecret.trim())
      .update(payloadBuffer)
      .digest('hex')
      .toLowerCase();

    const expectedBuf = Buffer.from(expectedHex, 'utf8');
    const receivedBuf = Buffer.from(receivedHex, 'utf8');

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      this.logger.warn('[WhatsApp Webhook] Signature mismatch — rejecting request');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }

  // ─── 2. Exact Normalized Phone Matching ───────────────────────────────────

  /**
   * Deterministic E.164 phone normalization (digits only, without '+').
   * Converts national German leading '0' (e.g. 0170...) to '49...' and strips '00' / '+'.
   * Rejects strings containing alphabetic characters or invalid lengths.
   */
  normalizePhoneNumber(phone: string | null | undefined): string {
    if (!phone || typeof phone !== 'string') return '';
    let cleaned = phone.trim();
    if (!cleaned) return '';

    // Reject if input contains letters
    if (/[a-zA-Z]/.test(cleaned)) return '';

    // Normalize "+49 (0) 170..." -> "+49 170..."
    cleaned = cleaned.replace(/^\+(\d{1,3})\s*\(0\)/, '+$1');
    cleaned = cleaned.replace(/^00(\d{1,3})\s*\(0\)/, '00$1');

    const hasPlus = cleaned.startsWith('+');
    let digits = cleaned.replace(/\D/g, '');
    if (!digits) return '';

    if (!hasPlus) {
      if (digits.startsWith('00')) {
        digits = digits.slice(2);
      } else if (digits.startsWith('0')) {
        digits = '49' + digits.slice(1);
      }
    }

    // Valid international phone numbers have between 7 and 15 digits (ITU-T E.164)
    if (digits.length < 7 || digits.length > 15) {
      return '';
    }

    return digits;
  }

  /**
   * Matches the sender phone to EXACTLY ONE active worker using exact normalized phone equality.
   * Never uses last-digit, suffix, or fuzzy matching.
   * Returns UNKNOWN if 0 matches, AMBIGUOUS if >1 active users share the normalized phone.
   */
  async resolveWorkerByExactPhone(senderPhone: string): Promise<VerifiedWorkerIdentity> {
    const normalizedPhone = this.normalizePhoneNumber(senderPhone);
    if (!normalizedPhone) {
      return { status: 'UNKNOWN', normalizedPhone: '', worker: null };
    }

    const activeUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
      },
    });

    const exactMatches = (activeUsers || []).filter((u) => {
      if (!u.phone) return false;
      return this.normalizePhoneNumber(u.phone) === normalizedPhone;
    });

    if (exactMatches.length === 0) {
      return { status: 'UNKNOWN', normalizedPhone, worker: null };
    }

    if (exactMatches.length > 1) {
      this.logger.warn(
        `[WhatsApp Self-Service] Ambiguous phone identity for +${normalizedPhone}: matched ${exactMatches.length} active users. Refusing personal data access.`,
      );
      return { status: 'AMBIGUOUS', normalizedPhone, worker: null };
    }

    return {
      status: 'MATCHED',
      normalizedPhone,
      worker: exactMatches[0],
    };
  }

  // ─── 3. Multilingual NLU & Intent/Date Parser ─────────────────────────────

  /**
   * Detects the worker's language: German (de), Turkish (tr), Arabic (ar), or Ukrainian (uk).
   */
  // No language column exists in User. Explicit preferences are process-local,
  // isolated by verified worker ID, expire after 24 hours and reset on restart.
  private readonly languageSessions = new Map<string, { language: SupportedLanguage; at: number }>();

  explicitLanguageRequest(text: string): SupportedLanguage | null {
    const t = text.trim().replace(/[?!؟.!]+$/g, '').trim().toLowerCase();
    if (/^(بالعربي|بالعربية|عربي|العربية|(?:auf|in)\s+arabisch|arabisch|arabic)$/.test(t)) return 'ar';
    if (/^(türkçe|turkce|(?:auf|in)\s+türkisch|türkisch|بالتركي)$/.test(t)) return 'tr';
    if (/^(українською|українська|(?:auf|in)\s+ukrainisch|ukrainisch|بالاوكراني|بالأوكراني)$/.test(t)) return 'uk';
    if (/^(deutsch|(?:auf|in)\s+deutsch|بالألماني|بالالماني)$/.test(t)) return 'de';
    return null;
  }

  replyLanguage(workerId: string, text: string, storedLanguage?: string): SupportedLanguage {
    const explicit = this.explicitLanguageRequest(text);
    if (explicit) {
      if (this.languageSessions.size >= 10000) this.languageSessions.delete(this.languageSessions.keys().next().value!);
      this.languageSessions.set(workerId, { language: explicit, at: Date.now() });
      return explicit;
    }
    const session = this.languageSessions.get(workerId);
    if (session && Date.now() - session.at < 24 * 60 * 60 * 1000) return session.language;
    this.languageSessions.delete(workerId);
    if (['de', 'tr', 'ar', 'uk'].includes(storedLanguage || '')) return storedLanguage as SupportedLanguage;
    return this.detectLanguage(text);
  }

  detectLanguage(text: string): SupportedLanguage {
    if (!text) return 'de';

    // 1. Arabic script
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text)) {
      return 'ar';
    }

    // 2. Cyrillic script (Ukrainian)
    if (/[\u0400-\u04FF]/.test(text)) {
      return 'uk';
    }

    // 3. Turkish specific characters or keywords
    const lower = text.toLowerCase();
    if (
      /[ğşıçĞŞİÇ]/.test(text) ||
      /\b(kaç|kac|saat|saatim|saatlerim|çalıştım|calistim|çalışma|calisma|vardiya|vardiyam|vardiyalarım|bu\s+ay|geçen\s+ay|gecen\s+ay|yarın|yarin|dün|dun|bugün|bugun|nerede|ne\s+zaman|mesai|merhaba|selam|iş\s+planı|is\s+plani|ocak|şubat|subat|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)\b/i.test(
        lower,
      )
    ) {
      return 'tr';
    }

    // 4. Default to German
    return 'de';
  }

  /**
   * Parses a worker's natural-language message into a strictly bounded, read-only intent structure.
   * Never produces database queries or overrides the verified worker ID.
   */
  parseWorkerMessage(
    rawText: string,
    referenceDate: Date = new Date(),
    verifiedWorkerName?: string,
    otherEmployeeNames: string[] = [],
  ): ParsedSelfServiceIntent {
    const text = (rawText || '').trim();
    const language = this.detectLanguage(text);
    const refYear = referenceDate.getUTCFullYear();
    const refMonth = referenceDate.getUTCMonth() + 1;

    if (!text) {
      return {
        language,
        intent: 'UNSUPPORTED',
        periodType: 'CURRENT_MONTH',
      };
    }

    // 1. Check for Cross-Worker Access Attempts first
    if (this.isCrossWorkerAttempt(text, verifiedWorkerName, otherEmployeeNames)) {
      return {
        language,
        intent: 'CROSS_WORKER_ACCESS',
        periodType: 'CURRENT_MONTH',
      };
    }

    // 2. Check for Mutation / Edit Attempts
    if (this.isMutationAttempt(text)) {
      return {
        language,
        intent: 'MUTATION_ATTEMPT',
        periodType: 'CURRENT_MONTH',
      };
    }

    // 3. Determine whether the message asks about HOURS or PLANS
    const isHours = this.matchesHoursIntent(text);
    const isPlans = this.matchesPlansIntent(text);

    if (!isHours && !isPlans) {
      return {
        language,
        intent: 'UNSUPPORTED',
        periodType: 'CURRENT_MONTH',
      };
    }

    // If both keywords appear (e.g. "Wann ist meine Schicht und wie viele Stunden habe ich im Oktober?"),
    // prioritize HOURS when explicit hour-count question is asked, otherwise PLANS when asking when/where to work.
    const intent: SelfServiceIntentType =
      isHours && !this.isPrimaryPlanQuestion(text) ? 'HOURS' : isPlans ? 'PLANS' : 'HOURS';

    // 4. Parse Date / Period
    const dateParse = this.extractPeriodOrDate(text, intent, referenceDate);

    return {
      language,
      intent,
      periodType: dateParse.periodType,
      year: dateParse.year ?? refYear,
      month: dateParse.month ?? refMonth,
      date: dateParse.date,
      isDateAmbiguous: dateParse.isDateAmbiguous,
      ambiguityReason: dateParse.ambiguityReason,
    };
  }

  private isCrossWorkerAttempt(
    text: string,
    verifiedWorkerName?: string,
    otherEmployeeNames: string[] = [],
  ): boolean {
    const lower = text.toLowerCase();

    // Check explicit relational / third-party keywords in DE, TR, AR, UK
    const relationalPatterns = [
      // German
      /\b(kolleg(e|en|in|innen)|ander(er|e|en)\s+mitarbeiter|freund(es)?|bruder(s)?)\b/i,
      /\b(stunden|arbeitszeit|stundenzettel|schicht|schichtplan|einsatz|einsatzplan|plan|pläne)\s+(von|für)\s+([a-zäöüß]{3,})/i,
      /\bwie\s+viele\s+stunden\s+hat\s+([a-zäöüß]{3,})/i,
      /\bwann\s+arbeitet\s+([a-zäöüß]{3,})/i,
      // Turkish
      /\b(arkada[şs][ıi]m[ıi]n|meslekta[şs][ıi]m[ıi]n|karde[şs]imin|di[ğg]er\s+[çc]al[ıi][şs]an|ba[şs]ka\s+[çc]al[ıi][şs]an|ba[şs]kas[ıi]n[ıi]n)\b/i,
      /\b([a-zçğıöşü]{3,})\s*'?\s*(in|ın|un|ün|nin|nın|nun|nün)\s+(saat|saatleri|vardiya|vardiyas[ıi]|plan[ıi]|mesaisi)/i,
      /\b([a-zçğıöşü]{3,})\s+ka[çc]\s+saat\s+[çc]al[ıi][şs]t[ıi]/i,
      // Arabic
      /(زميلي|زميلتي|صديقي|أخي|اخي|موظف\s+آخر|موظف\s+اخر|الموظف\s+الآخر|شخص\s+آخر)/,
      /(ساعات|جدول|مناوبة|مناوبات|خطة\s+عمل)\s+(زميلي|صديقي|أحمد|احمد|محمد|علي|حسن|حسين|عمر|خالد|يوسف|إبراهيم|ابراهيم|محمود|مصطفى|سامي|طارق)/,
      /كم\s+ساعة\s+(عمل|اشتغل)\s+\S+/,
      /متى\s+(يعمل|يشتغل)\s+\S+/,
      // Ukrainian
      /(колеги|колега|мого\s+друга|брата|іншого\s+працівника|іншого\s+робітника|чужі\s+години|чужий\s+графік)/i,
      /скільки\s+годин\s+(відпрацював|відпрацювала|працював|працювала)\s+[а-яіїєґ]{3,}/i,
      /(години|графік|план|зміна|зміни)\s+(працівника|колеги)\b/i,
    ];

    for (const pat of relationalPatterns) {
      const m = text.match(pat);
      if (m) {
        // Ensure German "von mir" / "für mich" or month names after "von"/"für" are not misclassified
        const captured = (m[3] || m[1] || '').toLowerCase().trim();
        const selfPronounsAndMonths = new Set([
          'mir',
          'mich',
          'heute',
          'gestern',
          'morgen',
          'diesem',
          'letztem',
          'diesen',
          'letzten',
          'januar',
          'februar',
          'märz',
          'maerz',
          'april',
          'mai',
          'juni',
          'juli',
          'august',
          'september',
          'oktober',
          'november',
          'dezember',
          'benim',
          'bu',
          'geçen',
          'gecen',
          'ocak',
          'şubat',
          'subat',
          'mart',
          'nisan',
          'mayıs',
          'mayis',
          'haziran',
          'temmuz',
          'ağustos',
          'agustos',
          'eylül',
          'eylul',
          'ekim',
          'kasım',
          'kasim',
          'aralık',
          'aralik',
        ]);
        if (captured && selfPronounsAndMonths.has(captured)) {
          continue;
        }
        // If captured matches the worker's own name, skip
        if (
          verifiedWorkerName &&
          captured &&
          verifiedWorkerName.toLowerCase().split(/\s+/).includes(captured)
        ) {
          continue;
        }
        return true;
      }
    }

    // Check if the message explicitly mentions another known employee's name
    const ownTokens = new Set(
      (verifiedWorkerName || '')
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3),
    );

    for (const otherName of otherEmployeeNames || []) {
      if (!otherName) continue;
      const fullOther = otherName.trim().toLowerCase();
      if (!fullOther) continue;
      if (verifiedWorkerName && fullOther === verifiedWorkerName.trim().toLowerCase()) {
        continue;
      }
      if (fullOther.length >= 3 && lower.includes(fullOther)) {
        return true;
      }
      const tokens = fullOther.split(/\s+/).filter((t) => t.length >= 4 && !ownTokens.has(t));
      for (const tok of tokens) {
        const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
          return true;
        }
      }
    }

    return false;
  }

  private isMutationAttempt(text: string): boolean {
    return (
      // German
      /(?:^|[^\p{L}\p{N}])(änder(e|n)|korrigier(e|en)|eintrag(en)?|hinzufügen|lösch(e|en)|bearbeit(e|en)|aktualisier(e|en)|tausch(e|en)|trag\s+mir)(?=$|[^\p{L}\p{N}])/iu.test(
        text,
      ) ||
      // Turkish
      /(?:^|[^\p{L}\p{N}])(de[ğg]i[şs]tir|d[üu]zelt|ekle|sil|g[üu]ncelle|kaydet)(?=$|[^\p{L}\p{N}])/iu.test(
        text,
      ) ||
      // Arabic
      /(تعديل|تغيير|إضافة|اضافة|حذف|تصحيح|غير\s+ساعاتي|عدل\s+ساعاتي|عدل\s+جدولي|سجل\s+لي)/.test(
        text,
      ) ||
      // Ukrainian (note: "зміни" alone is also plural of "зміна" [shift], so require infinitive "змінити" or object "зміни мені/години/графік/план")
      /(?:^|[^\p{L}\p{N}])(змінити|зміни\s+(мені|мої\s+години|мій\s+графік|мій\s+план|години|табель)|виправи(ти)?|дода(ти|й)|видали(ти)?|відредагува(ти)?|запиши\s+мені)(?=$|[^\p{L}\p{N}])/iu.test(
        text,
      )
    );
  }

  private matchesHoursIntent(text: string): boolean {
    return (
      // German
      /(?:^|[^\p{L}\p{N}])(stunde|stunden|arbeitszeit|arbeitsstunden|stundenzettel|gearbeitet|wie\s*viel(e)?\s+stunden|wie\s+lange\s+habe\s+ich)(?=$|[^\p{L}\p{N}])/iu.test(
        text,
      ) ||
      // Turkish
      /(?:^|[^\p{L}\p{N}])(ka[çc]\s+saat|saatim|saatlerim|saat\s+[çc]al[ıi][şs]t[ıi]m|[çc]al[ıi][şs]ma\s+saat(i|leri|im|lerim)?|mesai|mesaim|toplam\s+saat|puantaj|ne\s+kadar\s+[çc]al[ıi][şs]t[ıi]m)(?=$|[^\p{L}\p{N}])/iu.test(
        text,
      ) ||
      // Arabic
      /(ساعة|ساعات|ساعاتي|كم\s+ساعة|عدد\s+الساعات|كشف\s+الساعات|ساعات\s+عملي|ساعات\s+العمل|كم\s+اشتغلت|كم\s+عملت)/.test(
        text,
      ) ||
      // Ukrainian
      /(годин|години|скільки\s+годин|мої\s+години|табель|відпрацював|відпрацювала|відпрацьовано|робочі\s+години|робочий\s+час)/i.test(
        text,
      )
    );
  }

  private matchesPlansIntent(text: string): boolean {
    return (
      // German
      /(?:^|[^\p{L}\p{N}])(schicht|schichten|schichtplan|schichtpläne|schichtplänen|einsatz|einsätze|einsätzen|einsatzplan|einsatzpläne|einsatzplänen|arbeitsplan|arbeitspläne|arbeitsplänen|dienstplan|dienstpläne|dienstplänen|plan|pläne|plänen|wann\s+arbeite\s+ich|wo\s+arbeite\s+ich|eingeteilt|einteilung|treffpunkt)(?=$|[^\p{L}\p{N}])/iu.test(
        text,
      ) ||
      // Turkish
      /(?:^|[^\p{L}\p{N}])(vardiya|vardiyam|vardiyalar|vardiyalar[ıi]m|i[şs]\s+plan[ıi]|[çc]al[ıi][şs]ma\s+plan[ıi]|program[ıi]m|ne\s+zaman\s+[çc]al[ıi][şs][ıi]yorum|nerede\s+[çc]al[ıi][şs][ıi]yorum|gelecek\s+vardiya|ge[çc]mi[şs]\s+vardiya|atama|atamalar[ıi]m|g[öo]rev|g[öo]revlerim)(?=$|[^\p{L}\p{N}])/iu.test(
        text,
      ) ||
      // Arabic
      /(جدول|جدولي|خطة\s+العمل|جدول\s+العمل|مناوبة|مناوبتي|مناوبات|مناوباتي|متى\s+[أإا]عمل|متى\s+اشتغل|[أإا]ين\s+[أإا]عمل|القادمة|السابقة|التعيينات|مواعيد\s+عملي|وردية|وردياتي)/.test(
        text,
      ) ||
      // Ukrainian
      /(графік|мій\s+графік|план|плани|робочий\s+план|зміна|моя\s+зміна|мої\s+зміни|розклад|коли\s+я\s+працюю|де\s+я\s+працюю|наступна\s+зміна|майбутні\s+зміни|минулі\s+зміни|призначення)/i.test(
        text,
      )
    );
  }

  private isPrimaryPlanQuestion(text: string): boolean {
    return /(?:^|[^\p{L}\p{N}])(wann\s+arbeite\s+ich|wo\s+arbeite\s+ich|nächste\s+schicht|schichtplan|schichtpläne|einsatzplan|einsatzpläne|ne\s+zaman\s+[çc]al[ıi][şs][ıi]yorum|vardiyam\s+ne\s+zaman|متى\s+[أإا]عمل|جدول\s+عملي|коли\s+я\s+працюю|мій\s+графік)(?=$|[^\p{L}\p{N}])/iu.test(
      text,
    );
  }

  private extractPeriodOrDate(
    text: string,
    intent: SelfServiceIntentType,
    referenceDate: Date,
  ): {
    periodType: SelfServicePeriodType;
    year?: number;
    month?: number;
    date?: string;
    isDateAmbiguous?: boolean;
    ambiguityReason?: string;
  } {
    const refYear = referenceDate.getUTCFullYear();
    const refMonth = referenceDate.getUTCMonth() + 1;
    const refDay = referenceDate.getUTCDate();

    // Normalize Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to ASCII digits
    const normalizedText = text.replace(/[٠-٩]/g, (d) =>
      String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)),
    );

    // Count full dates across formats before selecting one format. A mixed
    // format question or date range must not silently resolve to its first day.
    const fullDates = normalizedText.match(/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\.\d{1,2}\.\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/g) || [];
    if (fullDates.length > 1) {
      return { periodType: 'EXACT_DATE', isDateAmbiguous: true, ambiguityReason: 'MULTIPLE_DATES' };
    }

    // ── Check for explicit ISO date: YYYY-MM-DD ──────────────────────────────
    const isoMatches = [...normalizedText.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)];
    if (isoMatches.length > 1) {
      return {
        periodType: 'EXACT_DATE',
        isDateAmbiguous: true,
        ambiguityReason: 'MULTIPLE_DATES',
      };
    }
    if (isoMatches.length === 1) {
      const y = parseInt(isoMatches[0][1], 10);
      const m = parseInt(isoMatches[0][2], 10);
      const d = parseInt(isoMatches[0][3], 10);
      if (!this.isValidCalendarDate(y, m, d)) {
        return {
          periodType: 'EXACT_DATE',
          isDateAmbiguous: true,
          ambiguityReason: 'INVALID_CALENDAR_DATE',
        };
      }
      return {
        periodType: 'EXACT_DATE',
        year: y,
        month: m,
        date: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      };
    }

    // ── Check for DD.MM.YYYY (dot-separated full date) ──────────────────────
    const dotFullMatches = [
      ...normalizedText.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g),
    ];
    if (dotFullMatches.length > 1) {
      return {
        periodType: 'EXACT_DATE',
        isDateAmbiguous: true,
        ambiguityReason: 'MULTIPLE_DATES',
      };
    }
    if (dotFullMatches.length === 1) {
      const d = parseInt(dotFullMatches[0][1], 10);
      const m = parseInt(dotFullMatches[0][2], 10);
      const y = parseInt(dotFullMatches[0][3], 10);
      if (!this.isValidCalendarDate(y, m, d)) {
        return {
          periodType: 'EXACT_DATE',
          isDateAmbiguous: true,
          ambiguityReason: 'INVALID_CALENDAR_DATE',
        };
      }
      return {
        periodType: 'EXACT_DATE',
        year: y,
        month: m,
        date: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      };
    }

    // ── Check for slash-separated 3-part date: NN/NN/YYYY ───────────────────
    const slashFullMatch = normalizedText.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (slashFullMatch) {
      const first = parseInt(slashFullMatch[1], 10);
      const second = parseInt(slashFullMatch[2], 10);
      const rawY = parseInt(slashFullMatch[3], 10);
      const y = rawY < 100 ? 2000 + rawY : rawY;
      // If both first and second are <= 12 and != each other, DD/MM/YYYY vs MM/DD/YYYY is ambiguous!
      if (first <= 12 && second <= 12 && first !== second) {
        return {
          periodType: 'EXACT_DATE',
          isDateAmbiguous: true,
          ambiguityReason: 'AMBIGUOUS_SLASH_DATE',
        };
      }
      const d = first > 12 ? first : second > 12 ? second : first;
      const m = first > 12 ? second : second > 12 ? first : second;
      if (!this.isValidCalendarDate(y, m, d)) {
        return {
          periodType: 'EXACT_DATE',
          isDateAmbiguous: true,
          ambiguityReason: 'INVALID_CALENDAR_DATE',
        };
      }
      return {
        periodType: 'EXACT_DATE',
        year: y,
        month: m,
        date: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      };
    }

    // ── Check for explicit Month Name(s) in DE / TR / AR / UK ───────────────
    const matchedMonths: number[] = [];
    for (const entry of MONTH_TOKEN_MAP) {
      if (entry.patterns.some((p) => p.test(normalizedText))) {
        matchedMonths.push(entry.month);
      }
    }

    if (matchedMonths.length > 1) {
      return {
        periodType: 'MONTH',
        isDateAmbiguous: true,
        ambiguityReason: 'MULTIPLE_MONTHS',
      };
    }

    if (matchedMonths.length === 1) {
      const m = matchedMonths[0];
      const yearMatch = normalizedText.match(/\b(20\d{2})\b/);
      const y = yearMatch ? parseInt(yearMatch[1], 10) : refYear;

      // Check if a day number is combined with the month name (e.g. "15. Oktober 2026", "15 Ekim", "15 أكتوبر", "15 жовтня")
      const withoutYear = normalizedText.replace(/\b20\d{2}\b/g, ' ');
      const dayMatch = withoutYear.match(/(?:^|[^\d:])(\d{1,2})\s*\.?\s*/);
      if (dayMatch) {
        const d = parseInt(dayMatch[1], 10);
        if (!this.isValidCalendarDate(y, m, d)) {
          return {
            periodType: 'EXACT_DATE',
            isDateAmbiguous: true,
            ambiguityReason: 'INVALID_CALENDAR_DATE',
          };
        }
        return {
          periodType: 'EXACT_DATE',
          year: y,
          month: m,
          date: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        };
      }

      return {
        periodType: intent === 'PLANS' && this.isPastMonth(y, m, refYear, refMonth) ? 'HISTORICAL' : 'MONTH',
        year: y,
        month: m,
      };
    }

    // ── Check for YYYY-MM or MM/YYYY or MM.YYYY ─────────────────────────────
    const ymMatch =
      normalizedText.match(/\b(20\d{2})[-/.](\d{1,2})\b/) ||
      normalizedText.match(/\b(\d{1,2})[/.](20\d{2})\b/);
    if (ymMatch) {
      const isYearFirst = ymMatch[1].length === 4;
      const y = parseInt(isYearFirst ? ymMatch[1] : ymMatch[2], 10);
      const m = parseInt(isYearFirst ? ymMatch[2] : ymMatch[1], 10);
      if (m < 1 || m > 12) {
        return {
          periodType: 'MONTH',
          isDateAmbiguous: true,
          ambiguityReason: 'INVALID_MONTH',
        };
      }
      return {
        periodType: intent === 'PLANS' && this.isPastMonth(y, m, refYear, refMonth) ? 'HISTORICAL' : 'MONTH',
        year: y,
        month: m,
      };
    }

    // ── Check for short 2-number date without year (e.g. "04/05", "15.10.", "32.10") ──
    const shortSlashMatch = normalizedText.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (shortSlashMatch) {
      return {
        periodType: 'EXACT_DATE',
        isDateAmbiguous: true,
        ambiguityReason: 'AMBIGUOUS_SHORT_SLASH_DATE',
      };
    }

    const shortDotMatch = normalizedText.match(/\b(\d{1,2})\.(\d{1,2})\.?(?!\d)/);
    if (shortDotMatch) {
      const d = parseInt(shortDotMatch[1], 10);
      const m = parseInt(shortDotMatch[2], 10);
      if (!this.isValidCalendarDate(refYear, m, d)) {
        return {
          periodType: 'EXACT_DATE',
          isDateAmbiguous: true,
          ambiguityReason: 'INVALID_CALENDAR_DATE',
        };
      }
      // If no year is given on DD.MM and both are <= 12 without trailing dot, ask for clarification
      const hasTrailingDot = /\b\d{1,2}\.\d{1,2}\./.test(normalizedText);
      if (!hasTrailingDot) {
        return {
          periodType: 'EXACT_DATE',
          isDateAmbiguous: true,
          ambiguityReason: 'MISSING_YEAR_OR_AMBIGUOUS_DATE',
        };
      }
      return {
        periodType: 'EXACT_DATE',
        year: refYear,
        month: m,
        date: `${String(refYear).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      };
    }

    // ── Check for relative day expressions (today, yesterday, tomorrow) ─────
    if (
      /(?:^|[^\p{L}\p{N}])(heute|bug[üu]n|сьогодні)(?=$|[^\p{L}\p{N}])/iu.test(normalizedText) ||
      /اليوم/.test(normalizedText)
    ) {
      const dStr = `${String(refYear).padStart(4, '0')}-${String(refMonth).padStart(2, '0')}-${String(refDay).padStart(2, '0')}`;
      return {
        periodType: 'EXACT_DATE',
        year: refYear,
        month: refMonth,
        date: dStr,
      };
    }

    if (
      /(?:^|[^\p{L}\p{N}])(gestern|d[üu]n|вчора|учора)(?=$|[^\p{L}\p{N}])/iu.test(normalizedText) ||
      /(أمس|امس|البارحة|امبارح)/.test(normalizedText)
    ) {
      const yest = new Date(Date.UTC(refYear, refMonth - 1, refDay - 1));
      return {
        periodType: 'EXACT_DATE',
        year: yest.getUTCFullYear(),
        month: yest.getUTCMonth() + 1,
        date: yest.toISOString().split('T')[0],
      };
    }

    if (
      /(?:^|[^\p{L}\p{N}])(morgen|yar[ıi]n|завтра)(?=$|[^\p{L}\p{N}])/iu.test(normalizedText) ||
      /(غدا|غداً|بكرة|بكره)/.test(normalizedText)
    ) {
      const tom = new Date(Date.UTC(refYear, refMonth - 1, refDay + 1));
      return {
        periodType: 'EXACT_DATE',
        year: tom.getUTCFullYear(),
        month: tom.getUTCMonth() + 1,
        date: tom.toISOString().split('T')[0],
      };
    }

    // ── Check for relative month expressions ────────────────────────────────
    // Previous / Last month
    if (
      /(?:^|[^\p{L}\p{N}])(letzt(en|er|em)\s+monat|vorig(en|er)\s+monat|vergangen(en|er)\s+monat|ge[çc]en\s+ay|[öo]nceki\s+ay|минулого\s+місяця|минулий\s+місяць|у\s+минулому\s+місяці|в\s+минулому\s+місяці)(?=$|[^\p{L}\p{N}])/iu.test(
        normalizedText,
      ) ||
      /(الشهر\s+الماضي|الشهر\s+السابق|الشهر\s+اللي\s+فات)/.test(normalizedText)
    ) {
      const prev = new Date(Date.UTC(refYear, refMonth - 2, 1));
      const pY = prev.getUTCFullYear();
      const pM = prev.getUTCMonth() + 1;
      return {
        periodType: intent === 'PLANS' ? 'HISTORICAL' : 'MONTH',
        year: pY,
        month: pM,
      };
    }

    // Current month
    if (
      /(?:^|[^\p{L}\p{N}])(dies(en|er|em)\s+monat|aktuell(en|er)\s+monat|bu\s+ay|bu\s+ayda|цього\s+місяця|цей\s+місяць|у\s+цьому\s+місяці|в\s+цьому\s+місяці|поточний\s+місяць)(?=$|[^\p{L}\p{N}])/iu.test(
        normalizedText,
      ) ||
      /(هذا\s+الشهر|الشهر\s+الحالي|بهذا\s+الشهر)/.test(normalizedText)
    ) {
      return {
        periodType: intent === 'PLANS' ? 'MONTH' : 'CURRENT_MONTH',
        year: refYear,
        month: refMonth,
      };
    }

    // ── Check for Historical Plan keywords ──────────────────────────────────
    if (
      intent === 'PLANS' &&
      (/(?:^|[^\p{L}\p{N}])(vergangen(e|en|er|heit)?|bisherig(e|en|er)?|früher(e|en|er)?|historie|letzte\s+woche|ge[çc]mi[şs]|ge[çc]en\s+hafta|[öo]nceki|минулі|минулих|минулий|історія|минулого\s+тижня)(?=$|[^\p{L}\p{N}])/iu.test(
        normalizedText,
      ) ||
        /(السابق|السابقة|الماضية|الماضي|قبل)/.test(normalizedText))
    ) {
      return {
        periodType: 'HISTORICAL',
        year: refYear,
        month: refMonth,
      };
    }

    // ── Check for Ambiguous Incomplete Date References ──────────────────────
    // 1. Bare day-of-month without month (e.g. "am 15.", "am 5", "ayın 15'inde", "يوم 15", "15 числа")
    if (
      /(?:^|[^\p{L}\p{N}])(am\s+\d{1,2}\.?|ay[ıi]n\s+\d{1,2}|\d{1,2}\s*'[ıiuü]nde|\d{1,2}\s+числа|за\s+\d{1,2}\s+число)(?=$|[^\p{L}\p{N}])/iu.test(
        normalizedText,
      ) ||
      /(يوم\s+\d{1,2}|في\s+يوم\s+\d{1,2}|بتاريخ\s+\d{1,2}(?!\s*[./-]\s*\d))/.test(normalizedText)
    ) {
      return {
        periodType: 'EXACT_DATE',
        isDateAmbiguous: true,
        ambiguityReason: 'DAY_WITHOUT_MONTH',
      };
    }

    // 2. Bare weekday name or vague past reference when asking for hours
    if (
      intent === 'HOURS' &&
      (/(?:^|[^\p{L}\p{N}])(am\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)|letzte\s+woche|vorletzte\s+woche|neulich|letztens|damals|(pazartesi|sal[ıi]|[çc]ar[şs]amba|per[şs]embe|cuma|cumartesi|pazar)\s+g[üu]n[üu]|ge[çc]en\s+hafta|ge[çc]enlerde|у\s+(понеділок|вівторок|середу|четвер|п'ятницю|суботу|неділю)|минулого\s+тижня|нещодавно)(?=$|[^\p{L}\p{N}])/iu.test(
        normalizedText,
      ) ||
        /(يوم\s+(الاثنين|الإثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت|الأحد|الاحد)|الأسبوع\s+الماضي|الاسبوع\s+الماضي|قبل\s+فترة)/.test(
          normalizedText,
        ))
    ) {
      return {
        periodType: 'EXACT_DATE',
        isDateAmbiguous: true,
        ambiguityReason: 'VAGUE_OR_WEEKDAY_ONLY',
      };
    }

    // ── Default when no period is specified ─────────────────────────────────
    if (intent === 'PLANS') {
      return {
        periodType: 'UPCOMING',
        year: refYear,
        month: refMonth,
      };
    }

    return {
      periodType: 'CURRENT_MONTH',
      year: refYear,
      month: refMonth,
    };
  }

  private isValidCalendarDate(year: number, month: number, day: number): boolean {
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      year < 2000 ||
      year > 2100 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return false;
    }
    const d = new Date(Date.UTC(year, month - 1, day));
    return (
      d.getUTCFullYear() === year &&
      d.getUTCMonth() === month - 1 &&
      d.getUTCDate() === day
    );
  }

  private isPastMonth(year: number, month: number, refYear: number, refMonth: number): boolean {
    return year < refYear || (year === refYear && month < refMonth);
  }

  // ─── 4. Dedicated Read-Only Work Plans Query ──────────────────────────────

  /**
   * Dedicated read-only query for a single worker's assigned work plans.
   * Enforces `assignedEmployees: { some: { employeeId: verifiedWorkerId } }`
   * at the Prisma query level AND strips any other workers' details.
   */
  async getWorkerPlans(
    verifiedWorkerId: string,
    options: {
      mode: 'UPCOMING' | 'HISTORICAL' | 'EXACT_DATE' | 'MONTH';
      referenceDate?: Date;
      year?: number;
      month?: number;
      date?: string;
    },
  ): Promise<
    Array<{
      id: string;
      date: string;
      shift: string | null;
      locations: string[];
      treffpunkt: string | null;
      treffpunktTime: string | null;
      segments: Array<{
        startTime: string;
        endTime: string;
        warehouseName: string;
        hallName: string;
      }>;
    }>
  > {
    if (!verifiedWorkerId || typeof verifiedWorkerId !== 'string') {
      throw new BadRequestException('verifiedWorkerId is required');
    }

    const ref = options.referenceDate ?? new Date();
    const todayStart = new Date(
      Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), 0, 0, 0, 0),
    );

    let dateFilter: any;
    let sortDirection: 'asc' | 'desc' = 'asc';

    if (options.mode === 'EXACT_DATE' && options.date) {
      const [y, m, d] = options.date.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
      dateFilter = { gte: start, lte: end };
      sortDirection = 'asc';
    } else if (options.mode === 'MONTH' && options.year && options.month) {
      dateFilter = {
        gte: new Date(Date.UTC(options.year, options.month - 1, 1)),
        lte: new Date(Date.UTC(options.year, options.month, 0, 23, 59, 59, 999)),
      };
    } else if (options.mode === 'HISTORICAL') {
      if (options.year && options.month && this.isPastMonth(options.year, options.month, ref.getUTCFullYear(), ref.getUTCMonth() + 1)) {
        const start = new Date(Date.UTC(options.year, options.month - 1, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(options.year, options.month, 0, 23, 59, 59, 999));
        dateFilter = { gte: start, lte: end };
      } else {
        dateFilter = { lt: todayStart };
      }
      sortDirection = 'desc';
    } else {
      dateFilter = { gte: todayStart };
      sortDirection = 'asc';
    }

    const plans = await this.prisma.plan.findMany({
      where: {
        deletedAt: null,
        date: dateFilter,
        assignedEmployees: {
          some: {
            employeeId: verifiedWorkerId,
          },
        },
      },
      orderBy: { date: sortDirection },
      take: 15,
      include: {
        locations: {
          include: {
            warehouse: { select: { name: true } },
            hall: { select: { name: true } },
          },
        },
        assignedEmployees: {
          where: { employeeId: verifiedWorkerId },
          select: { employeeId: true, confirmationStatus: true },
        },
        employeeSegments: {
          where: { employeeId: verifiedWorkerId },
          orderBy: { order: 'asc' },
        },
      },
    });

    const results: Array<{
      id: string;
      date: string;
      shift: string | null;
      locations: string[];
      treffpunkt: string | null;
      treffpunktTime: string | null;
      segments: Array<{
        startTime: string;
        endTime: string;
        warehouseName: string;
        hallName: string;
      }>;
    }> = [];

    for (const plan of plans || []) {
      const planAny = plan as any;
      if (planAny.deletedAt) continue;

      // Defensive verification that verifiedWorkerId is assigned to this plan
      if (Array.isArray(plan.assignedEmployees)) {
        const isAssigned = plan.assignedEmployees.some(
          (ae: any) => (ae.employeeId ?? ae.employee?.id) === verifiedWorkerId,
        );
        if (!isAssigned) continue;
      }

      const planDate = plan.date instanceof Date ? plan.date : new Date(plan.date);
      if (isNaN(planDate.getTime())) continue;

      // Defensive date check for unit tests with mocked Prisma
      if (dateFilter.gte && planDate.getTime() < dateFilter.gte.getTime()) continue;
      if (dateFilter.lte && planDate.getTime() > dateFilter.lte.getTime()) continue;
      if (dateFilter.lt && planDate.getTime() >= dateFilter.lt.getTime()) continue;

      const locations = (plan.locations || [])
        .map((loc: any) => {
          const wh = loc.warehouse?.name || loc.warehouseName || '';
          const hall = loc.hall?.name || loc.hallName || '';
          if (wh && hall) return `${wh} (${hall})`;
          return wh || hall || '';
        })
        .filter(Boolean);

      const rawSegments = plan.employeeSegments || planAny.segments || [];
      const segments = rawSegments
        .filter((seg: any) => !seg.employeeId || seg.employeeId === verifiedWorkerId)
        .map((seg: any) => ({
          startTime: seg.startTime || '',
          endTime: seg.endTime || '',
          warehouseName: seg.warehouse?.name || seg.treffpunkt || '',
          hallName: seg.hall?.name || '',
        }));

      results.push({
        id: plan.id,
        date: planDate.toISOString().split('T')[0],
        shift: plan.shift || null,
        locations,
        treffpunkt: plan.treffpunkt || null,
        treffpunktTime: plan.treffpunktTime || null,
        segments,
      });
    }

    return results;
  }

  // ─── 5. Main Conversational Handler ───────────────────────────────────────

  /**
   * Processes an incoming natural-language WhatsApp self-service message.
   * Strict read-only: never modifies hours, plans, or other records.
   */
  async handleIncomingConversation(
    senderPhone: string,
    messageText: string,
    referenceDate: Date = new Date(),
    replyLanguage?: SupportedLanguage,
  ): Promise<SelfServiceReplyResult> {
    const language = this.detectLanguage(messageText);

    // 1. Resolve unique worker identity by exact normalized phone number
    const identity = await this.resolveWorkerByExactPhone(senderPhone);
    if (identity.status === 'UNKNOWN') {
      return {
        handled: false,
        status: 'UNKNOWN_IDENTITY',
        language,
        replyText: this.formatUnauthorizedReply(language, 'UNKNOWN'),
      };
    }

    if (identity.status === 'AMBIGUOUS' || !identity.worker) {
      return {
        handled: false,
        status: 'AMBIGUOUS_IDENTITY',
        language,
        replyText: this.formatUnauthorizedReply(language, 'AMBIGUOUS'),
      };
    }

    const verifiedWorker = identity.worker;

    // Fetch other active employee names only for cross-worker name detection
    const allUsers = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
    });
    const otherNames = (allUsers || [])
      .filter((u) => u.id !== verifiedWorker.id && u.name)
      .map((u) => u.name);

    // 2. Parse intent and date/period
    const parsed = this.parseWorkerMessage(
      messageText,
      referenceDate,
      verifiedWorker.name,
      otherNames,
    );

    parsed.language = replyLanguage ?? this.replyLanguage(verifiedWorker.id, messageText);

    // 3. Reject cross-worker access attempts
    if (parsed.intent === 'CROSS_WORKER_ACCESS') {
      return {
        handled: true,
        status: 'CROSS_WORKER_DENIED',
        language: parsed.language,
        intent: 'CROSS_WORKER_ACCESS',
        replyText: this.formatCrossWorkerDeniedReply(parsed.language),
      };
    }

    // 4. Reject mutation / edit attempts
    if (parsed.intent === 'MUTATION_ATTEMPT') {
      return {
        handled: true,
        status: 'MUTATION_DENIED',
        language: parsed.language,
        intent: 'MUTATION_ATTEMPT',
        replyText: this.formatMutationDeniedReply(parsed.language),
      };
    }

    // 5. Handle unsupported / general help message
    if (parsed.intent === 'UNSUPPORTED') {
      return {
        handled: true,
        status: 'UNSUPPORTED_INTENT',
        language: parsed.language,
        intent: 'UNSUPPORTED',
        replyText: this.formatHelpReply(parsed.language, verifiedWorker.name),
      };
    }

    // 6. Ask for clarification if date/period is ambiguous
    if (parsed.isDateAmbiguous) {
      return {
        handled: true,
        status: 'CLARIFICATION_NEEDED',
        language: parsed.language,
        intent: parsed.intent,
        replyText: this.formatAmbiguousDateReply(parsed.language, parsed.intent),
      };
    }

    // 7. Execute read-only query scoped strictly to verifiedWorker.id
    if (parsed.intent === 'HOURS') {
      return this.handleHoursQuery(verifiedWorker, parsed, referenceDate);
    }

    return this.handlePlansQuery(verifiedWorker, parsed, referenceDate);
  }

  private async handleHoursQuery(
    verifiedWorker: { id: string; name: string },
    parsed: ParsedSelfServiceIntent,
    referenceDate: Date,
  ): Promise<SelfServiceReplyResult> {
    const lang = parsed.language;
    let startDate: Date;
    let endDate: Date;
    let periodLabel: string;

    if (parsed.periodType === 'EXACT_DATE' && parsed.date) {
      const [y, m, d] = parsed.date.split('-').map(Number);
      startDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
      periodLabel = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
    } else {
      const year = parsed.year ?? referenceDate.getUTCFullYear();
      const month = parsed.month ?? referenceDate.getUTCMonth() + 1;
      startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      const monthName = MONTH_NAMES_BY_LANG[lang][month - 1] || `${String(month).padStart(2, '0')}`;
      periodLabel = `${monthName} ${year} (${String(month).padStart(2, '0')}/${year})`;
    }

    const result = await this.timesheetService.getWorkerTimesheetHoursForPeriod(
      verifiedWorker.id,
      startDate,
      endDate,
    );

    if (!result.hasRecords || result.totalHours === null) {
      return {
        handled: true,
        status: 'NO_RECORDS',
        language: lang,
        intent: 'HOURS',
        periodLabel,
        totalHours: null,
        replyText: this.formatNoHoursRecordsReply(lang, periodLabel),
      };
    }

    return {
      handled: true,
      status: 'OK',
      language: lang,
      intent: 'HOURS',
      periodLabel,
      totalHours: result.totalHours,
      replyText: this.formatHoursReply(
        lang,
        verifiedWorker.name,
        periodLabel,
        result.totalHours,
        result.daysCount,
        result.entries,
        parsed.periodType === 'EXACT_DATE',
      ),
    };
  }

  private async handlePlansQuery(
    verifiedWorker: { id: string; name: string },
    parsed: ParsedSelfServiceIntent,
    referenceDate: Date,
  ): Promise<SelfServiceReplyResult> {
    const lang = parsed.language;

    let mode: 'UPCOMING' | 'HISTORICAL' | 'EXACT_DATE' | 'MONTH' = 'UPCOMING';
    let periodLabel = '';

    if (parsed.periodType === 'EXACT_DATE' && parsed.date) {
      mode = 'EXACT_DATE';
      const [y, m, d] = parsed.date.split('-').map(Number);
      periodLabel = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
    } else if (parsed.periodType === 'MONTH' || parsed.periodType === 'CURRENT_MONTH') {
      mode = 'MONTH';
      const year = parsed.year ?? referenceDate.getUTCFullYear();
      const month = parsed.month ?? referenceDate.getUTCMonth() + 1;
      periodLabel = `${MONTH_NAMES_BY_LANG[lang][month - 1]} ${year}`;
    } else if (parsed.periodType === 'HISTORICAL') {
      mode = 'HISTORICAL';
      if (parsed.year && parsed.month && this.isPastMonth(parsed.year, parsed.month, referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1)) {
        const monthName = MONTH_NAMES_BY_LANG[lang][parsed.month - 1];
        periodLabel = `${monthName} ${parsed.year}`;
      }
    } else {
      mode = 'UPCOMING';
    }

    const plans = await this.getWorkerPlans(verifiedWorker.id, {
      mode,
      referenceDate,
      year: parsed.year,
      month: parsed.month,
      date: parsed.date,
    });

    if (plans.length === 0) {
      return {
        handled: true,
        status: 'NO_RECORDS',
        language: lang,
        intent: 'PLANS',
        periodLabel,
        plansCount: 0,
        replyText: this.formatNoPlansReply(lang, mode, periodLabel),
      };
    }

    return {
      handled: true,
      status: 'OK',
      language: lang,
      intent: 'PLANS',
      periodLabel,
      plansCount: plans.length,
      replyText: this.formatPlansReply(lang, verifiedWorker.name, mode, periodLabel, plans),
    };
  }

  // ─── 6. Multilingual Reply Formatters (DE, TR, AR, UK) ───────────────────

  private formatHoursNumber(hours: number, lang: SupportedLanguage): string {
    const rounded = Math.round(hours * 100) / 100;
    const dotStr = Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
    const commaStr = dotStr.replace('.', ',');
    if (lang === 'de') {
      return dotStr === commaStr ? `${dotStr} Std.` : `${commaStr} Std. (${dotStr} h)`;
    }
    if (lang === 'tr') {
      return dotStr === commaStr ? `${dotStr} saat` : `${dotStr} saat (${commaStr})`;
    }
    if (lang === 'ar') {
      return `${dotStr} ساعة`;
    }
    return dotStr === commaStr ? `${dotStr} год.` : `${dotStr} год. (${commaStr})`;
  }

  private formatHoursReply(
    lang: SupportedLanguage,
    workerName: string,
    periodLabel: string,
    totalHours: number,
    daysCount: number,
    entries: Array<{
      date: string;
      startTime: string;
      endTime: string;
      breakMinutes: number;
      hours: number;
      location: string | null;
    }>,
    isExactDate: boolean,
  ): string {
    const hoursStr = this.formatHoursNumber(totalHours, lang);
    const single = isExactDate && entries.length === 1 ? entries[0] : null;
    const timeDetail =
      single && single.startTime && single.endTime
        ? ` (${single.startTime}–${single.endTime}${single.breakMinutes ? `, Pause: ${single.breakMinutes} Min.` : ''})`
        : '';

    switch (lang) {
      case 'tr':
        if (isExactDate) {
          return `🕒 Merhaba ${workerName}, ${periodLabel} tarihi için onaylı puantaj (Stundenzettel) kaydın: ${hoursStr}${single && single.startTime && single.endTime ? ` (${single.startTime}–${single.endTime}, Mola: ${single.breakMinutes} dk.)` : ''}.`;
        }
        return `🕒 Merhaba ${workerName}, ${periodLabel} dönemi için onaylı puantaj (Stundenzettel) toplamın: ${hoursStr} (${daysCount} iş günü).`;

      case 'ar':
        if (isExactDate) {
          return `🕒 مرحباً ${workerName}، ساعات عملك المؤكدة في كشف الساعات بتاريخ ${periodLabel}: ${hoursStr}${single && single.startTime && single.endTime ? ` (${single.startTime}–${single.endTime}، استراحة: ${single.breakMinutes} دقيقة)` : ''}.`;
        }
        return `🕒 مرحباً ${workerName}، إجمالي ساعات عملك المؤكدة في كشف الساعات للفترة ${periodLabel}: ${hoursStr} (${daysCount} أيام عمل).`;

      case 'uk':
        if (isExactDate) {
          return `🕒 Привіт, ${workerName}! Твої підтверджені години за табелем на дату ${periodLabel}: ${hoursStr}${single && single.startTime && single.endTime ? ` (${single.startTime}–${single.endTime}, перерва: ${single.breakMinutes} хв.)` : ''}.`;
        }
        return `🕒 Привіт, ${workerName}! Твої підтверджені години за табелем за період ${periodLabel}: ${hoursStr} (відпрацьованих днів: ${daysCount}).`;

      case 'de':
      default:
        if (isExactDate) {
          return `🕒 Hallo ${workerName}, Deine bestätigten Stundenzettel-Stunden für den ${periodLabel} betragen: ${hoursStr}${timeDetail}.`;
        }
        return `🕒 Hallo ${workerName}, Deine bestätigten Stundenzettel-Stunden für den Zeitraum ${periodLabel} betragen insgesamt: ${hoursStr} (${daysCount} Arbeitstage).`;
    }
  }

  private formatNoHoursRecordsReply(lang: SupportedLanguage, periodLabel: string): string {
    switch (lang) {
      case 'tr':
        return `ℹ️ ${periodLabel} dönemi için sistemde henüz onaylanmış puantaj (Stundenzettel) kaydı bulunmamaktadır.`;
      case 'ar':
        return `ℹ️ لا توجد سجلات ساعات عمل مؤكدة في كشف الساعات للفترة ${periodLabel}.`;
      case 'uk':
        return `ℹ️ За період ${periodLabel} у системі немає підтверджених записів у табелі обліку робочого часу.`;
      case 'de':
      default:
        return `ℹ️ Für den Zeitraum ${periodLabel} liegen noch keine bestätigten Stundenzettel-Einträge vor.`;
    }
  }

  private formatAmbiguousDateReply(
    lang: SupportedLanguage,
    intent: SelfServiceIntentType,
  ): string {
    switch (lang) {
      case 'tr':
        return intent === 'HOURS'
          ? `❓ Belirttiğiniz tarih veya dönem net değil. Lütfen tam tarihi (ör. 15.10.2026) veya ayı (ör. Ekim 2026) belirt.`
          : `❓ Belirttiğiniz tarih net değil. Lütfen vardiya planı için tam tarihi (ör. 15.10.2026) veya ayı belirt.`;
      case 'ar':
        return intent === 'HOURS'
          ? `❓ التاريخ أو الفترة غير واضحة. يرجى تحديد التاريخ الكامل (مثال: 15.10.2026) أو الشهر والسنة (مثال: أكتوبر 2026).`
          : `❓ التاريخ غير واضح. يرجى تحديد التاريخ الكامل (مثال: 15.10.2026) لعرض جدول العمل.`;
      case 'uk':
        return intent === 'HOURS'
          ? `❓ Вказана дата або період є неоднозначними. Будь ласка, вкажи точну дату (наприклад, 15.10.2026) або місяць і рік (наприклад, жовтень 2026).`
          : `❓ Вказана дата є неоднозначною. Будь ласка, вкажи точну дату (наприклад, 15.10.2026) для перегляду графіка роботи.`;
      case 'de':
      default:
        return intent === 'HOURS'
          ? `❓ Das angegebene Datum ist nicht eindeutig. Bitte gib ein genaues Datum (z. B. 15.10.2026) oder einen Monat mit Jahr (z. B. Oktober 2026) an.`
          : `❓ Das angegebene Datum ist nicht eindeutig. Bitte gib ein genaues Datum (z. B. 15.10.2026) für deinen Schichtplan an.`;
    }
  }

  private formatPlansReply(
    lang: SupportedLanguage,
    workerName: string,
    mode: 'UPCOMING' | 'HISTORICAL' | 'EXACT_DATE' | 'MONTH',
    periodLabel: string,
    plans: Array<{
      date: string;
      shift: string | null;
      locations: string[];
      treffpunkt: string | null;
      treffpunktTime: string | null;
      segments: Array<{
        startTime: string;
        endTime: string;
        warehouseName: string;
        hallName: string;
      }>;
    }>,
  ): string {
    const lines = plans.slice(0, 10).map((p) => {
      const [y, m, d] = p.date.split('-');
      const formattedDate = `${d}.${m}.${y}`;
      const locText = p.locations.length > 0 ? p.locations.join(', ') : '—';
      const segText =
        p.segments.length > 0
          ? p.segments.map((s) => `${s.startTime}–${s.endTime}`).join(', ')
          : p.shift || '';
      const treffText = p.treffpunkt
        ? ` | ${{ de: 'Treffpunkt', tr: 'Buluşma yeri', ar: 'نقطة التجمع', uk: 'Місце зустрічі' }[lang]}: ${p.treffpunkt}${p.treffpunktTime ? ` (${p.treffpunktTime})` : ''}`
        : '';
      return `• ${formattedDate}: ${locText}${segText ? ` | ${segText}` : ''}${treffText}`;
    });

    if (plans.length > 10) lines.push({ de: 'Weitere Schichten vorhanden. Frage nach einem genauen Datum.', tr: 'Başka vardiyalar da var. Belirli bir tarih sor.', ar: 'في شفتات إضافية. اسأل عن تاريخ محدد.', uk: 'Є інші зміни. Уточни дату.' }[lang]);

    switch (lang) {
      case 'tr': {
        const header =
          mode === 'HISTORICAL'
            ? `📅 Merhaba ${workerName}, geçmiş vardiya planların${periodLabel ? ` (${periodLabel})` : ''}:`
            : mode === 'MONTH'
            ? `📅 Merhaba ${workerName}, ${periodLabel} dönemi vardiya planların:`
            : mode === 'EXACT_DATE'
            ? `📅 Merhaba ${workerName}, ${periodLabel} tarihli vardiya planın:`
            : `📅 Merhaba ${workerName}, gelecek vardiya planların:`;
        return `${header}\n${lines.join('\n')}`;
      }
      case 'ar': {
        const header =
          mode === 'HISTORICAL'
            ? `📅 مرحباً ${workerName}، جدول مناوباتك السابقة${periodLabel ? ` (${periodLabel})` : ''}:`
            : mode === 'MONTH'
            ? `📅 مرحباً ${workerName}، جدول مناوباتك في ${periodLabel}:`
            : mode === 'EXACT_DATE'
            ? `📅 مرحباً ${workerName}، جدول عملك ليوم ${periodLabel}:`
            : `📅 مرحباً ${workerName}، جدول مناوباتك القادمة:`;
        return `${header}\n${lines.join('\n')}`;
      }
      case 'uk': {
        const header =
          mode === 'HISTORICAL'
            ? `📅 Привіт, ${workerName}! Твої минулі зміни${periodLabel ? ` (${periodLabel})` : ''}:`
            : mode === 'MONTH'
            ? `📅 Привіт, ${workerName}! Твої зміни за ${periodLabel}:`
            : mode === 'EXACT_DATE'
            ? `📅 Привіт, ${workerName}! Твій графік роботи на ${periodLabel}:`
            : `📅 Привіт, ${workerName}! Твої майбутні зміни:`;
        return `${header}\n${lines.join('\n')}`;
      }
      case 'de':
      default: {
        const header =
          mode === 'HISTORICAL'
            ? `📅 Hallo ${workerName}, Deine bisherigen Schichtpläne${periodLabel ? ` (${periodLabel})` : ''}:`
            : mode === 'MONTH'
            ? `📅 Hallo ${workerName}, Deine Schichtpläne für ${periodLabel}:`
            : mode === 'EXACT_DATE'
            ? `📅 Hallo ${workerName}, Dein Schichtplan für den ${periodLabel}:`
            : `📅 Hallo ${workerName}, Deine kommenden Schichtpläne:`;
        return `${header}\n${lines.join('\n')}`;
      }
    }
  }

  private formatNoPlansReply(
    lang: SupportedLanguage,
    mode: 'UPCOMING' | 'HISTORICAL' | 'EXACT_DATE' | 'MONTH',
    periodLabel: string,
  ): string {
    switch (lang) {
      case 'tr':
        return mode === 'HISTORICAL'
          ? `ℹ️ ${periodLabel ? `${periodLabel} dönemi için ` : ''}geçmiş vardiya atamanız bulunmamaktadır.`
          : mode === 'MONTH'
          ? `ℹ️ ${periodLabel} dönemi için size atanmış bir vardiya planı bulunmamaktadır.`
          : mode === 'EXACT_DATE'
          ? `ℹ️ ${periodLabel} tarihi için size atanmış bir vardiya planı bulunmamaktadır.`
          : `ℹ️ Şu anda size atanmış gelecek vardiya planı bulunmamaktadır.`;
      case 'ar':
        return mode === 'HISTORICAL'
          ? `ℹ️ لا توجد مناوبات سابقة مسجلة لك${periodLabel ? ` في ${periodLabel}` : ''}.`
          : mode === 'MONTH'
          ? `ℹ️ لا توجد مناوبات مخصصة لك في ${periodLabel}.`
          : mode === 'EXACT_DATE'
          ? `ℹ️ لا يوجد جدول عمل مخصص لك بتاريخ ${periodLabel}.`
          : `ℹ️ لا توجد مناوبات قادمة مخصصة لك حالياً.`;
      case 'uk':
        return mode === 'HISTORICAL'
          ? `ℹ️ За ${periodLabel ? `період ${periodLabel}` : 'минулий період'} призначених для тебе змін не знайдено.`
          : mode === 'MONTH'
          ? `ℹ️ За ${periodLabel} призначених для тебе змін немає.`
          : mode === 'EXACT_DATE'
          ? `ℹ️ На дату ${periodLabel} призначених для тебе змін немає.`
          : `ℹ️ Наразі у вас немає запланованих майбутніх змін.`;
      case 'de':
      default:
        return mode === 'HISTORICAL'
          ? `ℹ️ Für ${periodLabel ? `den Zeitraum ${periodLabel}` : 'die Vergangenheit'} wurden keine zugewiesenen Schichtpläne gefunden.`
          : mode === 'MONTH'
          ? `ℹ️ Für ${periodLabel} wurden keine zugewiesenen Schichtpläne gefunden.`
          : mode === 'EXACT_DATE'
          ? `ℹ️ Für den ${periodLabel} liegt keine Schichtzuteilung für dich vor.`
          : `ℹ️ Aktuell sind keine kommenden Schichtpläne für dich eingetragen.`;
    }
  }

  private formatCrossWorkerDeniedReply(lang: SupportedLanguage): string {
    switch (lang) {
      case 'tr':
        return `🔒 Güvenlik nedeniyle yalnızca kendi çalışma saatlerine ve kendi vardiya planlarına erişebilirsin. Diğer çalışanların bilgileri paylaşılmaz.`;
      case 'ar':
        return `🔒 لأسباب أمنية، يمكنك الاطلاع فقط على ساعات عملك وجدول مناوباتك الخاص. لا يُسمح بالوصول إلى بيانات الموظفين الآخرين.`;
      case 'uk':
        return `🔒 З міркувань безпеки ви можете переглядати лише власні робочі години та власний графік змін. Доступ до даних інших працівників заборонено.`;
      case 'de':
      default:
        return `🔒 Aus Datenschutz- und Sicherheitsgründen kannst du nur Deine eigenen Arbeitsstunden und Schichtpläne abrufen. Daten anderer Mitarbeiter sind nicht einsehbar.`;
    }
  }

  private formatMutationDeniedReply(lang: SupportedLanguage): string {
    switch (lang) {
      case 'tr':
        return `ℹ️ Bu WhatsApp servisi yalnızca bilgi görüntüleme amaçlıdır. Saatler, vardiya planları veya diğer kayıtlar buradan değiştirilemez.`;
      case 'ar':
        return `ℹ️ هذه الخدمة عبر واتساب مخصصة للاستعلام فقط. لا يمكن تعديل ساعات العمل أو جداول المناوبات أو السجلات الأخرى عبر المحادثة.`;
      case 'uk':
        return `ℹ️ Цей WhatsApp-сервіс працює лише в режимі перегляду. Змінювати робочі години, графіки змін або інші записи через чат неможливо.`;
      case 'de':
      default:
        return `ℹ️ Dieser WhatsApp-Service dient ausschließlich zur Auskunft. Arbeitsstunden, Schichtpläne oder andere Einträge können hierüber nicht geändert werden.`;
    }
  }

  private formatUnauthorizedReply(
    lang: SupportedLanguage,
    reason: 'UNKNOWN' | 'AMBIGUOUS',
  ): string {
    switch (lang) {
      case 'tr':
        return reason === 'AMBIGUOUS'
          ? `🔒 Telefon numaran birden fazla kayıtla eşleştiği için kişisel veriler paylaşılamaz. Lütfen yönetiminle iletişime geç.`
          : `🔒 Telefon numaran sistemde kayıtlı bir çalışanla eşleşmedi. Kişisel veriler paylaşılamaz.`;
      case 'ar':
        return reason === 'AMBIGUOUS'
          ? `🔒 رقم هاتفك غير مرتبط بحساب موظف واحد بشكل فريد، لذلك لا يمكن عرض أي بيانات شخصية.`
          : `🔒 رقم هاتفك غير مسجل في النظام. لا يمكن عرض أي بيانات شخصية.`;
      case 'uk':
        return reason === 'AMBIGUOUS'
          ? `🔒 Твій номер телефону не вдалося однозначно зіставити з одним профілем працівника. Персональні дані не надаються.`
          : `🔒 Твій номер телефону не зареєстровано в системі. Персональні дані не надаються.`;
      case 'de':
      default:
        return reason === 'AMBIGUOUS'
          ? `🔒 Deine Telefonnummer konnte keinem eindeutigen Mitarbeiterprofil zugeordnet werden. Es werden keine persönlichen Daten ausgegeben.`
          : `🔒 Deine Telefonnummer ist keinem aktiven Mitarbeiterprofil zugeordnet. Es werden keine persönlichen Daten ausgegeben.`;
    }
  }

  formatHelpReply(lang: SupportedLanguage, workerName: string): string {
    switch (lang) {
      case 'tr':
        return `Merhaba ${workerName}, mesajını anlayamadım. Kendi bilgilerin için örnekler:\n• Bu ay kaç saat çalıştım?\n• Ekim 2026 kaç saat çalıştım?\n• Vardiyalarım Ekim 2026\nBir vardiyaya yanıt vermek için o plan mesajındaki düğmeleri kullan.`;
      case 'ar':
        return `مرحباً ${workerName}، لم أفهم طلبك. للاستعلام عن بياناتك جرّب:\n• كم ساعة عملت هذا الشهر؟\n• ساعاتي في أكتوبر 2026\n• مناوباتي في أكتوبر 2026\nللرد على شفت استخدم أزرار رسالة خطته.`;
      case 'uk':
        return `Привіт, ${workerName}! Не вдалося зрозуміти запит. Приклади для твоїх даних:\n• Скільки годин я відпрацював цього місяця?\n• Мої години за жовтень 2026\n• Мої зміни жовтень 2026\nЩоб відповісти щодо зміни, скористайся кнопками в повідомленні з її планом.`;
      case 'de':
      default:
        return `Hallo ${workerName}, ich habe deine Anfrage nicht verstanden. Beispiele für deine eigenen Daten:\n• Wie viele Stunden habe ich diesen Monat gearbeitet?\n• Wie viele Stunden habe ich im Oktober 2026 gearbeitet?\n• Meine Schichtpläne im Oktober 2026\nFür eine Schichtantwort nutze bitte die Schaltflächen in der jeweiligen Plan-Nachricht.`;
    }
  }
}
