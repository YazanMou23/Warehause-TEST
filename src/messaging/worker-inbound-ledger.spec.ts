import { WorkerInboundLedger } from './worker-inbound-ledger.service';
import { MessagingService } from './messaging.service';
import { WhatsappSelfServiceService } from './whatsapp-self-service.service';
describe('durable inbound admission (mock atomic unique storage)',()=>{
 it('claims concurrently once across separate process objects and restart',async()=>{
  const keys=new Set<string>();const db:any={actionLog:{create:jest.fn(async({data})=>{if(keys.has(data.id))throw {code:'P2002'};keys.add(data.id);return data;})}};
  const a=new WorkerInboundLedger(db),b=new WorkerInboundLedger(db);
  const results=await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).claim('synthetic-wamid','worker-one')));
  expect(results.filter(Boolean)).toHaveLength(1);expect(await new WorkerInboundLedger(db).claim('synthetic-wamid','worker-one')).toBe(false);
  expect(JSON.stringify(db.actionLog.create.mock.calls)).not.toContain('synthetic-wamid');
 });
 it('propagates storage failure rather than silently bypassing dedupe',async()=>{
  const db:any={actionLog:{create:jest.fn().mockRejectedValue(new Error('database down'))}};
  await expect(new WorkerInboundLedger(db).claim('id','worker')).rejects.toThrow('database down');
 });
 it('one inbound produces no second reply after service restart or uncertain send failure',async()=>{
  const worker={id:'worker-one',name:'Test',phone:'+491701234567',role:'EMPLOYEE'};
  const keys=new Set<string>();const db:any={user:{findMany:jest.fn().mockResolvedValue([worker])},actionLog:{create:jest.fn(async({data})=>{if(keys.has(data.id))throw {code:'P2002'};keys.add(data.id);return data;})}};
  const self=new WhatsappSelfServiceService(db,{} as any,{} as any);
  const first=new MessagingService(db,self,undefined,new WorkerInboundLedger(db));
  const send=jest.spyOn(first,'sendWorkerMenu').mockRejectedValue(new Error('uncertain send'));
  const now=new Date('2026-11-05T19:00:00Z');const msg={id:'same-inbound',timestamp:String(now.getTime()/1000),from:worker.phone,type:'text',text:{body:'قائمة'}};
  await expect(first.processIncomingWebhookMessage(msg,now)).rejects.toThrow('uncertain send');
  const restarted=new MessagingService(db,self,undefined,new WorkerInboundLedger(db));const repeat=jest.spyOn(restarted,'sendWorkerMenu').mockResolvedValue();
  await restarted.processIncomingWebhookMessage(msg,now);expect(send).toHaveBeenCalledTimes(1);expect(repeat).not.toHaveBeenCalled();
 });
});
