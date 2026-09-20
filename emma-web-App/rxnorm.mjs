// Only a medication-name search term leaves this server. Never send patient context.
export function closeSpelling(a,b) {
  a=a.toLowerCase().replace(/[^a-z]/g,'');b=b.toLowerCase().replace(/[^a-z]/g,'');
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
  return a.length>=4 && row[b.length]<=Math.min(3,Math.floor(Math.max(a.length,b.length)*.3));
}
export async function lookupMedication(term, fetcher=fetch) {
  if(typeof term!=='string' || !/^[\p{L}][\p{L} '-]{1,79}$/u.test(term)) throw Error('Enter only the medication name.');
  async function get(path) {
    const response=await fetcher('https://rxnav.nlm.nih.gov/REST/'+path,{signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Reference unavailable');
    return response.json();
  }
  const exact=await get('rxcui.json?allsrc=0&search=0&name='+encodeURIComponent(term));
  let ids=exact.idGroup?.rxnormId || [],match='exact';
  if(!ids.length){
    match='suggestion';
    const approx=await get('approximateTerm.json?option=1&maxEntries=5&term='+encodeURIComponent(term));
    ids=[...new Set((approx.approximateGroup?.candidate||[]).map(x=>x.rxcui))];
  }
  const results=await Promise.all(ids.slice(0,5).filter(id=>/^\d+$/.test(id)).map(async id=>{
    const {properties:p}=await get('rxcui/'+id+'/properties.json');
    // Name lookup only: no selecting a strength or dosage form from a fuzzy match.
    return p && ['IN','PIN','MIN','BN'].includes(p.tty) ? {name:p.name,rxcui:p.rxcui,source:'NLM RxNorm',match,checkedAt:new Date().toISOString()} : null;
  }));
  return results.filter(x=>x && (match==='exact' || closeSpelling(term,x.name))).slice(0,3);
}
