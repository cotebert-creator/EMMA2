const norm = s => s.toLowerCase().trim().replace(/[.!?]+$/, '').replace(/^my /,'');
const amountPattern = '(\\d+(?:\\.\\d+)?|one|two|half)\\s*(mg|milligrams?|mcg|micrograms?|ml|milliliters?|tablets?|pills?|capsules?)';
export function medicationTurn(state, text, source, now = Date.now()) {
  state.medications ??= [];
  const clean=text.trim().replace(/[’]/g,"'").replace(/^Emma[,!:.]?\s+/i,'').replace(/[.!]+$/,'');
  const pending=state.medicationPending;
  if(pending && now-pending.at > 120000) state.medicationPending=null;
  const active=state.medicationPending;
  const say = message => ({handled:true,message});
  if(active && /^(?:no|no thanks|cancel|never mind)$/i.test(clean)) {
    state.medicationPending=null;return say('Okay. I haven’t changed that.');
  }
  if(active?.kind==='choice') {
    const index=['first','second','third'].indexOf(clean.toLowerCase().replace(/^the /,'').replace(/ one$/,''));
    if(index>=0 && active.candidates[index]) {
      active.reference=active.candidates[index];active.name=active.reference.name;active.kind='alias';
      return say('Should I remember '+active.name+'? Please confirm against the label.');
    }
    if(/^yes$/i.test(clean))return say('Which name matches the label: first, second or third?');
  }
  if(active && /^(?:it is|it's) spelled /i.test(clean)) {
    const letters=clean.replace(/^(?:it is|it's) spelled /i,'').replace(/[ ,.-]/g,'');
    if(/^[a-z]{2,60}$/i.test(letters)){active.name=letters;active.kind='lookup';active.reference=null;active.at=now;return say('I’ll check that spelling.');}
  }
  if(active && ['lookup','spelling'].includes(active.kind) && /^(yes|confirm)$/i.test(clean))return say('The name has not been matched yet. Please spell it or type the name from the label.');
  if(active?.kind==='alias' && /^(?:yes|yes please|correct|that's right|confirm)$/i.test(clean)) {
    if(!active.reference?.rxcui) {active.kind='lookup';return say('I need to check that name before saving it.');}
    const {alias,name}=active;
    let med=state.medications.find(m=>!m.archivedInto && norm(m.name)===norm(name));
    const correction=state.medications.find(m=>m.id===active.correctionId);
    if(correction && med && correction.id!==med.id){
      med.aliases=[...new Set([...med.aliases,...correction.aliases])];
      correction.archivedInto=med.id;
      correction.history.push({at:new Date(now).toISOString(),action:'spelling correction merged',from:correction.name,to:name,source});
    } else if(correction) {
      med=correction;
      med.history.push({at:new Date(now).toISOString(),action:'spelling corrected',from:med.name,to:name,source});
      med.name=name;
    }
    if(!med){med={id:crypto.randomUUID(),name,aliases:[],createdAt:new Date(now).toISOString(),provenance:'patient_report',history:[]};state.medications.push(med);}
    for(const other of state.medications) {
      if(other.id!==med.id && other.aliases.some(a=>norm(a)===norm(alias))) {
        other.aliases=other.aliases.filter(a=>norm(a)!==norm(alias));
        other.history.push({at:new Date(now).toISOString(),action:'alias reassigned',alias,source});
      }
    }
    if(!med.aliases.some(a=>norm(a)===norm(alias)))med.aliases.push(alias);
    med.history.push({at:new Date(now).toISOString(),action:'alias confirmed',alias,source,original:active.original});
    med.updatedAt=new Date(now).toISOString();state.medicationPending=null;
    med.reference={...active.reference,confirmedAt:med.updatedAt};
    return say('Saved. “'+alias+'” means '+med.name+'.');
  }
  if(active?.kind==='amount') {
    if(/^(?:skip|not sure|i don't know|leave it unknown)$/i.test(clean)) {
      state.medicationPending=null;return say('That’s okay. The amount will stay unknown.');
    }
    const amount=clean.match(new RegExp('^(?:I took )?'+amountPattern+'$','i'));
    if(amount && Number(amount[1])!==0){
      const entry=state.events.find(e=>e.id===active.eventId);
      if(entry){entry.data.actualAmount=amount[1]+' '+amount[2];entry.data.amountSource={text,source,at:new Date(now).toISOString()};}
      state.medicationPending=null;return say('Recorded '+amount[1]+' '+amount[2]+' as the amount you reported taking.');
    }
  }
  const correctionDefinition=clean.match(/^correct (?:the )?spelling of (?:my )?(.+? (?:pill|medicine|medication)) to (.+)$/i);
  const definition=correctionDefinition || clean.match(/^(?:actually,?\s*)?(?:my\s+)?(.+? (?:pill|medicine|medication)) is (?:called )?(.+)$/i);
  if(definition) {
    const alias=definition[1],name=definition[2];
    if(!/^[\p{L}][\p{L} -]{1,60}$/u.test(name) || /\b(?:not|maybe|probably|or|and|blue|white)\b/i.test(name))return say('What is the medication’s name? You can give the amount separately.');
    const correction=correctionDefinition && state.medications.find(m=>!m.archivedInto && m.aliases.some(a=>norm(a)===norm(alias)));
    if(correctionDefinition && !correction)return say('I couldn’t find that medication nickname to correct.');
    state.medicationPending={kind:'lookup',alias,name,at:now,original:text,correctionId:correction?.id};
    const previous=state.medications.find(m=>m.aliases.some(a=>norm(a)===norm(alias)) && norm(m.name)!==norm(name));
    return say('I’ll check the medication name before asking you to confirm.');
  }
  if(/^(?:what|which).*(?:medications|medicines|pills).*(?:know|remember)|^show my medications$/i.test(clean)) {
    state.medicationPending=null;
    return say(state.medications.length ? state.medications.map(m=>m.name+' ('+m.aliases.join(', ')+')').join('; ') : 'I haven’t learned your medication names yet.');
  }
  // Only anchored completed reports are eligible. No bare "take", hypotheticals, negatives or questions.
  const use=clean.match(/^I (?:(?:just|already) )?took (.+)$|^I(?:'ve| have) (?:just |already )?taken (.+)$/i);
  if(use && !/[?]|\b(?:not|no|might|maybe|if|think|usually|yesterday|last|earlier)\b/i.test(clean)) {
    let target=use[1]||use[2],actualAmount=null;
    const amount=target.match(new RegExp('^'+amountPattern+'(?: of)? (.+)$','i'));
    if(amount){actualAmount=amount[1]+' '+amount[2];target=amount[3];}
    if(amount && Number(amount[1])===0) return say('I haven’t recorded a dose. Please check the amount you meant.');
    const matches=state.medications.filter(m=>!m.archivedInto && [m.name,...m.aliases].some(a=>norm(a)===norm(target)));
    if(matches.length!==1) {
      if(matches.length || /\b(?:pill|medicine|medication)\b/i.test(target)) {
        state.medicationPending=null;
        return say('I haven’t recorded a dose. Which medication do you mean? You can say “My nausea pill is ondansetron,” using the name on your label.');
      }
      return say('I haven’t recorded a dose because that medication isn’t in your list yet. Please teach me its name first.');
    }
    const med=matches[0],at=new Date(now).toISOString();
    const entry={id:crypto.randomUUID(),type:'medication',summary:text,source,at,data:{medicationId:med.id,medicationName:med.name,actualAmount,provenance:'patient_report',original:text}};
    state.events.unshift(entry);
    state.medicationPending=actualAmount?null:{kind:'amount',eventId:entry.id,at:now};
    return say(actualAmount?'Recorded your report of taking '+actualAmount+' of '+med.name+'.':'Recorded your report of taking '+med.name+'. How much did you take? You can say “skip.”');
  }
  // A confirmation never applies after a topic change.
  state.medicationPending=null;
  return {handled:false};
}
