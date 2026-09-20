// Independent analysers: microphone never connects to speakers (no feedback).
export function createVoiceVisuals(doc, environment=globalThis){
  let context, frame, input, output, muted=false, active=false, emma=0, patient=0;
  const orb=doc.getElementById('talkBtn'),wave=doc.getElementById('patientWave');
  const reduced=environment.matchMedia?.('(prefers-reduced-motion: reduce)');
  function detach(node){try{node?.source.disconnect();node?.analyser.disconnect();}catch{}}
  function attach(stream,kind){
    try{
      const Audio=environment.AudioContext||environment.webkitAudioContext;
      if(!Audio)return;
      context ||= new Audio();context.resume().catch(()=>{});
      const analyser=context.createAnalyser();analyser.fftSize=256;
      const source=context.createMediaStreamSource(stream);source.connect(analyser);
      const node={source,analyser,buffer:new Uint8Array(256)};
      if(kind==='input'){detach(input);input=node;}else{detach(output);output=node;}
      if(!frame)frame=environment.requestAnimationFrame(draw);
    }catch{/* Visual support must never prevent a conversation. */}
  }
  function level(node){
    if(!node)return 0;node.analyser.getByteTimeDomainData(node.buffer);
    let sum=0;for(const sample of node.buffer)sum+=((sample-128)/128)**2;
    return Math.min(1,Math.max(0,Math.sqrt(sum/node.buffer.length)-.008)*5);
  }
  function draw(time){
    frame=null;
    emma=emma*.75+level(output)*.25;
    patient=patient*.65+(muted?0:level(input))*.35;
    orb?.style?.setProperty('--emma-level',emma.toFixed(3));
    orb?.style?.setProperty('--voice-scale',reduced?.matches?'1':(1+emma*.13).toFixed(3));
    const paths=wave?.querySelectorAll?.('path')||[];
    paths.forEach((path,i)=>{
      let d='';
      for(let x=0;x<=600;x+=5){
        const envelope=Math.sin(Math.PI*x/600)**2;
        const phase=reduced?.matches?0:time/700;
        const y=50+envelope*(2+patient*34)*Math.sin(x/37-phase+i*.65)*Math.cos(x/91+i);
        d+=(x?' L':'M')+x+','+y.toFixed(2);
      }
      path.setAttribute('d',d);
    });
    if(active||input||output)frame=environment.requestAnimationFrame(draw);
  }
  return {
    prepare(){try{const Audio=environment.AudioContext||environment.webkitAudioContext;if(Audio){context ||=new Audio();context.resume().catch(()=>{});}}catch{}},
    input(stream){attach(stream,'input');},output(stream){attach(stream,'output');},
    mute(value){muted=value;},
    active(value){active=value;doc.body?.classList.toggle('voice-connected',value);},
    stop(){active=false;muted=false;detach(input);detach(output);input=output=null;
      if(frame)environment.cancelAnimationFrame(frame);frame=null;emma=patient=0;
      orb?.style?.setProperty('--voice-scale','1');orb?.style?.setProperty('--emma-level','0');
      wave?.querySelectorAll?.('path').forEach(p=>p.setAttribute('d','M0,50 Q150,46 300,50 T600,50'));
      doc.body?.classList.remove('voice-connected');
      if(context){context.close().catch(()=>{});context=null;}
    }
  };
}
