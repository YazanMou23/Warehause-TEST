import {WorkerMenu} from './worker-menu';
import {WhatsappSelfServiceService,SupportedLanguage} from './whatsapp-self-service.service';
describe('explicit worker periods and complete menu flow (offline)',()=>{
 const now=new Date('2026-11-05T21:00Z'),worker={id:'one',name:'Synthetic',phone:'+491701234567',role:'EMPLOYEE'};
 let db:any,self:WhatsappSelfServiceService,ledger:any,menu:WorkerMenu;
 beforeEach(()=>{db={user:{findMany:jest.fn().mockResolvedValue([worker])},plan:{findMany:jest.fn().mockResolvedValue([])}};ledger={getWorkerTimesheetHoursForPeriod:jest.fn().mockResolvedValue({hasRecords:false,totalHours:null,daysCount:0,entries:[]})};self=new WhatsappSelfServiceService(db,ledger,{} as any);menu=new WorkerMenu(self);});
 const cases:[SupportedLanguage,string,string,string][]=[['ar','ساعاتي','الأسبوع الماضي','آخر أسبوعين'],['de','Meine Stunden','letzte Woche','letzte 2 Wochen'],['tr','Saatlerim','geçen hafta','son 2 hafta'],['uk','Мої години','минулого тижня','останні 2 тижні']];
 it.each(cases)('%s month-year input and typed month pages work',(async(lang,noun,last,two)=>{
  let v=menu.main(worker.id,lang);v=(await menu.click(worker.id,worker.phone,v.rows[0].id,lang,now))!;expect(v.rows.length).toBeLessThanOrEqual(10);
  v=(await menu.click(worker.id,worker.phone,v.rows[2].id,lang,now))!;await menu.text(worker.id,worker.phone,'10.2026',lang,now);
  expect(ledger.getWorkerTimesheetHoursForPeriod).toHaveBeenLastCalledWith(worker.id,new Date('2026-10-01Z'),new Date('2026-10-31T23:59:59.999Z'));
  v=menu.main(worker.id,lang);v=(await menu.click(worker.id,worker.phone,v.rows[0].id,lang,now))!;v=(await menu.click(worker.id,worker.phone,v.rows[2].id,lang,now))!;
  v=(await menu.text(worker.id,worker.phone,'٢٠٢٦',lang,now))!;expect(v.body).toContain('2026');v=(await menu.text(worker.id,worker.phone,'7–12',lang,now))!;expect(v.rows[0].title).toMatch(/^7/);
  await menu.text(worker.id,worker.phone,'11 - نوفمبر',lang,now);expect(ledger.getWorkerTimesheetHoursForPeriod).toHaveBeenLastCalledWith(worker.id,new Date('2026-11-01Z'),new Date('2026-11-30T23:59:59.999Z'));
  await self.handleIncomingConversation(worker.phone,`${noun} ${last}`,now,lang);expect(ledger.getWorkerTimesheetHoursForPeriod).toHaveBeenLastCalledWith(worker.id,new Date('2026-10-26Z'),new Date('2026-11-01T23:59:59.999Z'));
  await self.handleIncomingConversation(worker.phone,`${noun} ${two}`,now,lang);expect(ledger.getWorkerTimesheetHoursForPeriod).toHaveBeenLastCalledWith(worker.id,new Date('2026-10-19Z'),new Date('2026-11-01T23:59:59.999Z'));
 }));
 it.each(cases)('%s range is inclusive and plans stay worker scoped',async(lang,noun)=>{
  await self.handleIncomingConversation(worker.phone,`${noun} 01.10.2026 - 10.11.2026`,now,lang);expect(ledger.getWorkerTimesheetHoursForPeriod).toHaveBeenLastCalledWith(worker.id,new Date('2026-10-01Z'),new Date('2026-11-10T23:59:59.999Z'));
  await self.handleIncomingConversation(worker.phone,'Meine Schichtpläne von 2026-10-01 bis 2026-11-10',now,lang);expect(db.plan.findMany).toHaveBeenLastCalledWith(expect.objectContaining({where:expect.objectContaining({date:{gte:new Date('2026-10-01Z'),lte:new Date('2026-11-10T23:59:59.999Z')},assignedEmployees:{some:{employeeId:worker.id}}})}));
 });
 it.each(['ساعاتي من 31.10.2026 إلى 01.10.2026','ساعاتي من 31.02.2026 إلى 01.03.2026','اي أسبوع من شهر 10 في 2026'])('clarifies invalid/undefined week instead of silently choosing month: %s',async text=>{expect((await self.handleIncomingConversation(worker.phone,text,now,'ar')).status).toBe('CLARIFICATION_NEEDED');expect(ledger.getWorkerTimesheetHoursForPeriod).not.toHaveBeenCalled();});
 it('range menu accepts full dates, paginates days and never writes',async()=>{
  const entries=Array.from({length:12},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,hours:8}));ledger.getWorkerTimesheetHoursForPeriod.mockResolvedValue({hasRecords:true,totalHours:96,daysCount:12,entries});
  let v=menu.main(worker.id,'ar');v=(await menu.click(worker.id,worker.phone,v.rows[0].id,'ar',now))!;v=(await menu.click(worker.id,worker.phone,v.rows[5].id,'ar',now))!;
  v=(await menu.text(worker.id,worker.phone,'01.10.2026 - 31.10.2026','ar',now))!;expect(v.rows[0].title).toBe('التالي');expect(v.body).toContain('10.10.2026');expect(v.body).not.toContain('11.10.2026');
  v=(await menu.click(worker.id,worker.phone,v.rows[0].id,'ar',now))!;expect(v.body).toContain('11.10.2026');expect(v.body).not.toContain('01.10.2026:');
  expect((await self.handleIncomingConversation(worker.phone,'سجل ليوم 10.11.2026 8 ساعات',now,'ar')).status).toBe('MUTATION_DENIED');
 });
 it('range prompt rejects a lone date/year and still passes shift choices/notes through',async()=>{
  let v=menu.main(worker.id,'ar');v=(await menu.click(worker.id,worker.phone,v.rows[0].id,'ar',now))!;v=(await menu.click(worker.id,worker.phone,v.rows[5].id,'ar',now))!;
  expect((await menu.text(worker.id,worker.phone,'01.10.2026','ar',now))?.body).toContain('31.10.2026');expect(ledger.getWorkerTimesheetHoursForPeriod).not.toHaveBeenCalled();
  expect(await menu.text(worker.id,worker.phone,'نعم','ar',now)).toBeNull();expect(await menu.text(worker.id,worker.phone,'1','ar',now)).toBeNull();
 });
 it('leap days, year boundaries, Arabic digits and extra dates fail safely',()=>{
  expect(self.parseWorkerMessage('ساعاتي من ٢٨.٠٢.٢٠٢٨ إلى ٢٩.٠٢.٢٠٢٨',now)).toMatchObject({periodType:'RANGE',startDate:'2028-02-28',endDate:'2028-02-29'});
  expect(self.parseWorkerMessage('Meine Stunden letzte Woche',new Date('2027-01-01T00:30Z'))).toMatchObject({startDate:'2026-12-21',endDate:'2026-12-27'});
  expect(self.parseWorkerMessage('ساعاتي من 01.10.2026 إلى 02.10.2026 و03.10.2026',now).isDateAmbiguous).toBe(true);
  expect(self.parseWorkerMessage('ساعاتي الأسبوع الماضي 01.10.2026',now).isDateAmbiguous).toBe(true);
 });

 it.each(cases)('%s KW44 query resolves ISO Monday-Sunday with explicit year',async(lang,noun)=>{
  await self.handleIncomingConversation(worker.phone,`${noun} KW 44 2026`,now,lang);
  expect(ledger.getWorkerTimesheetHoursForPeriod).toHaveBeenLastCalledWith(worker.id,new Date('2026-10-26Z'),new Date('2026-11-01T23:59:59.999Z'));
  const v=menu.main(worker.id,lang);let period=(await menu.click(worker.id,worker.phone,v.rows[0].id,lang,now))!;period=(await menu.click(worker.id,worker.phone,period.rows[5].id,lang,now))!;
  expect(period.body).toContain('KW 44 2026');await menu.text(worker.id,worker.phone,'KW 44 2026',lang,now);
  expect(ledger.getWorkerTimesheetHoursForPeriod).toHaveBeenLastCalledWith(worker.id,new Date('2026-10-26Z'),new Date('2026-11-01T23:59:59.999Z'));
 });
 it('KW missing year, zero or impossible 53 clarify; valid week 53 crosses year correctly',()=>{
  for(const x of ['KW 44','KW 0 2026','KW 53 2025','KW 44 2026 KW 45','KW 44 2026 01.10.2026'])expect(self.parseWorkerMessage(`Meine Stunden ${x}`,now).isDateAmbiguous).toBe(true);
  expect(self.parseWorkerMessage('Meine Stunden KW 53 2026',now)).toMatchObject({startDate:'2026-12-28',endDate:'2027-01-03'});
 });

});
