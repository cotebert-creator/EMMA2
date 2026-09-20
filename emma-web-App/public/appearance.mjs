const KEY='emma-appearance-v1';
export function createAppearance(doc,storage,environment=globalThis){
  let preference='system';
  try{const value=storage.getItem(KEY);if(['day','night'].includes(value))preference=value;}catch{}
  const system=environment.matchMedia?.('(prefers-color-scheme: dark)');
  function render(){
    const night=preference==='night'||(preference==='system'&&system?.matches);
    doc.documentElement?.setAttribute('data-theme',night?'night':'day');
    const button=doc.getElementById('nightToggle');
    if(button){button.textContent=night?'☀ Day':'☾ Night';button.setAttribute?.('aria-label',night?'Switch to day mode':'Switch to night mode');button.setAttribute?.('aria-pressed',String(!!night));}
    doc.querySelector?.('meta[name="theme-color"]')?.setAttribute('content',night?'#0b1428':'#513052');
    return !!night;
  }
  function set(value){preference=value;try{storage.setItem(KEY,value);}catch{}render();}
  const button=doc.getElementById('nightToggle');if(button)button.onclick=()=>set(render()?'day':'night');
  system?.addEventListener?.('change',()=>{if(preference==='system')render();});render();
  return {handle(text){
    const match=text.trim().match(/^(?:Emma[, ]+)?(?:please )?(?:switch to|use|turn on|enable) (night|day) mode[.!]?$/i);
    if(!match)return null;set(match[1].toLowerCase());return match[1].toLowerCase()==='night'?'Of course. A softer, moonlit sky.':'Of course. Back to the daytime sky.';
  }};
}
