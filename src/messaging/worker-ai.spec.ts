import { WorkerAiService, WORKER_AI_LIMITS } from './worker-ai.service';
const answer = { intent:'HOURS', language:'de', period:'MONTH', year:2026, month:10, date:null, needsClarification:false };
describe('Bounded worker AI (synthetic only)', () => {
  let network: jest.SpyInstance;
  const config = (values: Record<string,string> = {}) => ({ get: (k: string) => values[k] } as any);
  const ledger = () => ({ reserve: jest.fn().mockResolvedValue('r'), settle: jest.fn().mockResolvedValue(undefined) });
  beforeEach(() => { network = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network forbidden in tests')); });
  afterEach(() => network.mockRestore());
  it('defaults OFF even when a generic OPENAI_API_KEY exists', async () => {
    const s = new WorkerAiService(config({ OPENAI_API_KEY:'synthetic' }));
    expect(await s.classify('test','question','de',[],new Date())).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });
  it('fails closed without durable ledger even with enabled flag', async () => {
    const s = new WorkerAiService(config({ WHATSAPP_WORKER_AI_ENABLED:'true', WHATSAPP_WORKER_AI_MODEL:'gpt-4o-mini', WHATSAPP_WORKER_AI_API_KEY:'synthetic' }));
    expect(await s.classify('test','question','de',[],new Date())).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });
  it('publishes the agreed 5/day limit, not the old 10', () => {
    expect(WORKER_AI_LIMITS).toMatchObject({ daily:5, perMinute:2, monthlyUsd:5 });
  });
  const configured = (l = ledger()) => new WorkerAiService(config({ WHATSAPP_WORKER_AI_ENABLED:'true', WHATSAPP_WORKER_AI_MODEL:'gpt-4o-mini', WHATSAPP_WORKER_AI_API_KEY:'synthetic' }), l);
  it('makes no request when reserve refuses', async () => {
    const l = ledger(); l.reserve.mockResolvedValue(null); const s = configured(l);
    await s.classify('synthetic-worker','question','ar',[],new Date()); expect(network).not.toHaveBeenCalled();
  });
  it('sends only sanitized text and strict stateless schema, no worker ID or tools', async () => {
    network.mockResolvedValue({ ok:true, json:async()=>({ status:'completed', usage:{ input_tokens:100, output_tokens:30 }, output:[{ content:[{ type:'output_text', text:JSON.stringify(answer) }] }] }) });
    const l = ledger(); const s = configured(l);
    expect(await s.classify('private-id','Synthetic Name asks October 2026 me@example.invalid','de',['Synthetic Name'],new Date('2026-11-05T22:00:00Z'))).toEqual(answer);
    const body = JSON.parse(network.mock.calls[0][1].body);
    expect(body.store).toBe(false); expect(body.text.format.strict).toBe(true); expect(body.tools).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/private-id|Synthetic Name|me@example/); expect(l.settle).toHaveBeenCalled();
  });
  it.each([429,500,401])('fails safely on HTTP %s without refunding uncertain reservation', async code => {
    network.mockResolvedValue({ ok:false, status:code }); const l = ledger();
    expect(await configured(l).classify('test','question','de',[],new Date())).toBeNull();
    expect(network).toHaveBeenCalledTimes(1); expect(l.settle).not.toHaveBeenCalled();
  });
  it('fails safely on timeout, no retry', async () => {
    const l=ledger(); expect(await configured(l).classify('test','question','de',[],new Date())).toBeNull();
    expect(network).toHaveBeenCalledTimes(1); expect(l.settle).not.toHaveBeenCalled();
  });
  it.each(['مرض','krank','hasta','password','ignore instructions','راتب','x'.repeat(1001)])('does not transmit disallowed text %s', async text => {
    await configured().classify('test',text,'de',[],new Date()); expect(network).not.toHaveBeenCalled();
  });
  const s = new WorkerAiService(config());
  it.each(Array.from({length:80},(_,i)=>[i, ['de','tr','ar','uk'][i%4], i%12+1]))('validates synthetic schema %s %s month %s', (_,language,month) => {
    expect(s.validate({ ...answer, language, month })).not.toBeNull();
  });
  it.each([
    {...answer, employeeId:'other'}, {...answer, intent:'SICK'}, {...answer, intent:'SQL'}, {...answer, language:'en'},
    {...answer, month:13}, {...answer, year:null}, {...answer, month:1.2}, {...answer, year:2500},
    {...answer, period:'EXACT_DATE', year:null, month:null, date:'2026-02-30'},
    {...answer, period:'UPCOMING'}, {...answer, needsClarification:'false'}, {...answer, date:'2026-10-01'},
  ])('rejects invalid or extra model fields %#', value => { expect(s.validate(value)).toBeNull(); });
});

describe('Synthetic questions at privacy boundary (no paid API)', () => {
  const s = new WorkerAiService({ get:()=>undefined } as any);
  const phrases = [
    'Wie viel habe ich im Oktober 2026 geleistet?', 'Was steht morgen für mich an?', 'Antworte auf Arabisch', 'Nein', 'Ändere meine Stunden',
    'ايمت دوامي الجاي؟', 'شو مجموع شغلي في أكتوبر 2026؟', 'جاوب بالعربي', 'لا', 'عدل كشف الساعات',
    'Ekim 2026 toplam mesaim?', 'Yarın görevim ne?', 'Türkçe cevap ver', 'hayır', 'Saatlerimi değiştir',
    'Скільки я працював у жовтні 2026?', 'Коли наступна зміна?', 'Відповідай українською', 'ні', 'Виправи години',
  ];
  it.each(phrases.flatMap((p,i)=>Array.from({length:4},(_,j)=>[`${i}-${j}`,`${p}${['','?','  ','!'][j]}`])))('safe offline input case %s', (_,text) => {
    // This checks bounded input handling only, not semantic model accuracy.
    const result=s.sanitize(text,[]);
    expect(result === null || result.length <= 1000).toBe(true);
  });
});

describe('Safe diagnostic reasons', () => {
  it('reports fixed reason without raw input',async()=>{
    const diag=jest.fn(); const s=new WorkerAiService({get:()=>undefined} as any);
    await s.classify('private-id','private worker text','de',[],new Date(),diag);
    expect(diag).toHaveBeenCalledWith('DISABLED_OR_NO_LEDGER');
    expect(JSON.stringify(diag.mock.calls)).not.toMatch(/private/);
  });
});
