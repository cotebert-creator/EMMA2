import {createAppointmentCompanion,upcomingAppointments,appointmentLabel,doctorQuestions} from '../public/appointments.mjs';
import {createCorrections} from '../public/corrections.mjs';
import {createAppearance} from '../public/appearance.mjs';
import test from 'node:test';
import {createVoiceVisuals} from '../public/voice-visuals.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {extractPatientText} from '../public/extraction.mjs';
import {loopKey, activeLoops, mergeDuplicates, closureCandidates} from '../public/loops.mjs';
import {createCreditMeter} from '../public/credits.mjs';
import {resolveMedicationProposal} from '../public/reference-flow.mjs';
import {medicationTurn} from '../public/medications.mjs';
import {medicationContext,applyMedicationIntent} from '../public/medication-actions.mjs';
import {EMMA_PERSONA} from '../public/persona.mjs';
import {companionTurn,contextPacket,isLowEnergy,searchJourney} from '../public/companion.mjs';
import {STORE_KEY,PREVIOUS_KEY,emptyState,loadState,persistState,validateState} from '../public/storage.mjs';
import {encryptBackup,decryptBackup} from '../public/backup.mjs';
const fixtureIntent=(action,evidence,fields={})=>({action,certainty:'clear',assertion:'not_applicable',time:'not_applicable',medicationId:null,name:null,alias:null,candidateIndex:null,quantity:null,unit:null,evidence,quantityEvidence:null,unitEvidence:null,...fields});
async function fakeFetch(url,options){
  if(url==='/api/medication-intent'){
    const input=JSON.parse(options.body);
    const intent=input.text.includes('is ondansetron')||input.text.includes('is called ondansetron') ? fixtureIntent('define',input.text,{name:'ondansetron',alias:'nausea pill'}):fixtureIntent('none','');
    return {ok:true,json:async()=>({intent,id:'fake-'+crypto.randomUUID(),model:'gpt-5.4-mini',usage:{input_tokens:20,output_tokens:20}})};
  }
  return {ok:true,json:async()=>({candidates:[{name:'ondansetron',rxcui:'26225',source:'NLM RxNorm',match:'exact'}]})};
}
const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/^import .*\n/gm, '');
function browser(storage) {
  const elements = new Map();
  const context = vm.createContext({
    createAppointmentCompanion,upcomingAppointments,appointmentLabel,doctorQuestions,createCorrections,createAppearance,createVoiceVisuals,EMMA_PERSONA,companionTurn,contextPacket,isLowEnergy,searchJourney,STORE_KEY,PREVIOUS_KEY,emptyState,loadState,persistState,validateState,encryptBackup,decryptBackup,
    medicationContext,applyMedicationIntent,resolveMedicationProposal, AbortSignal, fetch:fakeFetch, medicationTurn, createCreditMeter, extractPatientText, loopKey, activeLoops, mergeDuplicates, closureCandidates, crypto: webcrypto, structuredClone, console,
    confirm: () => true,
    localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value),removeItem:key=>storage.delete(key)},
    document: {
      getElementById: id => {
        if (!elements.has(id)) elements.set(id, {classList: {add(){},remove(){},toggle(){}}, addEventListener(name, fn){this[name] = fn;}});
        return elements.get(id);
      },
      querySelectorAll: () => []
    }
  });
  vm.runInContext(source, context);
  return {context, elements};
}
test('AI amount flow does not infer units and duplicate delivery is harmless',async()=>{
  const storage=new Map(),{context}=browser(storage);
  vm.runInContext(`state.medications=[{id:'m1',name:'ondansetron',aliases:['nausea pill'],history:[]}];`,context);
  const responses=[
    fixtureIntent('report_taken','I took it',{medicationId:'m1',assertion:'completed',time:'now'}),
    fixtureIntent('amount','two',{quantity:2,quantityEvidence:'two',assertion:'completed'}),
    fixtureIntent('amount','tablets',{unit:'tablet',unitEvidence:'tablets'})
  ];
  context.fetch=async()=>({ok:true,json:async()=>({intent:responses.shift(),id:crypto.randomUUID(),model:'gpt-5.4-mini',usage:null})});
  await vm.runInContext("submitPatientText('I took it','voice','t1')",context);
  await vm.runInContext("submitPatientText('two','voice','t2')",context);
  assert.equal(JSON.parse(storage.get('emma-web-poc-v1')).events[0].data.actualAmount,null);
  await vm.runInContext("submitPatientText('tablets','voice','t3')",context);
  await vm.runInContext("submitPatientText('tablets','voice','t3')",context);
  const saved=JSON.parse(storage.get('emma-web-poc-v1'));
  assert.equal(saved.events.length,1);assert.equal(saved.events[0].data.actualAmount,'2 tablet');assert.equal(responses.length,0);
});
test('late interpretation cannot confirm cancelled proposal',async()=>{
  const {context}=browser(new Map());
  vm.runInContext("state.medicationPending={kind:'alias',at:Date.now(),name:'ondansetron',alias:'nausea pill',reference:{rxcui:'26225'}}",context);
  let release;
  context.fetch=()=>new Promise(r=>release=r);
  const pending=vm.runInContext("submitPatientText('that is the one','voice','late')",context);
  vm.runInContext("processPatientText('cancel','patient action')",context);
  release({ok:true,json:async()=>({intent:fixtureIntent('confirm','that is the one'),id:'late',model:'gpt-5.4-mini'})});
  assert.equal(await pending,null);assert.equal(vm.runInContext('state.medications.length',context),0);
});
test('failed storage never publishes medication confirmation',async()=>{
  const {context}=browser(new Map());
  vm.runInContext("state.medicationPending={kind:'alias',at:Date.now(),name:'ondansetron',alias:'nausea pill',reference:{rxcui:'26225'}}",context);
  context.fetch=async()=>({ok:true,json:async()=>({intent:fixtureIntent('confirm','yes exactly'),id:'r',model:'gpt-5.4-mini'})});
  context.localStorage.setItem=()=>{throw Error('quota');};
  const message=await vm.runInContext("submitPatientText('yes exactly','typed')",context);
  assert.match(message,/couldn’t save/);assert.equal(vm.runInContext('state.medications.length',context),0);
});
test('greeting uses the name once, only after session configuration', async () => {
  const {context} = browser(new Map());
  await vm.runInContext(`(async()=>{
    globalThis.sent = [];
    dc = {readyState: 'open', send: text => sent.push(JSON.parse(text)), close(){}};
    connected = true; greetingPending = true; state.patient.preferredName = 'Susan';
    handleRealtimeEvent({type: 'session.created'});
  })()`, context);
  assert.equal(vm.runInContext('sent.length', context), 0);
  await vm.runInContext(`(async()=>{handleRealtimeEvent({type:'session.updated'}); handleRealtimeEvent({type:'session.updated'});})()`, context);
  assert.equal(vm.runInContext('sent.length', context), 1);
  assert.match(vm.runInContext('sent[0].response.instructions', context), /Hi Susan/);
  assert.equal(vm.runInContext('state.events.length', context), 0);
});
test('voice closure persists and sends updated context before generating response', async () => {
  const storage = new Map();
  const {context} = browser(storage);
  await vm.runInContext(`(async()=>{
    processPatientText('Remember to ask my doctor about tingling.');
    processPatientText('Can you remember to ask my doctor about tingling?');
    globalThis.sent = [];
    dc = {readyState:'open',send: text=>sent.push(JSON.parse(text))}; connected=true;
    await handleRealtimeEvent({type:'conversation.item.input_audio_transcription.completed',transcript:'We talked to the doctor about tingling—that’s handled.'});
  })()`, context);
  const saved = JSON.parse(storage.get('emma-web-poc-v1'));
  assert.equal(saved.openLoops.length,1);
  assert.equal(saved.openLoops[0].status,'closed');
  assert.equal(saved.events[0].type,'open_loop_closed');
  assert.equal(vm.runInContext('sent[0].type',context),'session.update');
  assert.equal(vm.runInContext('sent[1].type',context),'response.create');
  assert.match(vm.runInContext('sent[0].session.instructions',context),/Closed:/);
  const reloaded = browser(storage);
  assert.match(reloaded.elements.get('loops').innerHTML,/Nothing waiting/);
});
test('unknown patient gets a nameless greeting and early speech suppresses welcome', async () => {
  const {context} = browser(new Map());
  await vm.runInContext(`(async()=>{
    globalThis.sent = [];
    dc = {readyState: 'open', send: text => sent.push(JSON.parse(text)), close(){}};
    connected = true; greetingPending = true;
    handleRealtimeEvent({type:'session.updated'});
  })()`, context);
  assert.match(vm.runInContext('sent[0].response.instructions', context), /Hi. I’m Emma/);
  await vm.runInContext(`(async()=>{greetingPending = true; handleRealtimeEvent({type:'input_audio_buffer.speech_started'}); handleRealtimeEvent({type:'session.updated'});})()`, context);
  assert.equal(vm.runInContext('sent.length', context), 1);
  await vm.runInContext(`(async()=>{greetingPending = true; stopRealtime(); handleRealtimeEvent({type:'session.updated'});})()`, context);
  assert.equal(vm.runInContext('sent.length', context), 1);
});
test('real app handlers persist accurate events and loops across reload', async () => {
  const storage = new Map();
  const first = browser(storage);
  await vm.runInContext(`(async()=>{
    await submitPatientText('My nausea pill is ondansetron.','typed');
    processPatientText('yes');
    processPatientText('I might take my nausea pill.', 'voice');
    processPatientText('I just took my nausea pill.', 'voice');
    processPatientText('Can you remember to ask my doctor about tingling?', 'voice');
  })()`, first.context);
  let saved = JSON.parse(storage.get('emma-web-poc-v1'));
  assert.deepEqual(saved.events.map(e => e.type), ['medication']);
  assert.equal(saved.openLoops.length, 1);
  const second = browser(storage);
  assert.match(second.elements.get('loops').innerHTML, /tingling/);
  assert.match(second.elements.get('journey').innerHTML, /Remove entry/);
  second.elements.get('journey').click({target: {closest: () => ({dataset: {removeEvent: saved.events[0].id}})}});
  saved = JSON.parse(storage.get('emma-web-poc-v1'));
  assert.equal(saved.events.length, 0);
  assert.equal(saved.openLoops.length, 1);
});
test('confirmed medication survives reload and amount updates one event',async()=>{
  const storage=new Map();
  const first=browser(storage);
  await vm.runInContext(`(async()=>{await submitPatientText('My nausea pill is ondansetron.','typed');processPatientText('yes');})()`,first.context);
  const second=browser(storage);
  assert.match(second.elements.get('medicationList').innerHTML,/ondansetron/);
  await vm.runInContext(`(async()=>{processPatientText('I just took my nausea pill.');processPatientText('one tablet');})()`,second.context);
  const data=JSON.parse(storage.get('emma-web-poc-v1'));
  assert.equal(data.events.length,1);
  assert.equal(data.events[0].data.medicationName,'ondansetron');
  assert.equal(data.events[0].data.actualAmount,'one tablet');
});
test('voice proposal requests the actual confirmation question before saving',async()=>{
  const {context}=browser(new Map());
  await vm.runInContext(`(async()=>{
    globalThis.sent=[];
    dc={readyState:'open',send:text=>sent.push(JSON.parse(text))}; connected=true;
    await handleRealtimeEvent({type:'conversation.item.input_audio_transcription.completed',transcript:'Emma, my nausea pill is called ondansetron.'});
  })()`,context);
  assert.equal(vm.runInContext('state.medications.length',context),0);
  assert.equal(vm.runInContext('state.medicationPending.kind',context),'alias');
  assert.match(vm.runInContext('sent.find(e=>e.type==="response.create").response.instructions',context),/Did you mean/);
});


