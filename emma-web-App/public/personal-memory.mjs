// Model output is a proposal only. Keep exact patient wording as evidence.
export const memorySchema={type:'object',additionalProperties:false,properties:{
  action:{type:'string',enum:['none','remember']},
  category:{type:'string',enum:['person','routine','comfort','preference']},
  evidence:{type:'string'},certainty:{type:'string',enum:['clear','uncertain']}
},required:['action','category','evidence','certainty']};
export function validMemoryIntent(i){
  return !!i&&typeof i==='object'&&Object.keys(i).length===4&&
    ['none','remember'].includes(i.action)&&['person','routine','comfort','preference'].includes(i.category)&&
    typeof i.evidence==='string'&&i.evidence.length<=600&&['clear','uncertain'].includes(i.certainty);
}
export function proposePersonalMemory(state,intent,text,source,now=Date.now()){
  if(!validMemoryIntent(intent)||intent.action!=='remember'||
    !intent.evidence.trim()||!text.includes(intent.evidence)||state.medicationPending||state.memoryPending)return {handled:false};
  // Clinical records and temporary states must use their dedicated paths.
  if(/[?]|\b(?:maybe|might|perhaps|today|tonight|tomorrow|yesterday|right now|for now|dose|medication|medicine|pill|diagnosis|diagnosed|prescription|symptom|blood pressure|temperature|treatment|chemo|chemotherapy)\b/i.test(intent.evidence))return {handled:false};
  const value=intent.evidence.trim().replace(/[.!]+$/,'');
  if(state.memories.some(m=>m.visibility!=='private'&&m.value.toLowerCase()===value.toLowerCase()))return {handled:true,message:'That’s already remembered.'};
  state.memoryPending={value,category:intent.category,visibility:'companion',source,original:text,at:now,extractor:'personal-memory-v1'};
  if(state.memoryMode==='automatic'&&intent.certainty==='clear'&&!(intent.category==='preference'&&state.memories.some(m=>m.category==='preference'&&m.visibility!=='private'))){
    state.memories.push({id:crypto.randomUUID(),value,category:intent.category,visibility:'companion',source,original:text,provenance:'patient_report',confidence:1,persistence:'until_forgotten',createdAt:new Date(now).toISOString(),capture:'automatic',extractor:'personal-memory-v1'});
    state.memoryPending=null;
    return {handled:true,message:'Got it. I’ll remember that.'};
  }
  return {handled:true,message:'Would you like me to remember: “'+value+'”?'};
}
