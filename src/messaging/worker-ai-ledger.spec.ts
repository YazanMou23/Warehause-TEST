import { PrismaWorkerAiLedger } from './worker-ai-ledger.service';
describe('Durable ledger accounting (synthetic transaction mock)', () => {
  const now = new Date('2026-11-05T18:00:00Z');
  let tx:any, db:any, ledger:PrismaWorkerAiLedger;
  beforeEach(()=> {
    tx = { $executeRaw:jest.fn().mockResolvedValue(1), $queryRaw:jest.fn().mockResolvedValue([{now}]), workerAiUsage:{
      count:jest.fn().mockResolvedValue(0),findMany:jest.fn().mockResolvedValue([]),create:jest.fn().mockResolvedValue({id:'r'}),
      findUniqueOrThrow:jest.fn().mockResolvedValue({reservedMicros:1000,actualMicros:null}),update:jest.fn().mockResolvedValue({})
    } };
    db={$transaction:jest.fn(cb=>cb(tx))}; ledger=new PrismaWorkerAiLedger(db);
  });
  it('reserves under one DB lock using DB clock, microdollars and UTC boundaries',async()=>{
    expect(await ledger.reserve('synthetic-worker',new Date('2099-01-01'),0.001)).toBe('r');
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.workerAiUsage.count).toHaveBeenCalledWith({where:{workerId:'synthetic-worker',createdAt:{gte:new Date('2026-11-05T00:00:00Z')}}});
    expect(tx.workerAiUsage.create).toHaveBeenCalledWith({data:{workerId:'synthetic-worker',createdAt:now,reservedMicros:1000},select:{id:true}});
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'ReadCommitted',maxWait:5000,timeout:5000});
  });
  it.each([5,6,100])('denies daily count %s',async n=>{tx.workerAiUsage.count.mockResolvedValueOnce(n);expect(await ledger.reserve('worker',now,.001)).toBeNull();expect(tx.workerAiUsage.create).not.toHaveBeenCalled();});
  it('denies rolling-minute quota',async()=>{tx.workerAiUsage.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);expect(await ledger.reserve('worker',now,.001)).toBeNull();});
  it('includes pending reservations in monthly spend',async()=>{tx.workerAiUsage.findMany.mockResolvedValue([{reservedMicros:4999500,actualMicros:null}]);expect(await ledger.reserve('worker',now,.001)).toBeNull();});
  it('counts settled actual costs instead of double-charging reservations',async()=>{tx.workerAiUsage.findMany.mockResolvedValue([{reservedMicros:5000000,actualMicros:10}]);expect(await ledger.reserve('worker',now,.001)).toBe('r');});
  it('preserves zero actual spend',async()=>{tx.workerAiUsage.findMany.mockResolvedValue([{reservedMicros:5000000,actualMicros:0}]);expect(await ledger.reserve('worker',now,.001)).toBe('r');});
  it('settles only bounded costs',async()=>{await ledger.settle('r',.0002);expect(tx.workerAiUsage.update).toHaveBeenCalledWith({where:{id:'r'},data:{actualMicros:200}});});
  it('does not free reservation when model usage exceeds it',async()=>{await expect(ledger.settle('r',.002)).rejects.toThrow();expect(tx.workerAiUsage.update).not.toHaveBeenCalled();});
  it('refuses a second settlement',async()=>{tx.workerAiUsage.findUniqueOrThrow.mockResolvedValue({reservedMicros:1000,actualMicros:100});await expect(ledger.settle('r',0)).rejects.toThrow();});
  it.each([NaN,-1,Infinity,6])('rejects invalid reserve amount %s',async n=>{expect(await ledger.reserve('worker',now,n)).toBeNull();expect(db.$transaction).not.toHaveBeenCalled();});
  it('fails closed on DB failure',async()=>{db.$transaction.mockRejectedValue(new Error('offline'));await expect(ledger.reserve('worker',now,.001)).rejects.toThrow('offline');});
});
