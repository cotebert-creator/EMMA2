// USD standard rates verified 2026-09-15:
// https://developers.openai.com/api/docs/pricing
export const CREDIT_KEY = 'emma-testing-credits-v1';
const valid = n => Number.isFinite(n) && n >= 0;
export function usageCost(usage, kind) {
  if (!usage) return null;
  if (kind === 'interpretation') {
    const cached=usage.input_tokens_details?.cached_tokens??0;
    if (![usage.input_tokens,usage.output_tokens,cached].every(valid)||cached>usage.input_tokens)return null;
    return ((usage.input_tokens-cached)*.75+cached*.075+usage.output_tokens*4.5)/1e6;
  }
  if (kind === 'transcription') {
    if (usage.type !== 'tokens' || !valid(usage.input_tokens) || !valid(usage.output_tokens)) return null;
    return (usage.input_tokens * 1.25 + usage.output_tokens * 5) / 1e6;
  }
  const i = usage.input_token_details, o = usage.output_token_details;
  if (!i || !o) return null;
  const it = i.text_tokens, ia = i.audio_tokens, im = i.image_tokens ?? 0;
  const ot = o.text_tokens, oa = o.audio_tokens;
  if (![it, ia, im, ot, oa, usage.input_tokens, usage.output_tokens].every(valid)) return null;
  if (it + ia + im !== usage.input_tokens || ot + oa !== usage.output_tokens) return null;
  const cache = i.cached_tokens_details;
  if ((i.cached_tokens ?? 0) > 0 && !cache) return null;
  const ct = cache?.text_tokens ?? 0, ca = cache?.audio_tokens ?? 0, cm = cache?.image_tokens ?? 0;
  if (![ct, ca, cm].every(valid) || ct > it || ca > ia || cm > im || ct+ca+cm !== (i.cached_tokens ?? 0)) return null;
  return ((it-ct)*.6 + ct*.06 + (ia-ca)*10 + ca*.3 + (im-cm)*.8 + cm*.08 + ot*2.4 + oa*20)/1e6;
}
export function freshLedger() {return {balance:null,baseline:0,entries:{},syncedAt:null};}
export function totals(ledger) {
  return Object.values(ledger.entries).reduce((acc,e)=>{
    if (e.cost === null) acc.missing++;
    else acc.spent += e.cost;
    return acc;
  },{spent:0,missing:0});
}
export function accountEvent(ledger,event,model,transcriptionModel) {
  let id, usage, kind;
  if (event.type === 'response.done') {id=event.response?.id;usage=event.response?.usage;kind='voice';}
  else if (event.type === 'conversation.item.input_audio_transcription.completed') {
    id=event.item_id && event.item_id+':'+(event.content_index ?? 0);usage=event.usage;kind='transcription';
  } else if(event.type==='medication.interpretation.usage'){id=event.id;usage=event.usage;kind='interpretation';}
  else return false;
  id = kind+':'+(id || event.event_id || 'missing-id');
  if (Object.hasOwn(ledger.entries,id)) return false;
  const supported = kind === 'interpretation' ? event.model==='gpt-5.4-mini' : kind === 'voice' ? model === 'gpt-realtime-2.1-mini' : transcriptionModel === 'gpt-4o-mini-transcribe';
  ledger.entries[id] = {cost:supported ? usageCost(usage,kind) : null,kind};
  return true;
}
export function createCreditMeter(doc, storage, ask = message => window.prompt(message)) {
  let ledger = freshLedger(), damaged = false, storageFailed = false;
  let model = null, transcriptionModel = null;
  try {
    const raw=storage.getItem(CREDIT_KEY);
    if (raw) {
      const parsed=JSON.parse(raw);
      if (!parsed.entries || !valid(parsed.baseline) || !(parsed.balance === null || valid(parsed.balance)) ||
          !Object.values(parsed.entries).every(e=>e && (e.cost===null || valid(e.cost)))) throw Error('Invalid ledger');
      ledger=parsed;
    }
  } catch {damaged=true;}
  const counter=doc.getElementById('creditCounter'), note=doc.getElementById('creditNote');
  function render() {
    if (!counter || !note) return;
    const {spent,missing}=totals(ledger);
    const remaining=ledger.balance === null ? null : ledger.balance-(spent-ledger.baseline);
    counter.textContent=remaining === null ? 'Estimated credit remaining: set balance' :
      'Estimated credit remaining: '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(remaining);
    if (missing) counter.textContent += ' · incomplete';
    if (damaged || storageFailed) counter.textContent = 'Credit counter unavailable';
    note.textContent = damaged || storageFailed ? 'Counter unavailable: browser storage could not be read or saved.' :
      'Tracked cost: $'+spent.toFixed(4)+' USD. '+(missing ? 'Incomplete: '+missing+' usage reports could not be priced. ' : '')+
      'This browser only; excludes other apps, missed usage, taxes and price changes. Not a billing balance or spending limit.';
  }
  function persist() {if(damaged)return;try {storage.setItem(CREDIT_KEY,JSON.stringify(ledger));} catch {storageFailed=true;}render();}
  doc.getElementById('setCreditBalance')?.addEventListener('click',()=>{
    const raw=ask('Enter your current OpenAI API credit balance in USD (for example 10.00). This replaces the estimate’s baseline; it does not add funds. Best done between conversations.');
    if (raw === null) return;
    const value=raw.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !valid(Number(value))) {note.textContent='Please enter a non-negative dollar amount, such as 10.00.';return;}
    if(damaged) {note.textContent='Counter storage is unreadable; do not overwrite it. Ask for help recovering it.';return;}
    ledger.balance=Number(value);ledger.baseline=totals(ledger).spent;ledger.syncedAt=new Date().toISOString();persist();
  });
  render();
  return {handle(event) {
    // Accounting must never interrupt patient conversation.
    try {
      if(event.type==='session.created' || event.type==='session.updated') {
        model=event.session?.model ?? model;
        transcriptionModel=event.session?.audio?.input?.transcription?.model ?? transcriptionModel;
      }
      if(!damaged && accountEvent(ledger,event,model,transcriptionModel)) persist();
    } catch {storageFailed=true;render();}
  }};
}
