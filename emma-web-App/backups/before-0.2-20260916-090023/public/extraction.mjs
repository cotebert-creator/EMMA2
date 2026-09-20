// Conservative prototype rules: uncertain statements stay unrecorded.
// This is not general natural-language understanding or clinical validation.
export function extractPatientText(text) {
  const clean = text.trim().replace(/[’‘]/g, "'");
  const result = { name: null, events: [], loops: [] };
  const name = clean.match(/^(?:my name is|call me)\s+([\p{L}][\p{L}'-]{0,30})(?:[.!]|$)/iu);
  if (name) result.name = name[1];
  const clauses = clean.split(/(?<=[.!?])\s+|\s+(?:but|and)\s+(?=(?:I\b|I'm\b|I've\b|my\b|can you\b|please\b|remember\b))/i);
  for (const raw of clauses) {
    const clause = raw.trim();
    if (!clause) continue;
    const questionForDoctor = /\b(?:ask|tell)\b.*\b(?:doctor|dr\.?|oncologist)\b|\bremember to ask\b/i.test(clause);
    const negated = /\b(?:not|no|never|don't|didn't|haven't|hadn't|wasn't|isn't|can't|won't|without|denies)\b/i.test(clause);
    const uncertain = /\b(?:might|may|maybe|perhaps|could|should|would|if|whether|plan|planning|going to|will|want to|need to|hope to|tomorrow|usually|every day|used to|think|unsure|probably)\b/i.test(clause);
    if (questionForDoctor) {
      if (!negated && /^(?:can you |could you |please |would you )?(?:remember|remind|ask|tell)\b|^I (?:need|want) to ask\b/i.test(clause)) {
        result.loops.push(clause);
      }
      continue;
    }
    if (negated || uncertain || clause.includes('?') || /^(?:can|did|do|have|has|what|when|why|how|is|are)\b/i.test(clause)) continue;
    // Anchored first-person completed action, never bare "take" or another person's dose.
    if (/^I(?:\s+just)?\s+took\b|^I(?:'ve| have)\s+(?:just\s+|already\s+)?taken\b|^I\s+already\s+took\b/i.test(clause)
        && /\b(?:pill|medication|medicine|ondansetron|zofran|tylenol|dexamethasone)\b/i.test(clause)) {
      result.events.push({ type: 'medication', summary: clause, data: {
        status: 'patient-reported use', medicationResolution: 'unverified', doseResolution: 'unverified'
      } });
    }
    if (/^I(?:'ve| have)?\s+(?:just\s+)?(?:drank|drunk|finished)\b/i.test(clause)) {
      const fluid = clause.match(/\b(\d+(?:\.\d+)?)\s*(ml|millilit(?:er|re)s?|lit(?:er|re)s?|l)\b/i);
      if (fluid && /\b(?:water|fluid)\b/i.test(clause)) {
        result.events.push({type: 'fluid', summary: clause, data: {amount: fluid[1], unit: fluid[2]}});
      } else if (/\bbottle of water\b/i.test(clause)) {
        result.events.push({type: 'fluid', summary: clause, data: {amount: null, unit: 'unknown bottle size'}});
      }
    }
    // Symptoms need a first-person assertion. A drug name or doctor question is not one.
    const symptomText = clause.match(/^(?:I (?:am|feel|have|have been|am feeling|am experiencing)|I'm(?: feeling)?|I've (?:been|had)|my)\s+(.+)/i)?.[1];
    if (symptomText && !/\b(?:pill|medication|medicine|tablet|capsule)\b/i.test(symptomText)) {
      const symptom = symptomText.match(/\b(nausea|nauseous|pain|tired|fatigue|exhausted|vomiting|headache|tingling|constipated)\b/i)?.[1];
      if (symptom) result.events.push({type: 'symptom', summary: clause, data: {symptom: symptom.toLowerCase()}});
    }
  }
  return result;
}
