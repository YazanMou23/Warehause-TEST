import {MessagingService} from './messaging.service';
import {SupportedLanguage} from './whatsapp-self-service.service';
describe('worker reply copy polish only',()=>{
 it.each(['de','ar','tr','uk'] as SupportedLanguage[])('%s acknowledgment keeps status, context, lock and one-note limit',async lang=>{
  const db:any={plan:{findUnique:jest.fn().mockResolvedValue({date:new Date('2026-11-05Z'),locations:[{warehouse:{name:'Synthetic site'},hall:{name:'Hall'}}]})}};
  const service:any=new MessagingService(db);
  for(const choice of ['CONFIRM','SICK','CUSTOM']){
   const text=await service.choiceLockedAcknowledgment('synthetic',choice,lang);
   expect(text).toContain('✅');expect(text).toContain('\n📅');expect(text).toContain('05.11.2026');expect(text).toContain('Synthetic site / Hall');expect(text).toContain('\n🔒');expect(text).toContain('\n👤');expect(text.includes('\n💬')).toBe(choice==='CUSTOM');expect(text.length).toBeLessThan(350);
  }
 });
 it('missing context does not invent a date/site or claim delivery',async()=>{
  const service:any=new MessagingService({plan:{findUnique:jest.fn().mockRejectedValue(new Error('missing'))}} as any);
  const text=await service.choiceLockedAcknowledgment('synthetic','CONFIRM','ar');expect(text).not.toContain('📅');expect(text).not.toContain('undefined');expect(text).toContain('تم تثبيت');
 });
});
