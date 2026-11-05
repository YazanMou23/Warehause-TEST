// SCAN keeps the existing OCR wall-clock convention. Other sources are instants.
export function registeredClock(iso: string, source?: string): string {
  return new Intl.DateTimeFormat('en-GB', {timeZone:source==='SCAN'?'UTC':'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));
}
export function registeredInstant(day:string,time:string,source?:string):string {
  const naive=Date.parse(`${day}T${time}:00Z`);
  if(source==='SCAN')return new Date(naive).toISOString();
  const values=[naive-3600000,naive-7200000].filter(n=>registeredClock(new Date(n).toISOString(),source)===time && new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(n))===day);
  if(values.length!==1)throw new Error('Uhrzeit bei Zeitumstellung unklar oder ungültig. Bitte expliziten Zeiteintrag verwenden.');
  return new Date(values[0]).toISOString();
}
export function registeredEnd(day:string,start:string,end:string,source?:string):string {
  if(end<start){const next=new Date(`${day}T00:00Z`);next.setUTCDate(next.getUTCDate()+1);day=next.toISOString().slice(0,10);}
  return registeredInstant(day,end,source);
}
export function sumDay<T extends {employeeId:string;date:string;totalHours:number|null}>(rows:T[],employeeId:string,date:string):T|undefined {
  const found=rows.filter(r=>r.employeeId===employeeId&&r.date===date);
  return found.length?{...found[0],totalHours:Math.round(found.reduce((s,r)=>s+(r.totalHours??0),0)*100)/100}:undefined;
}
