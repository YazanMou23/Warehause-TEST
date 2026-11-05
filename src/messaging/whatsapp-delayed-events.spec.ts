import { MessagingService } from './messaging.service';
import { WhatsappSelfServiceService } from './whatsapp-self-service.service';
import { WorkerMenu } from './worker-menu';
describe('delayed and stale inbound safety',()=>{
 const now=new Date('2026-11-05T20:39:00Z');
 const worker={id:'synthetic',name:'Test',phone:'+491701234567',role:'EMPLOYEE'};
 let db:any,self:WhatsappSelfServiceService,svc:MessagingService,send:jest.SpyInstance;
 beforeEach(()=>{db={user:{findMany:jest.fn().mockResolvedValue([worker])},planEmployee:{findMany:jest.fn(),updateMany:jest.fn()}};self=new WhatsappSelfServiceService(db,{} as any,{} as any);svc=new MessagingService(db,self);send=jest.spyOn(svc,'sendWhatsAppDirect').mockResolvedValue({success:true});});
 it.each(['text','interactive'])('silently rejects a first-seen %s delivered 24 minutes late',async type=>{
  const menu=jest.spyOn(svc,'sendWorkerMenu').mockResolvedValue();
  await svc.processIncomingWebhookMessage({id:`new-delayed-${type}`,timestamp:String(now.getTime()/1000-24*60),from:worker.phone,type,text:{body:'نعم'},interactive:{button_reply:{id:'CONFIRM_plan_synthetic',title:'حاضر'}}},now);
  expect(send).not.toHaveBeenCalled();expect(menu).not.toHaveBeenCalled();expect(db.planEmployee.updateMany).not.toHaveBeenCalled();expect(db.user.findMany).not.toHaveBeenCalled();
 });
 it.each(['MENU_ar_expired','MENU_unknown','MENU_de_missing'])('unknown/expired menu click %s cannot emit random default-German menu',async id=>{
  const menu=jest.spyOn(svc,'sendWorkerMenu').mockResolvedValue();
  await svc.processIncomingWebhookMessage({id,timestamp:String(now.getTime()/1000),from:worker.phone,type:'interactive',interactive:{list_reply:{id,title:'Menü'}}},now);
  expect(send).not.toHaveBeenCalled();expect(menu).not.toHaveBeenCalled();expect(db.planEmployee.updateMany).not.toHaveBeenCalled();
 });
 it('valid Arabic menu token keeps Arabic despite a language-neutral incoming title',async()=>{
  const menu=new WorkerMenu(self);const root=menu.main(worker.id,'ar');
  const result=await menu.click(worker.id,worker.phone,root.rows[0].id,'de',now);
  expect(result?.body).toContain('📅 اختر الفترة');expect(result?.rows[0].title).toBe('هذا الشهر');
 });
 it('fresh explicit Arabic menu text still works after restart without prior session',async()=>{
  const menu=jest.spyOn(svc,'sendWorkerMenu').mockResolvedValue();
  await svc.processIncomingWebhookMessage({id:'fresh-ar',timestamp:String(now.getTime()/1000),from:worker.phone,type:'text',text:{body:'قائمة'}},now);
  expect(menu).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({body:expect.stringContaining('📋 قائمة العمل')}));
 });
});
