export const STORE_KEY = 'emma-web-poc-v1';
export const PREVIOUS_KEY = STORE_KEY + '-previous';
export function emptyState() {
  return {schemaVersion:2,patient:{preferredName:'',fullName:''},medications:[],medicationPending:null,memoryPending:null,
    memories:[],events:[],openLoops:[],debug:[],lastUpdated:null};
}
export function validateState(input) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw Error('Invalid patient record');
  if (input.schemaVersion && input.schemaVersion>2) throw Error('This backup needs a newer Emma version');
  for (const key of ['memories','events','openLoops','medications']) {
    if (!Array.isArray(input[key])) throw Error('Missing '+key);
    if (input[key].some(x=>!x || typeof x!=='object' || typeof x.id!=='string')) throw Error('Invalid '+key);
  }
  if (!input.patient || typeof input.patient.preferredName!=='string') throw Error('Invalid patient profile');
  for(const m of input.memories) if(typeof m.value!=='string'||typeof m.category!=='string') throw Error('Invalid memory');
  for(const m of input.medications) if(typeof m.name!=='string'||!Array.isArray(m.aliases)||m.aliases.some(a=>typeof a!=='string')) throw Error('Invalid medication');
  for(const e of input.events) if(typeof e.summary!=='string'||typeof e.type!=='string'||!Number.isFinite(Date.parse(e.at))) throw Error('Invalid event');
  for(const l of input.openLoops) if(typeof l.text!=='string') throw Error('Invalid open loop');
  return {...emptyState(),...input,schemaVersion:2,debug:[]};
}
export function loadState(storage) {
  try {
    const raw=storage.getItem(STORE_KEY);
    return {state:raw===null||raw===undefined?emptyState():validateState(JSON.parse(raw)),error:null};
  } catch {
    return {state:emptyState(),error:'Emma couldn’t read the saved data. It has been left untouched. Restore a backup or the previous saved version below.'};
  }
}
export function persistState(storage,state,{allowRecovery=false}={}) {
  const clean=validateState(state);
  const current=storage.getItem(STORE_KEY);
  if(current){
    let valid=false;
    try{validateState(JSON.parse(current));valid=true;}catch{}
    if(!valid&&!allowRecovery)throw Error('Existing data is unreadable; refusing to replace it');
    // Only a valid old record may replace the recovery copy.
    if(valid)storage.setItem(PREVIOUS_KEY,JSON.stringify(validateState(JSON.parse(current))));
  }
  storage.setItem(STORE_KEY,JSON.stringify(clean));
  return clean;
}
