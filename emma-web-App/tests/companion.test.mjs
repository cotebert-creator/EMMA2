import test from 'node:test';
import assert from 'node:assert/strict';
import {companionTurn,contextPacket,isLowEnergy,searchJourney} from '../public/companion.mjs';
import {STORE_KEY,PREVIOUS_KEY,emptyState,loadState,persistState} from '../public/storage.mjs';
import {encryptBackup,decryptBackup} from '../public/backup.mjs';
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};

test('tired day is temporary, explicit and does not infer permanent memory',()=>{
  const s=emptyState();companionTurn(s,'I’m wiped out today','voice',1000);
  assert.equal(isLowEnergy(s,2000),true);assert.equal(isLowEnergy(s,13*3600000),false);
  assert.equal(s.memories.length,0);
  assert.match(contextPacket(s,2000).interaction,/one short sentence/);
  companionTurn(s,'Back to normal mode','voice',3000);assert.equal(isLowEnergy(s,4000),false);
  assert.equal(companionTurn(s,'Will I be tired tomorrow?').handled,false);
});
test('personal memories require current confirmation and keep provenance',()=>{
  const s=emptyState();companionTurn(s,'Remember that I prefer short explanations.','voice',1000);
  assert.equal(s.memories.length,0);companionTurn(s,'yes','voice',2000);
  assert.equal(s.memories[0].value,'I prefer short explanations');
  assert.equal(s.memories[0].provenance,'patient_report');assert.equal(s.memories[0].source,'voice');
  companionTurn(s,'Remember that I like quiet.','typed',3000);
  companionTurn(s,'What time is it?','typed',4000);companionTurn(s,'yes','typed',5000);
  assert.equal(s.memories.length,1);
  companionTurn(s,'Remember that I like quiet.','typed',6000);companionTurn(s,'yes','typed',200000);
  assert.equal(s.memories.length,1);
});
test('private memory is local and omitted from all future context packets',()=>{
  const s=emptyState();const reply=companionTurn(s,'Remember privately I am worried about my family.','typed');
  assert.match(reply.message,/audio/);companionTurn(s,'yes');
  assert.equal(s.memories[0].visibility,'private');assert.equal(contextPacket(s).memories.length,0);
});
test('medication and personal memory confirmations cannot compete',()=>{
  const s=emptyState();s.medicationPending={kind:'alias'};
  const result=companionTurn(s,'Remember that I prefer quiet.');
  assert.match(result.message,/medication question/);assert.equal(s.memoryPending,null);
});
test('open loops retrieval respects resolution and low energy',()=>{
  const s=emptyState();s.openLoops=[{id:'1',text:'Ask about tingling',status:'open'},{id:'2',text:'Refill',status:'open'},{id:'3',text:'Old',status:'closed'}];
  companionTurn(s,'I am exhausted today');const result=companionTurn(s,'Am I forgetting anything?');
  assert.match(result.message,/one more/);assert.doesNotMatch(result.message,/Old/);
});
test('corrupt storage stays untouched and blocks writes',()=>{
  const db=storage();db.setItem(STORE_KEY,'{broken');
  assert.ok(loadState(db).error);assert.throws(()=>persistState(db,emptyState()));
  assert.equal(db.getItem(STORE_KEY),'{broken');
});
test('previous save survives failed primary write and debug is never persisted',()=>{
  const db=storage();const s=emptyState();s.debug=[{text:'sensitive'}];persistState(db,s);
  assert.deepEqual(JSON.parse(db.getItem(STORE_KEY)).debug,[]);
  const old=db.getItem(STORE_KEY),original=db.setItem;
  db.setItem=(key,value)=>{if(key===STORE_KEY)throw Error('quota');original(key,value);};
  s.patient.preferredName='New';assert.throws(()=>persistState(db,s));
  assert.equal(db.getItem(STORE_KEY),old);assert.equal(db.getItem(PREVIOUS_KEY),old);
});
test('encrypted backup round trip preserves private memory and rejects wrong password/tamper',async()=>{
  const s=emptyState();s.patient.preferredName='Synthetic';s.memories=[{id:'p',value:'Private example',category:'private',visibility:'private'}];
  const encrypted=await encryptBackup(s,'synthetic password only');
  assert.ok(!encrypted.includes('Synthetic'));assert.ok(!encrypted.includes('Private example'));
  assert.equal((await decryptBackup(encrypted,'synthetic password only')).memories[0].visibility,'private');
  await assert.rejects(decryptBackup(encrypted,'incorrect password'),/incorrect/);
  const tampered=JSON.parse(encrypted);tampered.ciphertext='A'+tampered.ciphertext.slice(1);
  await assert.rejects(decryptBackup(JSON.stringify(tampered),'synthetic password only'));
  await assert.rejects(encryptBackup(s,'short'),/12/);
});
test('journey search matches all terms without altering history',()=>{
  const events=[{type:'symptom',summary:'Tingling in my fingers',at:'2026-09-15'},{type:'fluid',summary:'Water',at:'2026-09-14'}];
  assert.equal(searchJourney(events,'tingling 2026-09-15').length,1);assert.equal(searchJourney(events,'tingling water').length,0);assert.equal(events.length,2);
});
