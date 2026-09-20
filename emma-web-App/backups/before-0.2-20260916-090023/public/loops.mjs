export function loopKey(text) {
  return text.toLowerCase().replace(/[’]/g, "'")
    .replace(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:remember to |remind me to )?/, '')
    .replace(/^(?:i need to |i want to )/, '')
    .replace(/\bmy doctor\b/g, 'doctor').replace(/[?.!]+$/g, '').trim();
}
export function activeLoops(loops) { return loops.filter(x => x.status !== 'closed' && x.mergedInto === undefined); }
export function mergeDuplicates(loops) {
  const seen = new Map();
  for (const loop of activeLoops(loops)) {
    const key = loopKey(loop.text);
    if (seen.has(key)) loop.mergedInto = seen.get(key).id;
    else seen.set(key, loop);
  }
}
export function closureCandidates(text, loops) {
  const clean = text.toLowerCase().replace(/[’]/g, "'");
  if (/\b(?:not|never|didn't|don't|haven't|might|maybe|if|could|will)\b/.test(clean) || clean.includes('?')) return null;
  const match = clean.match(/^(?:we|i) (?:talked|spoke) to (?:my |the )?doctor about (.+?)[—–,.;-]*\s*(?:that(?:'s| is)|it(?:'s| is)) (?:handled|done|resolved)[.!]*$/)
    || clean.match(/^(?:close|resolve|mark as done) (?:the )?(?:question|loop|item) about (.+?)[.!]*$/);
  if (!match) return null;
  const topic = match[1].replace(/[—–,.;-]+$/g, '').trim();
  const candidates = activeLoops(loops).filter(x => {
    const recorded = loopKey(x.text).split(/\babout\s+/)[1];
    return recorded && (recorded === topic || recorded.startsWith(topic + ' '));
  });
  return candidates;
}
