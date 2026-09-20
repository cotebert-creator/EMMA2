export const actions=['none','confirm','reject','defer','resume','choose','define','correct_spelling','report_taken','amount','skip_amount','list','clarify'];
export const units=['mg','mcg','mL','tablet','pill','capsule'];
export const schema={type:'object',additionalProperties:false,properties:{
  action:{type:'string',enum:actions},certainty:{type:'string',enum:['clear','uncertain']},
  assertion:{type:'string',enum:['completed','planned','negated','question','uncertain','not_applicable']},
  time:{type:'string',enum:['now','past','unknown','not_applicable']},
  medicationId:{type:['string','null']},name:{type:['string','null']},alias:{type:['string','null']},
  candidateIndex:{type:['integer','null']},quantity:{type:['number','null']},
  unit:{type:['string','null'],enum:[...units,null]},evidence:{type:'string'},
  quantityEvidence:{type:['string','null']},unitEvidence:{type:['string','null']}
},required:['action','certainty','assertion','time','medicationId','name','alias','candidateIndex','quantity','unit','evidence','quantityEvidence','unitEvidence']};
export function validateIntent(i){
  if(!i || typeof i!=='object' || Object.keys(i).some(k=>!schema.required.includes(k)) || schema.required.some(k=>!(k in i)))return false;
  for(const [k,s] of Object.entries(schema.properties)){
    const value=i[k];if(value===null){if(!Array.isArray(s.type)||!s.type.includes('null'))return false;continue;}
    const type=Array.isArray(s.type)?s.type[0]:s.type;
    if(type==='integer'?!Number.isInteger(value):typeof value!==type)return false;
    if(s.enum&&!s.enum.includes(value))return false;
    if(typeof value==='number'&&!Number.isFinite(value))return false;
    if(typeof value==='string'&&value.length>1200)return false;
  }
  return true;
}
