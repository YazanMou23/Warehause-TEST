import { rueckmeldungShiftTime } from './rueckmeldung-time';

describe('rueckmeldungShiftTime', () => {
  it('uses custom segment times, not the default shift window', () => {
    expect(
      rueckmeldungShiftTime({
        segments: [{ startTime: '09:30', endTime: '17:15' }],
        startTime: '2026-11-25T06:00:00Z',
        endTime: '2026-11-25T14:00:00Z',
      }),
    ).toBe('09:30 - 17:15');
  });
  it('joins several segments from first start to last end', () => {
    expect(
      rueckmeldungShiftTime({
        segments: [
          { startTime: '13:00', endTime: '18:00' },
          { startTime: '07:00', endTime: '11:00' },
        ],
      }),
    ).toBe('07:00 - 18:00');
  });
  it('uses location times when no segments exist', () => {
    expect(
      rueckmeldungShiftTime({
        locations: [{ startTime: '10:00', endTime: '16:00' }],
      }),
    ).toBe('10:00 - 16:00');
  });
  it('shows open end', () => {
    expect(
      rueckmeldungShiftTime({
        locations: [{ startTime: '10:00', isOpenEnd: true }],
      }),
    ).toBe('10:00 - offenes Ende');
  });
  it('formats stored window in Berlin time (CET, UTC+1)', () => {
    expect(
      rueckmeldungShiftTime({
        startTime: '2026-11-25T06:00:00Z',
        endTime: '2026-11-25T14:00:00Z',
      }),
    ).toBe('07:00 - 15:00');
  });
  it('returns a dash instead of inventing a default', () => {
    expect(rueckmeldungShiftTime({})).toBe('-');
  });
});