test('voice correction saves only after confirmation and refreshes model context',async()=>{
  const storage=new Map(),{context}=browser(storage);
  vm.runInContext("state.memories=[{id:'pref1',category:'preference',value:'I prefer short answers',source:'voice'}];save();globalThis.sent=[];dc={readyState:'open',send:t=>sent.push(JSON.parse(t))};connected=true;",context);
  context.fetch=async()=>{throw Error('Correction should not need external interpretation');};
  await vm.runInContext("submitPatientText('Change my preference about answers to I prefer detailed answers.','voice')",context);
  assert.equal(JSON.parse(storage.get('emma-web-poc-v1')).memories[0].value,'I prefer short answers');
  await vm.runInContext("submitPatientText('yes','voice')",context);
  assert.equal(JSON.parse(storage.get('emma-web-poc-v1')).memories[0].value,'I prefer detailed answers');
  assert.match(vm.runInContext('sent.at(-1).session.instructions',context),/I prefer detailed answers/);
});

test('failed correction save does not publish the changed preference',async()=>{
  const {context}=browser(new Map());
  vm.runInContext("state.memories=[{id:'pref1',category:'preference',value:'I prefer short answers',source:'voice'}];save();",context);
  await vm.runInContext("submitPatientText('Change my preference about answers to I prefer detailed answers.','voice')",context);
  context.localStorage.setItem=()=>{throw Error('quota');};
  await assert.rejects(vm.runInContext("submitPatientText('yes','voice')",context));
  assert.equal(vm.runInContext('state.memories[0].value',context),'I prefer short answers');
});


