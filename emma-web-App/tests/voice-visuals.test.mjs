import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceVisuals} from '../public/voice-visuals.mjs';
function setup(reduced=false){
  const properties={},paths=[{setAttribute(k,v){this[k]=v;}}],analysers=[];let callback,closed=0,disconnected=0;
  class Audio{
    resume(){return Promise.resolve();}close(){closed++;return Promise.resolve();}
    createAnalyser(){const a={sample:128,getByteTimeDomainData(b){b.fill(this.sample);},disconnect(){disconnected++;}};analysers.push(a);return a;}
    createMediaStreamSource(){return {connect(){},disconnect(){disconnected++;}};}
  }
  const env={AudioContext:Audio,matchMedia:()=>({matches:reduced}),requestAnimationFrame:fn=>{callback=fn;return 1;},cancelAnimationFrame(){callback=null;}};
  const doc={body:{classList:{toggle(){},remove(){}}},getElementById:id=>id==='talkBtn'?{style:{setProperty:(k,v)=>properties[k]=v}}:{querySelectorAll:()=>paths}};
  return {visuals:createVoiceVisuals(doc,env),properties,paths,analysers,tick(){callback?.(1000);},closed:()=>closed,disconnected:()=>disconnected};
}
test('patient and Emma audio drive different visual elements; mute and stop release them',()=>{
  const s=setup();s.visuals.input({});s.visuals.output({});s.analysers[0].sample=160;s.tick();
  assert.equal(s.properties['--voice-scale'],'1.000');const patientWave=s.paths[0].d;
  s.analysers[0].sample=128;s.analysers[1].sample=160;s.tick();assert.ok(Number(s.properties['--voice-scale'])>1);
  s.visuals.mute(true);for(let i=0;i<30;i++)s.tick();assert.notEqual(s.paths[0].d,patientWave);
  s.visuals.stop();assert.equal(s.properties['--voice-scale'],'1');assert.equal(s.closed(),1);assert.equal(s.disconnected(),4);
});
test('reduced-motion preference disables orb scaling even with audio',()=>{
  const s=setup(true);s.visuals.output({});s.analysers[0].sample=180;s.tick();assert.equal(s.properties['--voice-scale'],'1');s.visuals.stop();
});
