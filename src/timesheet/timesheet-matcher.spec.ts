import { TimesheetMatcherService } from './timesheet-matcher.service';

function make(names: string[]) {
  const prisma: any = {
    user: { findMany: jest.fn().mockResolvedValue(names.map((name, i) => ({ id: `u${i}`, name }))) },
  };
  return new TimesheetMatcherService(prisma);
}

describe('TimesheetMatcherService name matching', () => {
  const svc = make(['Max Müller', 'Mohammad Awad Alqaan', 'Ali Hassan']);

  it('matches the exact name automatically', async () => {
    const r = await svc.findBestMatch('Max Müller');
    expect(r.confidence).toBe('exact');
    expect(r.employeeId).toBe('u0');
  });

  it('matches reversed word order and umlaut spelling automatically', async () => {
    expect((await svc.findBestMatch('Müller Max')).confidence).toBe('exact');
    expect((await svc.findBestMatch('MUELLER MAX')).confidence).toBe('exact');
  });

  it('never auto-matches a first name only', async () => {
    const r = await svc.findBestMatch('Ali');
    expect(r.confidence).not.toBe('exact');
  });

  it('never auto-matches a partial name', async () => {
    const r = await svc.findBestMatch('Mohammad Awad');
    expect(r.confidence).not.toBe('exact');
  });

  it('never auto-matches a near spelling', async () => {
    const r = await svc.findBestMatch('Max Mueler');
    expect(r.confidence).not.toBe('exact');
  });

  it('returns no match for an unknown name', async () => {
    const r = await svc.findBestMatch('Zzz Qqq');
    expect(r.found).toBe(false);
  });
});
