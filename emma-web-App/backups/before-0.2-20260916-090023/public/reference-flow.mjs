export async function resolveMedicationProposal(state, lookup) {
  const pending=state.medicationPending;
  if(pending?.kind!=='lookup') return null;
  try {
    const candidates=await lookup(pending.name);
    if(state.medicationPending!==pending)return null;
    pending.at=Date.now();
    if(!candidates.length){pending.kind='spelling';return 'I couldn’t find a name-only match. Please type the name from the label, or say “It is spelled” followed by the letters. Nothing has been saved.';}
    pending.candidates=candidates;
    if(candidates.length===1){
      pending.kind='alias';pending.reference=candidates[0];pending.name=candidates[0].name;
      return (pending.correctionId?'Should I correct the spelling to ':'Did you mean ')+pending.name+'? Please confirm against your label.';
    }
    pending.kind='choice';
    return 'I found a few possible names: '+candidates.map((x,i)=>(i+1)+', '+x.name).join('; ')+'. Which matches the label? You can say first, second or third.';
  }catch{
    if(state.medicationPending!==pending)return null;
    pending.kind='spelling';
    return 'The medication reference is unavailable. Nothing has been saved. Please try again later with the name from the label.';
  }
}
