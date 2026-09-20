import test from 'node:test';
import assert from 'node:assert/strict';
import {medicationTurn as originalTurn} from '../public/medications.mjs';
// Fixture simulates a successful reference match; reference failures tested separately.
function turn(s,text,source,now){const result=originalTurn(s,text,source,now);if(s.medicationPending?.kind==='lookup'){s.medicationPending.kind='alias';s.medicationPending.reference={name:s.medicationPending.name,rxcui:'fixture',source:'test fixture'};}return result;}
const fresh=()=>({medications:[],events:[]});
function taught(){const s=fresh();turn(s,'My nausea pill is ondansetron.','typed',0);turn(s,'yes','typed',1);return s;}
test('alias only saved after confirmation, with provenance',()=>{
  const s=fresh();turn(s,'My nausea pill is ondansetron.','voice',0);assert.equal(s.medications.length,0);
  turn(s,'yes','voice',1);assert.equal(s.medications[0].name,'ondansetron');assert.equal(s.medications[0].provenance,'patient_report');
});
test('unknown medication does not create dose',()=>{const s=fresh();turn(s,'I just took my nausea pill.','voice');assert.equal(s.events.length,0);});
test('taken dose stays unknown until explicitly supplied',()=>{
  const s=taught();turn(s,'I just took my nausea pill.','voice',2);assert.equal(s.events[0].data.actualAmount,null);
  turn(s,'one tablet','voice',3);assert.equal(s.events.length,1);assert.equal(s.events[0].data.actualAmount,'one tablet');
});
test('correction retains historical identity',()=>{
  const s=taught();turn(s,'I took 4 mg of ondansetron.','voice',2);
  turn(s,'My nausea pill is granisetron.','voice',3);turn(s,'yes','voice',4);
  assert.equal(s.events[0].data.medicationName,'ondansetron');assert.equal(s.medications[0].aliases.length,0);
});
test('cancel, stale confirmation and topic changes cannot save a proposal',()=>{
  for(const followup of ['cancel','I feel tired.']) {const s=fresh();turn(s,'My nausea pill is ondansetron.','voice',0);turn(s,followup,'voice',1);turn(s,'yes','voice',2);assert.equal(s.medications.length,0);}
  const s=fresh();turn(s,'My nausea pill is ondansetron.','voice',0);turn(s,'yes','voice',130000);assert.equal(s.medications.length,0);
});
test('hypothetical and negative use not handled as taken',()=>{
  for(const text of ['I might take my nausea pill.',"I didn't take my nausea pill.",'Did I take my nausea pill?']){const s=taught();turn(s,text,'voice');assert.equal(s.events.length,0);}
});
