import { WorkerMenu } from './worker-menu';
import { WhatsappSelfServiceService, SupportedLanguage } from './whatsapp-self-service.service';
import { MessagingService } from './messaging.service';

describe('worker scenario matrix and menu security (synthetic data only)', () => {
 const now=new Date('2026-11-05T19:00:00Z');
 const worker={id:'worker-one',name:'Test Worker',phone:'+491701234567',role:'EMPLOYEE'};
 let db:any,self:WhatsappSelfServiceService,menu:any,timesheet:any;
 beforeEach(()=>{
   timesheet={getWorkerTimesheetHoursForPeriod:jest.fn().mockResolvedValue({hasRecords:false,totalHours:null,daysCount:0,entries:[]})};
   db={user:{findMany:jest.fn().mockResolvedValue([worker])},plan:{findMany:jest.fn().mockResolvedValue([])}};
   self=new WhatsappSelfServiceService(db,timesheet,{get:jest.fn()} as any);menu=new WorkerMenu(self);
 });
 const languageCases:[SupportedLanguage,string,string,string,string,string,string][]=[
 ['de','Meine Stunden','Meine Schichtpläne','diesen Monat','letzten Monat','alle Monate','Jahr 2026'],
 ['ar','ساعاتي','مناوباتي','هذا الشهر','الشهر الماضي','كل الأشهر','كامل سنة 2026'],
 ['tr','Saatlerim','Vardiyalarım','bu ay','geçen ay','tüm aylar','2026 yıl'],
 ['uk','Мої години','Мої зміни','цього місяця','минулого місяця','усі місяці','2026 рік'],
 ];
 describe.each(languageCases)('%s scenario matrix',(lang,hours,plans,current,last,all,year)=>{
   it.each([['HOURS',hours],['PLANS',plans]])('%s covers all period types',async(intent,noun)=>{
     for(const [period,kind] of [[current,intent==='HOURS'?'CURRENT_MONTH':'MONTH'],[last,intent==='HOURS'?'MONTH':'HISTORICAL'],['10.2026',intent==='HOURS'?'MONTH':'HISTORICAL'],[year,'YEAR'],[all,'ALL'],['03.11.2026','EXACT_DATE']]){
       const parsed=self.parseWorkerMessage(`${noun} ${period}`,now);
       expect(parsed).toMatchObject({intent,periodType:kind,isDateAmbiguous:undefined});
       const result=await self.handleIncomingConversation(worker.phone,`${noun} ${period}`,now,lang);
       expect(result.language).toBe(lang);expect(result.status).toBe('NO_RECORDS');
     }
   });
   it('walks hours, month/year picker, both month pages and whole year',async()=>{
     let view=menu.main(worker.id,lang);
     view=await menu.click(worker.id,worker.phone,view.rows[0].id,lang,now);
     expect(view.rows.length).toBeLessThanOrEqual(10);
     const chooseMonth=view.rows[2].id;
     view=await menu.click(worker.id,worker.phone,chooseMonth,lang,now);
     expect(view.rows).toHaveLength(1);
     view=(await menu.text(worker.id,worker.phone,'٢٠٢٦',lang,now))!;
     expect(view.rows.length).toBe(8);
     view=await menu.click(worker.id,worker.phone,view.rows[6].id,lang,now);
     expect(view.rows[3].title).toMatch(/^10/);
     const result=await menu.click(worker.id,worker.phone,view.rows[3].id,lang,now);
     expect(result.body).toContain('2026');
     expect(timesheet.getWorkerTimesheetHoursForPeriod).toHaveBeenLastCalledWith(worker.id,new Date('2026-10-01T00:00:00Z'),new Date('2026-10-31T23:59:59.999Z'));
     view=menu.main(worker.id,lang);view=await menu.click(worker.id,worker.phone,view.rows[0].id,lang,now);
     view=await menu.click(worker.id,worker.phone,view.rows[3].id,lang,now);
     await menu.text(worker.id,worker.phone,'2026',lang,now);
     expect(timesheet.getWorkerTimesheetHoursForPeriod).toHaveBeenLastCalledWith(worker.id,new Date('2026-01-01T00:00:00Z'),new Date('2026-12-31T23:59:59.999Z'));
   });
   it('splits worked vs scheduled on a specific day',async()=>{
     for(const index of [0,1]){
       let view=menu.main(worker.id,lang);view=await menu.click(worker.id,worker.phone,view.rows[2].id,lang,now);
       view=await menu.click(worker.id,worker.phone,view.rows[index].id,lang,now);
       await menu.text(worker.id,worker.phone,'03.11.2026',lang,now);
     }
     expect(timesheet.getWorkerTimesheetHoursForPeriod).toHaveBeenCalledWith(worker.id,new Date('2026-11-03T00:00:00Z'),new Date('2026-11-03T23:59:59.999Z'));
     expect(db.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({assignedEmployees:{some:{employeeId:worker.id}},date:{gte:new Date('2026-11-03T00:00:00Z'),lte:new Date('2026-11-03T23:59:59.999Z')}})}));
   });
 });
 it('cross-worker or expired token cannot execute the stored query',async()=>{
   const v=menu.main(worker.id,'ar');
   const spy=jest.spyOn(self,'handleIncomingConversation');
   await menu.click('different-worker',worker.phone,v.rows[0].id,'ar',now);
   const time=jest.spyOn(Date,'now').mockReturnValue(Date.now()+31*60*1000);
   await menu.click(worker.id,worker.phone,v.rows[0].id,'ar',now);time.mockRestore();
   expect(spy).not.toHaveBeenCalled();
 });
 it('each menu click rechecks current worker identity before query',async()=>{
   const svc=new MessagingService(db,self);const send=jest.spyOn(svc,'sendWorkerMenu').mockResolvedValue();
   db.actionLog={create:jest.fn().mockResolvedValue({})};db.user.findMany.mockResolvedValue([]);
   await svc.processIncomingWebhookMessage({id:'unknown-menu',timestamp:String(now.getTime()/1000),from:worker.phone,type:'interactive',interactive:{list_reply:{id:'MENU_fake',title:'ساعاتي'}}},now);
   expect(send).not.toHaveBeenCalled();expect(db.plan.findMany).not.toHaveBeenCalled();
 });
 it.each(['list_reply','button_reply'])('MENU_* %s never becomes a shift decision or custom note',async(type)=>{
   const svc=new MessagingService(db,self);const send=jest.spyOn(svc,'sendWorkerMenu').mockResolvedValue();
   db.planEmployee={findMany:jest.fn(),updateMany:jest.fn()};
   await svc.processIncomingWebhookMessage({id:type,timestamp:String(now.getTime()/1000),from:worker.phone,type:'interactive',interactive:{[type]:{id:'MENU_stale',title:'Ich bin da'}}},now);
   expect(send).not.toHaveBeenCalled();expect(db.planEmployee.findMany).not.toHaveBeenCalled();expect(db.planEmployee.updateMany).not.toHaveBeenCalled();
 });
 it('paginates plans by ten with a stable order and same identity/period',async()=>{
   db.plan.findMany.mockResolvedValue(Array.from({length:11},(_,i)=>({id:`fake-${i}`,date:new Date('2026-03-01Z'),locations:[],employeeSegments:[],assignedEmployees:[{employeeId:worker.id}]})));
   let view=await menu.query(worker.id,worker.phone,'Meine Schichtpläne Jahr 2026','ar',now);
   expect(view.rows.length).toBe(2);expect(view.body).toContain('صفحة 1');
   db.plan.findMany.mockResolvedValue([]);
   view=await menu.click(worker.id,worker.phone,view.rows[0].id,'ar',now);
   expect(db.plan.findMany).toHaveBeenLastCalledWith(expect.objectContaining({skip:10,take:11,orderBy:[{date:'asc'},{id:'asc'}],where:expect.objectContaining({assignedEmployees:{some:{employeeId:worker.id}}})}));
   expect(view.rows.length).toBe(1);
 });
 it('paginates monthly confirmed hours and keeps total distinct from displayed months',async()=>{
   timesheet.getWorkerTimesheetHoursForPeriod.mockResolvedValue({hasRecords:true,totalHours:96,daysCount:12,entries:Array.from({length:12},(_,i)=>({date:`2026-${String(i+1).padStart(2,'0')}-01`,hours:8}))});
   let v=await menu.query(worker.id,worker.phone,'Meine Stunden Jahr 2026','ar',now);
   expect(v.body).toContain('96');expect(v.body).toContain('2026-10');expect(v.body).not.toContain('2026-11');
   v=await menu.click(worker.id,worker.phone,v.rows[0].id,'ar',now);
   expect(v.body).toContain('2026-11');expect(v.body).toContain('2026-12');expect(v.rows.length).toBe(1);
 });
 it('anchors current month to Berlin when UTC date is the previous month',()=>{
   expect(self.parseWorkerMessage('ساعاتي هذا الشهر',new Date('2026-10-31T23:30:00Z'))).toMatchObject({year:2026,month:11});
 });
 it('awaited numeric input does not swallow a free-text shift choice',async()=>{
   let v=menu.main(worker.id,'de');v=await menu.click(worker.id,worker.phone,v.rows[2].id,'de',now);await menu.click(worker.id,worker.phone,v.rows[0].id,'de',now);
   expect(await menu.text(worker.id,worker.phone,'Ich bin da','de',now)).toBeNull();
 });
});

