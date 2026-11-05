import {WhatsappSelfServiceService,SupportedLanguage} from './whatsapp-self-service.service';
import {MessagingService} from './messaging.service';
import {WorkerMenu} from './worker-menu';
describe('conversation language continuity and courtesy (offline)',()=>{
 const worker={id:'one',name:'Synthetic',phone:'+491701234567',role:'EMPLOYEE'},now=new Date('2026-11-05T21:00Z');
 let db:any,self:WhatsappSelfServiceService,svc:MessagingService,send:jest.SpyInstance,menus:jest.SpyInstance;
 beforeEach(()=>{db={user:{findMany:jest.fn().mockResolvedValue([worker])},planEmployee:{findMany:jest.fn().mockResolvedValue([])}};self=new WhatsappSelfServiceService(db,{} as any,{} as any);svc=new MessagingService(db,self);send=jest.spyOn(svc,'sendWhatsAppDirect').mockResolvedValue({success:true});menus=jest.spyOn(svc,'sendWorkerMenu').mockResolvedValue();});
 const input=(body:string)=>({id:`synthetic-${body}`,timestamp:String(now.getTime()/1000),from:worker.phone,type:'text',text:{body}});
 it.each([['ar','ساعاتي','تمام'],['tr','Saatlerim','Rica'],['uk','Мої години','ласка'],['de','Meine Stunden','Gern']] as [SupportedLanguage,string,string][])('%s inferred language survives neutral text and gives courtesy instead of confusion',async(lang,text,part)=>{
  expect(self.replyLanguage(worker.id,text)).toBe(lang);expect(self.replyLanguage(worker.id,'10.2026')).toBe(lang);expect(self.replyLanguage(worker.id,'ok')).toBe(lang);
  await svc.processIncomingWebhookMessage(input('ok'),now);expect(send.mock.calls[0][1]).toContain(part);expect(menus).not.toHaveBeenCalled();
 });
 it('Arabic unknown text stays Arabic; another worker does not inherit it',async()=>{
  self.replyLanguage(worker.id,'ساعاتي');expect(self.replyLanguage('other','ok')).toBe('de');await svc.processIncomingWebhookMessage(input('xyz'),now);expect(menus.mock.calls[0][1].body).toMatch(/[\u0600-\u06ff]/);expect(menus.mock.calls[0][1].body).not.toContain('Hallo');
 });
 it('explicit choice wins over detected language and neutral menu text',()=>{
  expect(self.replyLanguage(worker.id,'بالعربي')).toBe('ar');expect(self.replyLanguage(worker.id,'Meine Stunden')).toBe('ar');expect(self.replyLanguage(worker.id,'Deutsch')).toBe('de');expect(self.replyLanguage(worker.id,'شكرا')).toBe('de');
 });
 it('a valid Arabic menu click refreshes conversation language for later ok',async()=>{
  const menu=new WorkerMenu(self),root=menu.main(worker.id,'ar');await menu.click(worker.id,worker.phone,root.rows[0].id,'de',now);expect(self.replyLanguage(worker.id,'ok')).toBe('ar');
 });
 it('inferred language can change only on clear language evidence, not neutral Latin text',()=>{
  self.replyLanguage(worker.id,'ساعاتي');expect(self.replyLanguage(worker.id,'hello xyz')).toBe('ar');expect(self.replyLanguage(worker.id,'Meine Stunden')).toBe('de');
 });
 it('ok remains a CUSTOM note when exactly one assignment awaits it',async()=>{
  db.planEmployee.findMany.mockResolvedValue([{planId:'plan',employeeId:worker.id}]);const update=jest.spyOn(svc as any,'executeGuardedAssignmentUpdate').mockResolvedValue({accepted:true});
  await svc.processIncomingWebhookMessage(input('ok'),now);expect(update).toHaveBeenCalledWith(expect.objectContaining({note:'ok',requiredCurrentStatus:'CUSTOM_RESPONSE'}));expect(send).toHaveBeenCalledWith(expect.any(String),expect.stringContaining('gespeichert'));
 });
});