test('confirmed correction is recalled from storage after ending and reloading, without AI lookup',async()=>{
  const storage=new Map(),first=browser(storage);
  await vm.runInContext("submitPatientText('Change my preference about answers to I prefer detailed answers.','voice')",first.context);
  await vm.runInContext("submitPatientText('Yes.','voice')",first.context);
  vm.runInContext('stopRealtime()',first.context);
  const second=browser(storage);
  second.context.fetch=async()=>{throw Error('Recall should read the local record');};
  const reply=await vm.runInContext("submitPatientText('How do I prefer you to explain things?','voice')",second.context);
  assert.match(reply,/I prefer detailed answers/);
});

test('recall never invents an unsaved preference or exposes a private preference',async()=>{
  const {context}=browser(new Map());
  vm.runInContext("state.memories=[{id:'p',category:'preference',value:'I prefer detailed answers',visibility:'private'}];save()",context);
  context.fetch=async()=>{throw Error('No external lookup');};
  const reply=await vm.runInContext("submitPatientText('How do I prefer you to explain things?','voice')",context);
  assert.match(reply,/don’t have a confirmed/);assert.doesNotMatch(reply,/I prefer detailed/);
});


test('appointment and question persist through actual handlers and reload',async()=>{
  const storage=new Map(),first=browser(storage);
  first.context.fetch=async()=>{throw Error('This preparation flow is local');};
  await vm.runInContext("submitPatientText('I have an appointment with Dr. Brown tomorrow at 10 AM.','voice')",first.context);
  await vm.runInContext("submitPatientText('yes','voice')",first.context);
  await vm.runInContext("submitPatientText('Add a question for my doctor: Could we discuss my sleep?','voice')",first.context);
  const second=browser(storage);second.context.fetch=first.context.fetch;
  const reply=await vm.runInContext("submitPatientText('What did I want to discuss with my doctor?','voice')",second.context);
  assert.match(reply,/Dr. Brown/);assert.match(reply,/sleep/);assert.match(second.elements.get('appointments').innerHTML,/Dr. Brown/);
});
