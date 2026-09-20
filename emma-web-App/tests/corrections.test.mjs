import test from 'node:test';
import assert from 'node:assert/strict';
import {createCorrections} from '../public/corrections.mjs';
import {emptyState} from '../public/storage.mjs';
const fresh=()=>({...emptyState(),memories:[{id:'p1',category:'preference',value:'I prefer short answers',source:'voice',visibility:'companion'}],openLoops:[{id:'l1',text:'Ask my doctor about tingling',status:'open'}]});
test('edit needs confirmation and preserves original preference history',()=>{
  const s=fresh(),c=createCorrections();
  assert.match(c.turn(s,'Change my preference about answers to I prefer detailed answers.').message,/Change/);
  assert.equal(s.memories[0].value,'I prefer short answers');
  c.turn(s,'yes','voice');
  assert.equal(s.memories[0].value,'I prefer detailed answers');
  assert.equal(s.memories[0].history[0].value,'I prefer short answers');
  assert.equal(s.memories[0].provenance,'patient_report');
});
test('ambiguous preferences require a topic and a replacement before confirmation',()=>{
  const s=fresh(),c=createCorrections();s.memories.push({id:'p2',category:'preference',value:'I like quiet music'});
  assert.match(c.turn(s,'Change that preference.').message,/Which/);
  assert.match(c.turn(s,'short answers').message,/instead/);
  assert.match(c.turn(s,'I prefer detailed answers').message,/Change/);
  c.turn(s,'yes');assert.equal(s.memories[0].value,'I prefer detailed answers');assert.equal(s.memories[1].value,'I like quiet music');
});
test('forget requires confirmation and signals voice session restart',()=>{
  const s=fresh(),c=createCorrections();c.turn(s,'Forget that preference.');assert.equal(s.memories.length,1);
  assert.equal(c.turn(s,'yes').restart,true);assert.equal(s.memories.length,0);
});
test('handled question closes once, with provenance and journey evidence',()=>{
  const s=fresh(),c=createCorrections();c.turn(s,'We already handled that question about tingling.');assert.equal(s.openLoops[0].status,'open');
  c.turn(s,'go ahead','voice');c.turn(s,'yes','voice');assert.equal(s.openLoops[0].status,'closed');assert.equal(s.events.length,1);assert.equal(s.events[0].data.loopId,'l1');
});
test('cancel, timeout, topic changes and modified records prevent accidental writes',()=>{
  for(const mode of ['cancel','timeout','topic','modified']){
    const s=fresh(),c=createCorrections();c.turn(s,'Forget that preference.','voice',1000);
    if(mode==='cancel')c.turn(s,'cancel','voice',2000);
    if(mode==='topic')c.turn(s,'How are you?','voice',2000);
    if(mode==='modified')s.memories[0].value='I like quiet';
    c.turn(s,'yes','voice',mode==='timeout'?130000:3000);assert.equal(s.memories.length,1,mode);
  }
});
test('medication confirmation is never consumed by correction flow',()=>{
  const s=fresh(),c=createCorrections();s.medicationPending={kind:'alias'};
  assert.match(c.turn(s,'Forget that preference.').message,/current confirmation/);
  assert.equal(c.turn(s,'yes').handled,false);assert.equal(s.memories.length,1);
});
test('questions, negatives and hypothetical corrections do not change records',()=>{
  for(const text of ['Did we handle that question?','Do not forget that preference.','I might change my preference.']){
    const s=fresh(),c=createCorrections();assert.equal(c.turn(s,text).handled,false);assert.equal(s.memories.length,1);assert.equal(s.openLoops[0].status,'open');
  }
});


test('answers matches saved explanations and tolerates conversational prefixes',()=>{
  const s=fresh(),c=createCorrections();s.memories[0].value='I prefer short explanations';
  assert.match(c.turn(s,'Emma, can you please change my preference about answers to I prefer detailed answers. .').message,/Change “I prefer short explanations”/);
  c.turn(s,'yes');assert.equal(s.memories[0].value,'I prefer detailed answers');
});

test('missing preference is offered as a new memory, never claimed as an edit',()=>{
  const s=fresh(),c=createCorrections();s.memories=[];
  assert.match(c.turn(s,'Change my preference about answers to I prefer detailed answers.').message,/earlier saved preference/);
  assert.equal(s.memories.length,0);c.turn(s,'yes');assert.equal(s.memories[0].value,'I prefer detailed answers');
});

test('synonyms cannot collapse two different saved preferences into a guessed edit',()=>{
  const s=fresh(),c=createCorrections();s.memories.push({id:'p2',category:'preference',value:'I prefer medical explanations in plain language'});
  assert.match(c.turn(s,'Change my preference about answers to I prefer detailed answers.').message,/Which preference/);
  c.turn(s,'yes');assert.equal(s.memories[0].value,'I prefer short answers');
});
