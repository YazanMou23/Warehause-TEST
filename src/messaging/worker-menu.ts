import { randomBytes } from 'crypto';
import { SupportedLanguage, WhatsappSelfServiceService } from './whatsapp-self-service.service';

type Lang = SupportedLanguage;
type Kind = 'HOURS' | 'PLANS';
type Action = { step: string; kind?: Kind; year?: number; half?: number; query?: string; page?: number; language?: Lang };
export type WorkerMenuReply = { body: string; rows: { id: string; title: string }[] };
const words: Record<Lang, string[]> = {
  de: ['Menü', 'Meine Stunden', 'Meine Schichten', 'Bestimmter Tag', 'Sprache / Hilfe', 'Dieser Monat', 'Letzter Monat', 'Monat und Jahr', 'Ganzes Jahr', 'Alle Monate', 'Kommende Schichten', 'Registrierte Stunden', 'Geplante Schicht', 'Zurück', 'Weiter', 'Datum: TT.MM.JJJJ', 'Jahr: JJJJ (2000–2100)', 'Auswahl abgelaufen. Menü neu öffnen.', 'Bitte auswählen', 'Änderungen: Schichtleitung. Keine Stundenbuchung im Chat.'],
  ar: ['القائمة', 'ساعاتي', 'خططي', 'يوم محدد', 'اللغة والمساعدة', 'هذا الشهر', 'الشهر الماضي', 'شهر وسنة', 'سنة كاملة', 'كل الأشهر', 'المناوبات القادمة', 'ساعات مسجلة', 'مناوبة مخططة', 'رجوع', 'التالي', 'التاريخ: DD.MM.YYYY', 'السنة: YYYY (2000–2100)', 'انتهت صلاحية الاختيار. افتح القائمة مجدداً.', 'اختر من القائمة', 'للتغييرات تواصل مع مشرف المناوبة. لا نسجل ساعات من الدردشة.'],
  tr: ['Menü', 'Saatlerim', 'Vardiyalarım', 'Belirli bir gün', 'Dil / Yardım', 'Bu ay', 'Geçen ay', 'Ay ve yıl', 'Tüm yıl', 'Tüm aylar', 'Gelecek vardiyalar', 'Kayıtlı saatler', 'Planlanan vardiya', 'Geri', 'İleri', 'Tarih: GG.AA.YYYY', 'Yıl: YYYY (2000–2100)', 'Seçim süresi doldu. Menüyü yeniden aç.', 'Lütfen seç', 'Değişiklikler: vardiya sorumlusu. Sohbette saat kaydı yapılmaz.'],
  uk: ['Меню', 'Мої години', 'Мої зміни', 'Певний день', 'Мова / Допомога', 'Цей місяць', 'Минулий місяць', 'Місяць і рік', 'Увесь рік', 'Усі місяці', 'Майбутні зміни', 'Зареєстровані години', 'Запланована зміна', 'Назад', 'Далі', 'Дата: ДД.ММ.РРРР', 'Рік: РРРР (2000–2100)', 'Вибір застарів. Відкрий меню знову.', 'Обери пункт', 'Зміни: керівник зміни. Години в чаті не записуються.'],
};
const monthNames: Record<Lang, string[]> = {
 de: ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
 ar: ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
 tr: ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'],
 uk: ['січень','лютий','березень','квітень','травень','червень','липень','серпень','вересень','жовтень','листопад','грудень'],
};
/** Opaque menu tokens carry no employee ID. Every click is bound to the freshly
 * verified worker. Restart/expiry fail closed. Never handles assignment writes. */
