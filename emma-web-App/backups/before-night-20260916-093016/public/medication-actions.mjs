import {validateIntent,units} from './medication-intent-schema.mjs';
import {medicationTurn} from './medications.mjs';
const folded=s=>s.toLowerCase().replace(/[’]/g,"'").trim();
const quoted=(quote,text)=>typeof quote==='string'&&quote.length>0&&folded(text).includes(folded(quote));
const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,half:.5};
function quantitySupported(i,text){
  if(i.quantity===null)return true;
  if(!quoted(i.quantityEvidence,text)||i.quantity<=0||i.quantity>10000)return false;
  const q=folded(i.quantityEvidence).trim();
  return words[q]===i.quantity || /^\d+(?:\.\d+)?$/.test(q)&&Number(q)===i.quantity;
}
function unitSupported(i,text){
  if(i.unit===null)return true;
  const names={mg:['mg','milligram','milligrams'],mcg:['mcg','microgram','micrograms'],mL:['ml','milliliter','milliliters','millilitre','millilitres'],tablet:['tablet','tablets'],pill:['pill','pills'],capsule:['capsule','capsules']};
  return quoted(i.unitEvidence,text)&&names[i.unit]?.includes(folded(i.unitEvidence));
}
export function medicationContext(state,now=Date.now()){
  const p=state.medicationPending;
  const active=p&&now-p.at<=120000?p:null;
  const e=active?.eventId?state.events.find(e=>e.id===active.eventId):null;
  return {medications:(state.medications||[]).filter(m=>!m.archivedInto).map(({id,name,aliases})=>({id,name,aliases})),pending:active?{kind:active.kind,name:active.name,alias:active.alias,medicationId:e?.data?.medicationId,quantity:active.quantity??null,candidates:active.candidates?.map(c=>({name:c.name}))}:null,hasDeferred:!!state.deferredMedication};
}
export function applyMedicationIntent(state,intent,text,source,now=Date.now()){
  const say=message=>({handled:true,message});
  const unclear=()=>say('I’m not sure I understood. Could you clarify the medication or amount?');
  if(!validateIntent(intent))return say('I couldn’t interpret that reliably. No medication change was saved.');
  const i=intent;
  if(state.medicationPending&&now-state.medicationPending.at>120000)state.medicationPending=null;
  const p=state.medicationPending;
  if(i.action==='none'){state.medicationPending=null;return {handled:false};}
  if(!quoted(i.evidence,text))return unclear();
  if(i.action==='defer'){
    if(p)state.deferredMedication={...structuredClone(p),deferredAt:new Date(now).toISOString()};
    state.medicationPending=null;
    return say('Of course. We can leave this for later.');
  }
  if(i.certainty!=='clear'||i.action==='clarify')return unclear();
  if(i.action==='resume'){
    const d=state.deferredMedication;if(!d)return say('There isn’t a paused medication question. What would you like to go over?');
    state.medicationPending={...structuredClone(d),at:now};state.deferredMedication=null;
    if(d.kind==='amount')return say(d.quantity!==null&&d.quantity!==undefined?'You reported '+d.quantity+'. What unit was that?':'How much did you take? It’s okay to leave the amount unknown.');
    // Recheck references rather than accepting stale candidate selections.
    state.medicationPending.kind='lookup';state.medicationPending.reference=null;
    return say('I’ll recheck that medication name.');
  }
  if(i.action==='reject'){
    state.medicationPending=null;
    if(p?.eventId){const e=state.events.find(e=>e.id===p.eventId);if(e)e.data.needsReview=true;}
    return say('Which medication did you mean?'+(p?.eventId?' I’ve marked the earlier entry for review.':''));
  }
  if(i.action==='list')return say((state.medications||[]).filter(m=>!m.archivedInto).map(m=>m.name).join(', ')||'I haven’t learned your medication names yet.');
  if(i.action==='confirm'){
    if(!p||p.kind!=='alias'||!p.reference?.rxcui||i.assertion==='question'||i.assertion==='negated')return say('There isn’t a medication name ready to confirm.');
    return medicationTurn(state,'yes',source,now);
  }
  if(i.action==='choose'){
    if(p?.kind!=='choice'||!Number.isInteger(i.candidateIndex)||!p.candidates?.[i.candidateIndex])return unclear();
    return medicationTurn(state,['first','second','third'][i.candidateIndex],source,now);
  }
  if(['define','correct_spelling'].includes(i.action)){
    if(!i.name || !/^[\p{L}][\p{L} '-]{1,79}$/u.test(i.name))return say('Please give the medication name from the label.');
    const spelled=/\bspell(?:ed|ing)?\b/i.test(text)&&folded(text).replace(/[^a-z]/g,'').includes(folded(i.name).replace(/[^a-z]/g,''));
    if(!quoted(i.name,text)&&!spelled)return say('Please spell or type the medication name from the label.');
    const alias=i.alias||p?.alias;
    if(!alias||alias.length>100)return say('What do you call this medication?');
    const correction=i.action==='correct_spelling'?(state.medications||[]).find(m=>!m.archivedInto&&m.id===i.medicationId):null;
    if(i.action==='correct_spelling'&&!correction)return say('Which saved medication’s spelling should I correct?');
    state.medicationPending={kind:'lookup',alias,name:i.name,at:now,original:text,correctionId:correction?.id};
    return say('I’ll check that name before you confirm it.');
  }
  if(i.action==='skip_amount'){
    if(p?.kind!=='amount')return unclear();
    state.medicationPending=null;return say('That’s okay. The amount stays unknown.');
  }
  if(!quantitySupported(i,text)||!unitSupported(i,text))return unclear();
  if(i.action==='report_taken'){
    if(i.assertion!=='completed'||i.time!=='now')return say('I haven’t recorded a dose. Please clarify what you took and when.');
    const med=(state.medications||[]).find(m=>!m.archivedInto&&m.id===i.medicationId);
    if(!med)return say('Which medication did you take? I haven’t recorded it yet.');
    const at=new Date(now).toISOString(),amount=i.quantity!==null&&i.unit?i.quantity+' '+i.unit:null;
    const event={id:crypto.randomUUID(),type:'medication',summary:text,source,at,data:{medicationId:med.id,medicationName:med.name,actualAmount:amount,provenance:'patient_report',original:text,interpretation:'structured AI; locally validated'}};
    state.events.unshift(event);
    state.medicationPending=amount?null:{kind:'amount',eventId:event.id,at:now,quantity:i.quantity,quantitySource:i.quantity!==null?{text,source,at}:null};
    return say(amount?'Recorded your report of taking '+amount+' of '+med.name+'.':i.quantity!==null?'Was that '+i.quantity+' tablets, or a different unit?':'Recorded your report of taking '+med.name+'. How much did you take?');
  }
  if(i.action==='amount'){
    if(p?.kind!=='amount'||['planned','negated','question','uncertain'].includes(i.assertion))return unclear();
    const e=state.events.find(e=>e.id===p.eventId);if(!e)return say('That entry is no longer available. Nothing was changed.');
    const quantity=i.quantity??p.quantity;
    if(quantity===null||quantity===undefined)return say('What amount did you take?');
    if(!i.unit){p.quantity=quantity;p.quantitySource={text,source,at:new Date(now).toISOString()};p.at=now;return say('Was that '+quantity+' tablets, or a different unit?');}
    e.data.actualAmount=quantity+' '+i.unit;e.data.amountSource={text,source,at:new Date(now).toISOString(),quantitySource:i.quantity===null?p.quantitySource:null};state.medicationPending=null;
    return say('Recorded '+quantity+' '+i.unit+' as the amount you reported.');
  }
  return unclear();
}
