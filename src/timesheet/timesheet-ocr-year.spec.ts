import { TimesheetOcrService } from './timesheet-ocr.service';

const NOW = new Date('2026-11-24T11:00:00Z');

function makeService(): TimesheetOcrService {
  const config: any = { get: (k: string) => (k === 'OPENAI_API_KEY' ? 'test-key' : undefined) };
  return new TimesheetOcrService(config);
}

function imageFile(): any {
  return { buffer: Buffer.from('x'), mimetype: 'image/jpeg', originalname: 'sheet.jpg', size: 1 };
}

function mockModel(content: object) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    text: async () => '',
  });
  (global as any).fetch = fetchMock;
  return fetchMock;
}

describe('Stundenzettel year handling', () => {
  const realFetch = (global as any).fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
    (global as any).fetch = realFetch;
  });

  it('puts today and the current year into the prompt', () => {
    const text = makeService().buildDateContext(NOW);
    expect(text).toContain('Heutiges Datum: 24.11.2026');
    expect(text).toContain('Das aktuelle Jahr ist 2026');
    expect(text).toContain('16.07.2026 → 2026-07-16');
  });

  it('uses the Berlin date around midnight', () => {
    const svc = makeService();
    expect(svc.todayIso(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(svc.todayIso(new Date('2026-06-30T21:59:00Z'))).toBe('2026-06-30');
  });

  it('sends the current date in the vision request', async () => {
    const fetchMock = mockModel({ employeeName: 'A B', weekStartDate: '', entries: [] });
    await makeService().extractFromFile(imageFile());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userText = body.messages[1].content[0].text;
    expect(userText).toContain('Heutiges Datum: 24.11.2026');
    expect(userText).not.toContain('2026-07-16 ');
  });

  it('corrects a model-guessed old year and warns', async () => {
    mockModel({
      employeeName: 'A B',
      weekStartDate: '2024-11-17',
      entries: [
        { date: '2024-11-18', startTime: '08:00', endTime: '16:30', breakMinutes: 30, totalHours: 8 },
        { date: '2024-11-19', startTime: '08:00', endTime: '16:30', breakMinutes: 30, totalHours: 8 },
      ],
    });
    const result = await makeService().extractFromFile(imageFile());
    expect(result.entries.map((e) => e.date)).toEqual(['2026-11-18', '2026-11-19']);
    expect(result.weekStartDate).toBe('2026-11-17');
    expect(result.entries[0].weekday).toBe('Mittwoch');
    expect(result.warning).toContain('Jahr');
  });

  it('uses the same date rules and year fix on the PDF text path', async () => {
    const fetchMock = mockModel({
      employeeName: 'A B',
      weekStartDate: '2025-11-17',
      entries: [{ date: '2025-11-18', startTime: '08:00', endTime: '16:30', breakMinutes: 30, totalHours: 8 }],
    });
    const result = await (makeService() as any).callTextApi('Stundenzettel text', 'test-key', []);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain('Heutiges Datum: 24.11.2026');
    expect(result.entries[0].date).toBe('2026-11-18');
    expect(result.warning).toContain('Jahr');
  });

  it('keeps plausible dates and adds no warning', async () => {
    mockModel({
      employeeName: 'A B',
      weekStartDate: '2026-11-16',
      entries: [{ date: '2026-11-17', startTime: '08:00', endTime: '16:30', breakMinutes: 30, totalHours: 8 }],
    });
    const result = await makeService().extractFromFile(imageFile());
    expect(result.entries[0].date).toBe('2026-11-17');
    expect(result.weekStartDate).toBe('2026-11-16');
    expect(result.warning).toBeUndefined();
  });

  it('handles a week crossing the year end (scanned in early January)', () => {
    const svc = makeService();
    const jan = new Date('2027-01-05T10:00:00Z');
    const c: string[] = [];
    expect(svc.correctImplausibleYear('2026-12-29', c, jan)).toBe('2026-12-29');
    expect(svc.correctImplausibleYear('2027-01-02', c, jan)).toBe('2027-01-02');
    expect(svc.correctImplausibleYear('2025-12-29', c, jan)).toBe('2026-12-29');
    expect(c).toEqual(['2025-12-29 → 2026-12-29']);
  });

  it('fills a missing year with the current year and fixes a two-digit year', () => {
    const svc = makeService();
    expect(svc.normalizeDate('18.11')).toMatch(/^\d{4}-11-18$/);
    expect(svc.normalizeDate('18.11.26')).toBe('2026-11-18');
  });

  it('leaves old sheets alone when no neighbouring year fits', () => {
    const svc = makeService();
    const c: string[] = [];
    expect(svc.correctImplausibleYear('2026-03-10', c, NOW)).toBe('2026-03-10');
    expect(c).toEqual([]);
  });

  it('does not invent a leap day and ignores non-ISO input', () => {
    const svc = makeService();
    const c: string[] = [];
    expect(svc.correctImplausibleYear('2024-02-29', c, new Date('2028-03-10T10:00:00Z'))).toBe('2028-02-29');
    expect(svc.correctImplausibleYear('2025-02-29', c, new Date('2026-03-01T10:00:00Z'))).toBe('2025-02-29');
    expect(svc.correctImplausibleYear('bad', c, NOW)).toBe('bad');
  });
});