export class WorkerMenu {
  private tokens = new Map<string, { owner: string; at: number; language: Lang; action: Action }>();
  private awaiting = new Map<string, { at: number; language: Lang; action: Action }>();
  constructor(private readonly self: WhatsappSelfServiceService) {}
  private row(owner: string, lang: Lang, title: string, action: Action) {
    if (this.tokens.size >= 10000) this.tokens.delete(this.tokens.keys().next().value!);
    const id = `MENU_${randomBytes(12).toString('hex')}`;
    this.tokens.set(id, { owner, at: Date.now(), language: lang, action });
    return { id, title: title.slice(0, 24) };
  }
  private view(owner: string, lang: Lang, body: string, items: [string, Action][]): WorkerMenuReply {
    return { body, rows: items.map(([title, action]) => this.row(owner, lang, title, action)) };
  }
  main(owner: string, lang: Lang, prefix = '') {
    this.awaiting.delete(owner);
    const w = words[lang];
    return this.view(owner, lang, `${prefix}${prefix ? '\n' : ''}${w[18]}`, [[w[1], {step:'period',kind:'HOURS'}],[w[2],{step:'period',kind:'PLANS'}],[w[3],{step:'day'}],[w[4],{step:'language'}]]);
  }
  isMenuText(text: string) { return /^(القائمة|قائمة|مرحبا|مرحباً|men[uü]|hallo|merhaba|меню|привіт|hilfe|مساعدة|yardım|допомога)[!.؟?]*$/iu.test(text.trim()); }
  async text(owner: string, phone: string, text: string, lang: Lang, now: Date): Promise<WorkerMenuReply | null> {
    if (this.isMenuText(text)) return this.main(owner,lang);
    const pending = this.awaiting.get(owner);
    if (!pending || Date.now()-pending.at > 30*60*1000) { this.awaiting.delete(owner); return null; }
    const value = text.trim().replace(/[٠-٩۰-۹]/g,d=>String(d.charCodeAt(0)-(d>='۰'?1776:1632)));
    lang = pending.language;
    const a = pending.action;
    if (a.step === 'date' && /^\d{1,2}\.\d{1,2}\.20\d{2}$/.test(value)) {
      this.awaiting.delete(owner); return this.query(owner,phone,`${a.kind==='HOURS'?'Meine Stunden':'Meine Schichtpläne'} ${value}`,lang,now);
    }
    if (a.step === 'year' && /^(20\d{2}|2100)$/.test(value)) {
      this.awaiting.delete(owner);
      return a.half === -1 ? this.query(owner,phone,`${a.kind==='HOURS'?'Meine Stunden':'Meine Schichtpläne'} Jahr ${value}`,lang,now) : this.months(owner,lang,a.kind!,Number(value),0);
    }
    if (/^[123]$/.test(value)) return null;
    if (/^[0-9. /-]+$/.test(value)) return this.view(owner, lang, words[lang][a.step === 'date' ? 15 : 16], [[words[lang][13], { step:'main' }]]);
    // Do not absorb a shift choice or arbitrary follow-up note as date input.
    return null;
  }
  async click(owner: string, phone: string, id: string, lang: Lang, now: Date): Promise<WorkerMenuReply> {
    const token = this.tokens.get(id);
    if (!token || token.owner!==owner || Date.now()-token.at>30*60*1000) return this.main(owner,lang,words[lang][17]);
    lang = token.language;
    const a = token.action, w = words[lang];
    this.awaiting.delete(owner);
    if (a.step==='main') return this.main(owner,lang);
    if (a.step==='query') return this.query(owner,phone,a.query!,lang,now,a.page);
    if (a.step==='months') return this.months(owner,lang,a.kind!,a.year!,a.half!);
    if (a.step==='setLanguage') { this.self.replyLanguage(owner, {de:'Deutsch',ar:'بالعربي',tr:'Türkçe',uk:'українською'}[a.language!]); return this.main(owner,a.language!); }
    if (a.step==='language') return this.view(owner,lang,`${w[18]}\n${w[19]}`, [['Deutsch',{step:'setLanguage',language:'de'}],['العربية',{step:'setLanguage',language:'ar'}],['Türkçe',{step:'setLanguage',language:'tr'}],['Українська',{step:'setLanguage',language:'uk'}],[w[13],{step:'main'}]]);
    if (a.step==='day') return this.view(owner,lang,w[18],[[w[11],{step:'date',kind:'HOURS'}],[w[12],{step:'date',kind:'PLANS'}],[w[13],{step:'main'}]]);
    if (a.step==='date' || a.step==='year') { if(this.awaiting.size>=10000) this.awaiting.delete(this.awaiting.keys().next().value!); this.awaiting.set(owner,{at:Date.now(),language:lang,action:a}); return this.view(owner,lang,w[a.step==='date'?15:16],[[w[13],{step:'main'}]]); }
    const noun = a.kind==='HOURS'?'Meine Stunden':'Meine Schichtpläne';
    const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    const year=Number(date.slice(0,4)), month=Number(date.slice(5,7));
    const previous=new Date(Date.UTC(year,month-2,1));
    const q = (tail:string):Action=>({step:'query',query:`${noun} ${tail}`});
    const rows: [string,Action][] = [[w[5],q(`${month}.${year}`)],[w[6],q(`${previous.getUTCMonth()+1}.${previous.getUTCFullYear()}`)],[w[7],{step:'year',kind:a.kind}],[w[8],{step:'year',kind:a.kind,half:-1}],[w[9],q('alle Monate')]];
    if(a.kind==='PLANS') rows.unshift([w[10],q('kommende')]);
    rows.push([w[13],{step:'main'}]);
    return this.view(owner,lang,w[18],rows);
  }
  private months(owner:string, lang:Lang, kind:Kind, year:number, half:number) {
    const rows: [string,Action][] = monthNames[lang].slice(half*6,half*6+6).map((name,i)=>[`${half*6+i+1} - ${name}`,{step:'query',query:`${kind==='HOURS'?'Meine Stunden':'Meine Schichtpläne'} ${half*6+i+1}.${year}`}]);
    rows.push([half===0?'7–12':'1–6',{step:'months',kind,year,half:half===0?1:0}],[words[lang][13],{step:'main'}]);
    return this.view(owner,lang,String(year),rows);
  }
  async query(owner:string,phone:string,query:string,lang:Lang,now:Date,page=0):Promise<WorkerMenuReply> {
    const result=await this.self.handleIncomingConversation(phone,query,now,lang,page);
    const rows:[string,Action][]=[];
    if(result.nextPage!==undefined) rows.push([words[lang][14],{step:'query',query,page:result.nextPage}]);
    rows.push([words[lang][0],{step:'main'}]);
    return this.view(owner,lang,`${result.replyText}\n${{de:'Seite',ar:'صفحة',tr:'Sayfa',uk:'Сторінка'}[lang]} ${page+1}`,rows);
  }
  withNext(owner:string,lang:Lang,query:string,nextPage:number,body:string) {
    return this.view(owner,lang,body,[[words[lang][14],{step:'query',query,page:nextPage}],[words[lang][0],{step:'main'}]]);
  }
}
