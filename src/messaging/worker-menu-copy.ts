import type {SupportedLanguage} from './whatsapp-self-service.service';
const copy:Record<SupportedLanguage,{choose:string;main:string;period:string;day:string;date:string;year:string;language:string}>={
 de:{choose:'👇 Wähle eine Option.',main:'📋 Dein Arbeitsmenü\n👇 Was möchtest du sehen?',period:'📅 Zeitraum wählen\n👇 Wähle eine Option.',day:'📅 Bestimmten Tag prüfen\n👇 Registrierte Stunden oder geplante Schicht?',date:'📅 Datum eingeben: TT.MM.JJJJ\n✍️ Zum Beispiel: 05.11.2026',year:'📅 Jahr eingeben: JJJJ (2000–2100)\n✍️ Zum Beispiel: 2026',language:'🌐 Sprache & Hilfe'},
 ar:{choose:'👇 اختر الخيار المناسب.',main:'📋 قائمة العمل\n👇 شو بدك تشوف؟',period:'📅 اختر الفترة\n👇 اختر الخيار المناسب.',day:'📅 استعلام عن يوم محدد\n👇 ساعات مسجلة أم مناوبة مخططة؟',date:'📅 اكتب التاريخ: DD.MM.YYYY\n✍️ مثال: 05.11.2026',year:'📅 اكتب السنة: YYYY (2000–2100)\n✍️ مثال: 2026',language:'🌐 اللغة والمساعدة'},
 tr:{choose:'👇 Bir seçenek seç.',main:'📋 İş menün\n👇 Neyi görmek istiyorsun?',period:'📅 Dönemi seç\n👇 Bir seçenek seç.',day:'📅 Belirli bir günü sorgula\n👇 Kayıtlı saatler mi, planlanan vardiya mı?',date:'📅 Tarihi yaz: GG.AA.YYYY\n✍️ Örnek: 05.11.2026',year:'📅 Yılı yaz: YYYY (2000–2100)\n✍️ Örnek: 2026',language:'🌐 Dil ve yardım'},
 uk:{choose:'👇 Обери потрібний пункт.',main:'📋 Твоє робоче меню\n👇 Що хочеш переглянути?',period:'📅 Обери період\n👇 Обери потрібний пункт.',day:'📅 Перевір конкретний день\n👇 Зареєстровані години чи запланована зміна?',date:'📅 Введи дату: ДД.ММ.РРРР\n✍️ Наприклад: 05.11.2026',year:'📅 Введи рік: РРРР (2000–2100)\n✍️ Наприклад: 2026',language:'🌐 Мова й допомога'},
};
/** Presentation only: no actions, tokens, pending input or result data changes. */
export function workerMenuBody(body:string,lang:SupportedLanguage,steps:string[]):string{
 const c=copy[lang];
 // Also preserve and decorate the more specific prompts introduced by #24.
 if(body.startsWith('📋')||body.startsWith('📅')||body.startsWith('🌐'))return body;
 if(/^(Was möchtest du sehen|شو بدك تشوف|Neyi görmek istiyorsun|Що хочеш переглянути)/u.test(body))return c.main;
 if(/^(Zeitraum wählen|اختر الفترة|Dönemi seç|Обери період)/u.test(body))return `📅 ${body}`;
 if(/^(Monat\/Jahr:|اكتب الشهر والسنة|Ay\/yıl:|Місяць\/рік:|Von\/bis eingeben:|اكتب من تاريخ|Başlangıç ve bitiş:|Введи дати:|20\d{2} - |\d{1,2}-\d{1,2}:)/u.test(body))return `📅 ${body}`;
 if(/^(Gearbeitet oder geplant|ساعات عمل مسجلة أم|Kayıtlı saat mi|Зареєстровані години чи)/u.test(body))return c.day;
 const generic={de:'Bitte auswählen',ar:'اختر من القائمة',tr:'Lütfen seç',uk:'Обери пункт'}[lang];
 if(body.endsWith(generic)){
  const heading=steps.includes('day')?c.main:steps.includes('date')?c.day:c.period;
  return body.slice(0,-generic.length)+heading;
 }
 if(/^(Datum:|التاريخ:|Tarih:|Дата:)/u.test(body))return c.date;
 if(/^(Jahr:|السنة:|Yıl:|Рік:)/u.test(body))return c.year;
 if(/^20\d{2}$/.test(body))return `📅 ${body}\n${{de:'👇 Monat auswählen.',ar:'👇 اختر الشهر.',tr:'👇 Ayı seç.',uk:'👇 Обери місяць.'}[lang]}`;
 if(body.startsWith(generic+'\n'))return c.language+'\n'+body.slice(generic.length+1);
 return body;
}
