import test from 'node:test';
import assert from 'node:assert/strict';
import {applyMedicationIntent as apply,medicationContext} from '../public/medication-actions.mjs';
import {interpretMedication,minimizeInput} from '../medication-interpreter.mjs';
import {validateIntent} from '../public/medication-intent-schema.mjs';
export const intent=(action,evidence,fields={})=>({action,certainty:'clear',assertion:'not_applicable',time:'not_applicable',medicationId:null,name:null,alias:null,candidateIndex:null,quantity:null,unit:null,evidence,quantityEvidence:null,unitEvidence:null,...fields});
const fresh=()=>({medications:[{id:'m1',name:'ondansetron',aliases:['nausea pill'],history:[]}],events:[]});
test('natural agreement uses current verified proposal only',()=>{
  const s=fresh();assert.match(apply(s,intent('confirm',"that's the one"),"that's the one",'voice',10).message,/isn’t/);
  s.medicationPending={kind:'alias',alias:'nausea pill',name:'ondansetron',at:10,reference:{rxcui:'26225'}};
  apply(s,intent('confirm',"that's the one"),"that's the one",'voice',11);
  assert.equal(s.medicationPending,null);assert.equal(s.medications[0].reference.rxcui,'26225');
});
test('two does not imply tablets; later units update same event',()=>{
  const s=fresh();apply(s,intent('report_taken','I took my nausea pill',{assertion:'completed',time:'now',medicationId:'m1'}),'I took my nausea pill','voice',10);
  apply(s,intent('amount','I took two',{quantity:2,quantityEvidence:'two',assertion:'completed'}),'I took two','voice',11);
  assert.equal(s.events[0].data.actualAmount,null);assert.equal(s.medicationPending.quantity,2);
  apply(s,intent('amount','tablets',{unit:'tablet',unitEvidence:'tablets'}),'tablets','voice',12);
  assert.equal(s.events.length,1);assert.equal(s.events[0].data.actualAmount,'2 tablet');
});
test('hallucinated amount or unit blocked',()=>{
  const s=fresh();apply(s,intent('report_taken','I took two',{medicationId:'m1',assertion:'completed',time:'now',quantity:2,quantityEvidence:'two',unit:'tablet',unitEvidence:'tablets'}),'I took two','voice',10);
  assert.equal(s.events.length,0);
});
test('plans, questions, wrong ids and stale yes never record',()=>{
  for(const assertion of ['planned','question','negated','uncertain']){const s=fresh();apply(s,intent('report_taken','my pill',{medicationId:'m1',assertion,time:'now'}),'my pill','voice',10);assert.equal(s.events.length,0);}
  const s=fresh();apply(s,intent('report_taken','I took it',{medicationId:'not-present',assertion:'completed',time:'now'}),'I took it','voice',10);assert.equal(s.events.length,0);
  s.medicationPending={kind:'alias',alias:'nausea pill',name:'ondansetron',at:0,reference:{rxcui:'26225'}};
  apply(s,intent('confirm','yes'),'yes','voice',130000);assert.equal(s.medications[0].reference,undefined);
});
test('pause persists unknown amount and resume is explicit',()=>{
  const s=fresh();apply(s,intent('report_taken','I took it',{medicationId:'m1',assertion:'completed',time:'now'}),'I took it','voice',10);
  apply(s,intent('defer',"I'm too tired"),"I'm too tired, let's do this later",'voice',11);
  assert.equal(s.medicationPending,null);assert.ok(s.deferredMedication);assert.equal(s.events[0].data.actualAmount,null);
  const restored=JSON.parse(JSON.stringify(s));apply(restored,intent('resume','continue'),'continue','voice',200000);
  assert.equal(restored.medicationPending.kind,'amount');assert.equal(restored.deferredMedication,null);
});
test('other pill rejects proposal without guessing a replacement',()=>{
  const s=fresh();s.medicationPending={kind:'alias',name:'ondansetron',alias:'nausea pill',at:10};
  apply(s,intent('reject','No, I meant the other pill'),'No, I meant the other pill','voice',11);assert.equal(s.medicationPending,null);assert.equal(s.medications.length,1);
});
test('context excludes private records and old conversation',()=>{
  const s=fresh();s.patient={name:'secret'};s.memories=['secret'];s.events=[{id:'e',summary:'secret',data:{medicationId:'m1'}}];s.medicationPending={kind:'amount',eventId:'e',at:10};
  const context=medicationContext(s,11);assert.ok(!JSON.stringify(context).includes('secret'));
  assert.equal(context.pending.medicationId,'m1');
  const clean=minimizeInput({text:'two',...context,patient:{name:'secret'},history:['secret']});assert.ok(!JSON.stringify(clean).includes('secret'));
});
test('API request uses strict schema, no stored response and returns measured usage',async()=>{
  let request;
  const expected=intent('amount','two',{quantity:2,quantityEvidence:'two'});
  const fake={responses:{create:async r=>{request=r;return {status:'completed',output_text:JSON.stringify(expected),usage:{input_tokens:20,output_tokens:10},id:'r1'};}}};
  const result=await interpretMedication(fake,{text:'two',pending:{kind:'amount'},medications:[]});
  assert.equal(request.store,false);assert.equal(request.text.format.strict,true);assert.deepEqual(result.intent,expected);assert.equal(result.usage.output_tokens,10);
});
test('refusal, incomplete and malformed output never become actions',async()=>{
  for(const response of [{status:'incomplete',output_text:'{}'},{status:'completed',output_text:'not json'},{status:'completed',output_text:JSON.stringify({...intent('confirm','yes'),evil:true})}]){
    const result=await interpretMedication({responses:{create:async()=>response}},{text:'yes'});assert.equal(result.intent,null);
  }
  assert.equal(validateIntent({action:'confirm'}),false);
});
