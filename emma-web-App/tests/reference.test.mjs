import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupMedication,closeSpelling} from '../rxnorm.mjs';
import {resolveMedicationProposal as resolve} from '../public/reference-flow.mjs';
import {medicationTurn as turn} from '../public/medications.mjs';
const candidate={name:'ondansetron',rxcui:'26225',source:'NLM RxNorm',match:'exact'};
const fresh=()=>({medications:[],events:[]});
test('lookup sends only term and reads canonical name',async()=>{
  const urls=[];
  const result=await lookupMedication('ondansetron',async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('rxcui.json')?{idGroup:{rxnormId:['26225']}}:{properties:{...candidate,tty:'IN'}}};});
  assert.equal(result[0].name,'ondansetron');assert.equal(urls.length,2);
  assert.ok(urls.every(x=>x.startsWith('https://rxnav.nlm.nih.gov/REST/')));
});
test('weak matches rejected',()=>{
  assert.equal(closeSpelling('on Dancetron','Gel-One'),false);
  assert.equal(closeSpelling('on Dancetron','Vitafol-One'),false);
});
test('no lookup or failed lookup cannot be confirmed',async()=>{
  for(const lookup of [async()=>[],async()=>{throw Error('offline');}]){
    const s=fresh();turn(s,'My nausea pill is on Dancetron.','voice');
    await resolve(s,lookup);turn(s,'yes','voice');assert.equal(s.medications.length,0);
  }
});
test('stale lookup cannot override cancelled proposal',async()=>{
  const s=fresh();turn(s,'My nausea pill is ondansetron.','voice');
  let complete;const result=resolve(s,()=>new Promise(r=>complete=r));turn(s,'cancel','voice');complete([candidate]);
  assert.equal(await result,null);assert.equal(s.medicationPending,null);
});
test('spelled fallback is checked before save',async()=>{
  const s=fresh();turn(s,'My nausea pill is on Dancetron.','voice');await resolve(s,async()=>[]);
  turn(s,'It is spelled O N D A N S E T R O N','voice');assert.equal(s.medicationPending.name,'ONDANSETRON');
  await resolve(s,async()=>[candidate]);assert.equal(s.medications.length,0);
  turn(s,'yes','voice');assert.equal(s.medications[0].name,'ondansetron');
});
test('spelling correction preserves identity and history',async()=>{
  const s={medications:[{id:'old',name:'on Dancetron',aliases:['nausea pill'],history:[]}],events:[]};
  turn(s,'Correct spelling of my nausea pill to ondansetron.','typed');await resolve(s,async()=>[candidate]);turn(s,'yes','typed');
  assert.equal(s.medications.length,1);assert.equal(s.medications[0].id,'old');assert.equal(s.medications[0].name,'ondansetron');
  assert.equal(s.medications[0].history[0].from,'on Dancetron');
});
test('ambiguous results require selection then confirmation',async()=>{
  const s=fresh();turn(s,'My nausea pill is testname.','voice');await resolve(s,async()=>[candidate,{name:'other',rxcui:'2'}]);
  turn(s,'yes','voice');assert.equal(s.medications.length,0);
  turn(s,'first','voice');assert.equal(s.medications.length,0);
  turn(s,'yes','voice');assert.equal(s.medications[0].name,'ondansetron');
});
