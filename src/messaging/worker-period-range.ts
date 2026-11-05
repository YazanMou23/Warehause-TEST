/** Calendar periods only, never timestamps. Last weeks are completed Mon-Sun weeks. */
export function parseWorkerRange(text:string, referenceDay:Date): {startDate?:string;endDate?:string;invalid?:boolean}|null {
 const iso=(d:Date)=>d.toISOString().slice(0,10);
 const date=(s:string)=>{let y:number,m:number,d:number;if(/^\d{4}-/.test(s))[y,m,d]=s.split('-').map(Number);else [d,m,y]=s.split('.').map(Number);const v=new Date(Date.UTC(y,m-1,d));return y>=2000&&y<=2100&&v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d?v:null;};
 const week=text.match(/(?:\bKW|\bKalenderwoche|\bWoche|(?:الأسبوع|الاسبوع)\s*رقم|\bhafta|тиждень)\s*(\d{1,2})(?!\d)/iu);
 if(week){
  const years=[...text.matchAll(/\b(20\d{2}|2100)\b/g)].map(m=>Number(m[1]));
  if((text.match(/\bKW\s*\d+/giu)||[]).length>1 || /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\.\d{1,2}\.\d{4})\b/.test(text))return {invalid:true};
  const n=Number(week[1]);if(years.length!==1||n<1||n>53)return {invalid:true};
  const y=years[0],jan4=new Date(Date.UTC(y,0,4)),monday=new Date(jan4);monday.setUTCDate(4-((jan4.getUTCDay()+6)%7)+(n-1)*7);
  const thursday=new Date(monday.getTime()+3*86400000);if(thursday.getUTCFullYear()!==y)return {invalid:true};
  return {startDate:iso(monday),endDate:iso(new Date(monday.getTime()+6*86400000))};
 }
 const dates=text.match(/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\.\d{1,2}\.\d{4})\b/g)||[];
 if(dates.length===2 && /(?:\bvon\b|\bbis\b|\bfrom\b|\bto\b|من|إلى|الى|حتى|\bile\b|\baras[ıi]\b|\bдо\b|\bвід\b|\bз\b|\s[-–]\s)/iu.test(text)){
  const a=date(dates[0]),b=date(dates[1]);return !a||!b||a>b?{invalid:true}:{startDate:iso(a),endDate:iso(b)};
 }
 const two=/(letzte[nr]?\s+(?:2|zwei)\s+wochen|son\s+(?:2|iki)\s+hafta|останні\s+(?:2|два)\s+тижні|(?:آخر|اخر)\s*(?:أسبوعين|اسبوعين|2\s*(?:أسبوع|اسبوع))|(?:الأسبوعين|الاسبوعين)\s*(?:الماضيين|السابقين))/iu.test(text);
 const one=/(letzte[nr]?\s+woche|ge[çc]en\s+hafta|минулого\s+тижня|минулий\s+тиждень|(?:الأسبوع|الاسبوع)\s*(?:الماضي|السابق)|(?:آخر|اخر)\s*(?:أسبوع|اسبوع))/iu.test(text);
 if((two||one)&&dates.length)return {invalid:true};
 if(two||one){const monday=new Date(Date.UTC(referenceDay.getUTCFullYear(),referenceDay.getUTCMonth(),referenceDay.getUTCDate()));monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));const end=new Date(monday.getTime()-86400000),start=new Date(monday.getTime()-(two?14:7)*86400000);return {startDate:iso(start),endDate:iso(end)};}
 // Week inside a month is ambiguous without the exact dates, never return the whole month.
 if(/(أسبوع|اسبوع|woche|hafta|тиж)/iu.test(text) && /(شهر|monat|місяц|\bay\b|\b20\d{2}\b)/iu.test(text))return {invalid:true};
 return null;
}