describe('menu transport contract: no actual API calls',()=>{
 let network:jest.SpyInstance;const saved={...process.env};
 beforeEach(()=>{network=jest.spyOn(global,'fetch');process.env.WHATSAPP_PHONE_NUMBER_ID='synthetic-id';process.env.WHATSAPP_ACCESS_TOKEN='synthetic-key';});
 afterEach(()=>{network.mockRestore();process.env=saved;});
 it('sends list payload, never invokes a template',async()=>{
  network.mockResolvedValue({ok:true});const svc=new MessagingService({} as any);
  const template=jest.spyOn(svc,'sendWhatsAppTemplate');
  await svc.sendWorkerMenu('+491701234567',{body:'synthetic',rows:[{id:'MENU_synthetic',title:'ساعاتي'}]});
  const payload=JSON.parse(network.mock.calls[0][1].body);
  expect(payload).toMatchObject({to:'491701234567',type:'interactive',interactive:{type:'list',action:{sections:[{rows:[{id:'MENU_synthetic',title:'ساعاتي'}]}]}}});
  expect(template).not.toHaveBeenCalled();
 });
 it('throws on failed delivery, never claims success or sends a template',async()=>{
  network.mockResolvedValue({ok:false,status:400});const svc=new MessagingService({} as any);
  const template=jest.spyOn(svc,'sendWhatsAppTemplate');
  await expect(svc.sendWorkerMenu('+491701234567',{body:'synthetic',rows:[]})).rejects.toThrow('delivery failed');
  expect(template).not.toHaveBeenCalled();
 });
 it('chunks long records and sends list navigation only after successful data',async()=>{
  network.mockResolvedValue({ok:true});const svc=new MessagingService({} as any);const text=jest.spyOn(svc,'sendWhatsAppDirect').mockResolvedValue({success:true});
  await svc.sendWorkerMenu('+491701234567',{body:'x'.repeat(4000),rows:[{id:'MENU_fake',title:'التالي'}]});
  expect(text).toHaveBeenCalledTimes(2);expect(network).toHaveBeenCalledTimes(1);
 });
 it('propagates a chunk failure rather than sending navigation for undelivered data',async()=>{
  const svc=new MessagingService({} as any);jest.spyOn(svc,'sendWhatsAppDirect').mockResolvedValue({success:false});
  await expect(svc.sendWorkerMenu('+491701234567',{body:'x'.repeat(1200),rows:[]})).rejects.toThrow();expect(network).not.toHaveBeenCalled();
 });
});
