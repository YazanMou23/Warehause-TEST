import {workerMenuBody} from './worker-menu-copy';
import {SupportedLanguage} from './whatsapp-self-service.service';
describe('menu copy only',()=>{
 it.each(['de','ar','tr','uk'] as SupportedLanguage[])('%s has short main/day/date/year/month copy without changing records',lang=>{
  const choose={de:'Bitte auswählen',ar:'اختر من القائمة',tr:'Lütfen seç',uk:'Обери пункт'}[lang];
  expect(workerMenuBody(choose,lang,['day'])).toContain('📋');expect(workerMenuBody(choose,lang,['date'])).toContain('📅');
  expect(workerMenuBody({de:'Datum:',ar:'التاريخ:',tr:'Tarih:',uk:'Дата:'}[lang],lang,[])).toContain('05.11.2026');
  expect(workerMenuBody({de:'Jahr:',ar:'السنة:',tr:'Yıl:',uk:'Рік:'}[lang],lang,[])).toContain('2026');
  expect(workerMenuBody('2026',lang,[])).toContain('👇');expect(workerMenuBody('8 h\n05.11.2026',lang,['main'])).toBe('8 h\n05.11.2026');
 });
});
