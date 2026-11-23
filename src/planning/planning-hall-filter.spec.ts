import { PlanningService } from './planning.service';

describe('confirmation location filters', () => {
  const location = (warehouseId: string, hallId: string) => ({ warehouseId, hallId, warehouse: { name: warehouseId }, hall: { name: hallId, color: '#173e75' } });
  const locations = [location('north', 'hall-a'), location('north', 'hall-b'), location('south', 'hall-c')];
  let service: PlanningService;
  beforeEach(() => {
    const assignment = {
      planId: 'plan-test', employeeId: 'worker-test', confirmationStatus: 'CONFIRMED',
      employee: { name: 'Synthetic Worker' },
      plan: { date: new Date('2026-11-24T00:00:00Z'), locations, employeeSegments: [] },
    };
    service = new PlanningService({
      planEmployee: { findMany: jest.fn().mockResolvedValue([assignment]) },
      employeeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
    } as any, {} as any, {} as any);
  });
  it('shows all halls without duplicating the worker or totals', async () => {
    const result = await service.getConfirmations({});
    expect(result.total).toBe(1);
    expect(result.confirmedCount).toBe(1);
    expect(result.data[0].hallName).toBe('hall-a / hall-b / hall-c');
  });
  it('matches a second hall in the same warehouse', async () => {
    const result = await service.getConfirmations({ warehouseId: 'north', hallId: 'hall-b' });
    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({ hallId: 'hall-b', hallName: 'hall-b', warehouseName: 'north' });
  });
  it('matches a hall in a later warehouse', async () => {
    const result = await service.getConfirmations({ warehouseId: 'south', hallId: 'hall-c' });
    expect(result.total).toBe(1);
    expect(result.data[0].hallName).toBe('hall-c');
  });
  it('does not cross-match warehouse and hall from different locations', async () => {
    const result = await service.getConfirmations({ warehouseId: 'north', hallId: 'hall-c' });
    expect(result.total).toBe(0);
  });
  it('shows only matching halls for a warehouse filter', async () => {
    const result = await service.getConfirmations({ warehouseId: 'north' });
    expect(result.data[0].hallName).toBe('hall-a / hall-b');
  });
  it('supports hall-only filtering and preserves search over the displayed halls', async () => {
    expect((await service.getConfirmations({ hallId: 'hall-b' })).total).toBe(1);
    expect((await service.getConfirmations({ search: 'hall-c' })).total).toBe(1);
    expect((await service.getConfirmations({ hallId: 'missing' })).total).toBe(0);
  });
});
