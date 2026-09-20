import test from 'node:test';
import assert from 'node:assert/strict';
import {usageCost,freshLedger,accountEvent,totals,createCreditMeter,CREDIT_KEY} from '../public/credits.mjs';
const usage={input_tokens:2000,output_tokens:500,input_token_details:{text_tokens:1000,audio_tokens:1000,cached_tokens:1000,cached_tokens_details:{text_tokens:500,audio_tokens:500}},output_token_details:{text_tokens:100,audio_tokens:400}};
test('modality and cached tokens receive distinct prices',()=>assert.ok(Math.abs(usageCost(usage,'voice')-.01372)<1e-10));
test('transcription has its own price',()=>assert.equal(usageCost({type:'tokens',input_tokens:1000,output_tokens:100},'transcription'),.00175));
test('interpretation cost includes cache discount and is deduplicated',()=>{
  const ledger=freshLedger(),event={type:'medication.interpretation.usage',id:'i1',model:'gpt-5.4-mini',usage:{input_tokens:1000,input_tokens_details:{cached_tokens:500},output_tokens:100}};
  accountEvent(ledger,event);accountEvent(ledger,event);
  assert.ok(Math.abs(totals(ledger).spent-.0008625)<1e-10);assert.equal(Object.keys(ledger.entries).length,1);
});
test('missing data and unsupported durations are not zero cost',()=>{
  assert.equal(usageCost(null,'voice'),null);
  assert.equal(usageCost({input_tokens:100},'voice'),null);
  assert.equal(usageCost({type:'duration',seconds:20},'transcription'),null);
});
test('duplicate response events billed once; unknown model flagged',()=>{
  const ledger=freshLedger(),event={type:'response.done',response:{id:'r1',usage}};
  accountEvent(ledger,event,'gpt-realtime-2.1-mini');accountEvent(ledger,event,'gpt-realtime-2.1-mini');
  assert.equal(Object.keys(ledger.entries).length,1);
  accountEvent(ledger,{type:'response.done',response:{id:'r2',usage}},'unknown');
  assert.equal(totals(ledger).missing,1);
});
test('balance persists independently and can be reconciled without erasing costs',()=>{
  const data=new Map(),nodes=new Map();
  const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const doc={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{addEventListener:(_e,fn)=>nodes.get(id).click=fn});return nodes.get(id);}};
  let answer='10.00';
  const meter=createCreditMeter(doc,storage,()=>answer);
  nodes.get('setCreditBalance').click();
  meter.handle({type:'session.created',session:{model:'gpt-realtime-2.1-mini'}});
  meter.handle({type:'response.done',response:{id:'r1',usage}});
  assert.match(nodes.get('creditCounter').textContent,/9.99/);
  createCreditMeter(doc,storage,()=>answer);
  assert.match(nodes.get('creditCounter').textContent,/9.99/);
  answer='8.00';nodes.get('setCreditBalance').click();
  assert.match(nodes.get('creditCounter').textContent,/8.00/);
  assert.equal(Object.keys(JSON.parse(data.get(CREDIT_KEY)).entries).length,1);
});
