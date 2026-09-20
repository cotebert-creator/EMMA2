import {activeLoops,loopKey} from './loops.mjs';
export function upcomingAppointments(state,now=new Date()){
  const today=now.getTime();
  return (state.appointments||[]).filter(a=>a.status!=='cancelled'&&new Date(a.startsAt).getTime()>=today).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
}
export function appointmentLabel(a){return a.with+' on '+new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(a.startsAt));}
export function doctorQuestions(state){return activeLoops(state.openLoops).filter(l=>l.visibility!=='private'&&(/\b(?:doctor|dr\.?|oncologist|appointment)\b/i.test(l.text)||l.kind==='appointment_question'));}
function parseWhen(text,now){
  const match=text.match(/^(?:on )?(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|[A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?) at (\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)$/i);
  if(!match)return null;
  let year=now.getFullYear(),month=now.getMonth(),day=now.getDate();
  const weekday=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(match[1].toLowerCase());
  if(weekday>=0){const next=new Date(year,month,day+(weekday-now.getDay()+7)%7);year=next.getFullYear();month=next.getMonth();day=next.getDate();}
  else if(match[1].toLowerCase()==='tomorrow'){const next=new Date(year,month,day+1);year=next.getFullYear();month=next.getMonth();day=next.getDate();}
  else if(match[1].toLowerCase()!=='today'){
    const date=match[1].match(/^([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/i);
    month=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(date[1].toLowerCase());
    if(month<0)return null;day=Number(date[2]);if(date[3])year=Number(date[3]);
  }
  const hour=Number(match[2]),minute=Number(match[3]||0);if(hour<1||hour>12||minute>59)return null;
  const result=new Date(year,month,day,hour%12+(/^p/i.test(match[4])?12:0),minute);
  if(result.getFullYear()!==year||result.getMonth()!==month||result.getDate()!==day||result.getTime()<now.getTime())return null;
  return result.toISOString();
}
export function createAppointmentCompanion(){
  let pending=null;
  const fingerprint=a=>JSON.stringify([a.with,a.startsAt,a.status]);
  function proposeChange(a){
    pending.id=a.id;pending.before=fingerprint(a);pending.with=a.with;
    if(pending.action==='move'&&!pending.startsAt){pending.stage='changeDate';return 'What is the new date and time? Please include AM or PM.';}
    pending.stage='confirm';
    return pending.action==='cancel'?'Mark your recorded visit with '+appointmentLabel(a)+' as cancelled? This only updates Emma’s record; it does not contact the clinic.':'Change your recorded visit from '+appointmentLabel(a)+' to '+appointmentLabel(pending)+'? The new time is in this device’s local time zone.';
  }
  return {clear(){pending=null;},turn(state,text,source='typed',now=new Date()){
    const clean=text.trim().replace(/[’]/g,"'").replace(/^Emma[, ]+/i,'').replace(/[.!]+$/,'');
    const reply=message=>({handled:true,message});
    if(pending&&now.getTime()-pending.at>120000){pending=null;if(/^(yes|correct|that's right)$/i.test(clean))return reply('That appointment confirmation expired. Please tell me the appointment again.');}
    if(pending&&/^(no|cancel|never mind|not now)$/i.test(clean)){pending=null;return reply('Of course. Nothing changed.');}
    if(pending?.stage==='confirm'&&/^(yes|yes please|correct|that's right|save it|go ahead)$/i.test(clean)){
      const p=pending;pending=null;state.appointments ||= [];
      if(p.action){
        const a=state.appointments.find(a=>a.id===p.id);
        if(!a||fingerprint(a)!==p.before)return reply('That visit has changed since we started. Please tell me which appointment to update again.');
        if(p.action==='move'&&state.appointments.some(other=>other.id!==a.id&&other.status!=='cancelled'&&other.with.toLowerCase()===a.with.toLowerCase()&&other.startsAt===p.startsAt))return reply('There is already a visit with that person at that time. Nothing changed; please review the two records.');
        const at=now.toISOString();
        a.history=[...(a.history||[]),{startsAt:a.startsAt,status:a.status,at,source,report:p.original}];
        if(p.action==='cancel')a.status='cancelled';else a.startsAt=p.startsAt;
        a.updatedAt=at;a.lastChange={source,original:p.original,confirmedAt:at,provenance:'patient_report'};
        state.events.unshift({id:crypto.randomUUID(),type:p.action==='cancel'?'appointment_cancelled':'appointment_rescheduled',summary:appointmentLabel(a),source,at,data:{appointmentId:a.id,provenance:'patient_report',previousStartsAt:a.history.at(-1).startsAt}});
        return reply(p.action==='cancel'?'Your visit is marked as cancelled in Emma. I haven’t contacted the clinic.':'Updated in Emma: '+appointmentLabel(a)+'. I haven’t changed anything with the clinic.');
      }
      if(state.appointments.some(a=>a.status!=='cancelled'&&a.with.toLowerCase()===p.with.toLowerCase()&&a.startsAt===p.startsAt))return reply('That appointment is already saved.');
      const at=now.toISOString(),appointment={id:crypto.randomUUID(),with:p.with,startsAt:p.startsAt,status:'scheduled',source:p.source,original:p.original,provenance:'patient_report',confirmedAt:at,createdAt:at,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
      state.appointments.push(appointment);state.events.unshift({id:crypto.randomUUID(),type:'appointment_added',summary:appointmentLabel(appointment),source,at,data:{appointmentId:appointment.id,provenance:'patient_report'}});
      return reply('Saved: '+appointmentLabel(appointment)+'. This records the visit here; it doesn’t book it or set a notification.');
    }
    if(pending?.stage==='selectChange'){
      const pick=clean.match(/^(?:the )?(first|second|third|\d+)(?: one)?$/i);
      const index=pick?({first:0,second:1,third:2}[pick[1].toLowerCase()]??Number(pick[1])-1):-1;
      const a=(state.appointments||[]).find(a=>a.id===pending.ids[index]&&a.status!=='cancelled');
      if(!a){pending=null;return reply('I couldn’t identify the visit. Nothing changed. Please start again with the doctor’s name.');}
      return reply(proposeChange(a));
    }
    if(pending?.stage==='changeDate'){
      pending.startsAt=parseWhen(clean,now);
      if(!pending.startsAt){pending=null;return reply('I couldn’t confirm that new date and time. Nothing changed. Please use a month and day or weekday, followed by a time and AM or PM.');}
      pending.original+='\nNew time: '+text;
      const a=(state.appointments||[]).find(a=>a.id===pending.id);
      if(!a||fingerprint(a)!==pending.before){pending=null;return reply('That appointment changed. Please start again.');}
      return reply(proposeChange(a));
    }
    const move=clean.match(/^(?:my|the|that) appointment(?: with (.+?))? (?:has |was )?(?:moved|rescheduled|changed) to (.+)$/i)||clean.match(/^(?:please )?(?:move|reschedule|change) (?:my|the|that) appointment(?: with (.+?))? to (.+)$/i);
    const cancel=clean.match(/^(?:my|the|that) appointment(?: with (.+?))? (?:was|is|has been) cancel(?:led|ed)$/i)||clean.match(/^(?:please )?cancel (?:my|the|that) appointment(?: with (.+))?$/i);
    if(move||cancel){
      if(state.memoryPending||state.medicationPending){pending=null;return reply('Please finish or cancel the current confirmation first.');}
      const name=(move||cancel)[1];const normalize=s=>s.toLowerCase().replace(/\bdoctor\b/g,'dr').replace(/[^a-z0-9]/g,'');
      const matches=upcomingAppointments(state,now).filter(a=>!name||normalize(a.with)===normalize(name));
      if(!matches.length){pending=null;return reply('I couldn’t find an upcoming recorded visit with that name. Nothing changed.');}
      pending={action:move?'move':'cancel',at:now.getTime(),source,original:text,startsAt:move?parseWhen(move[2],now):null};
      if(matches.length===1)return reply(proposeChange(matches[0]));
      pending.stage='selectChange';pending.ids=matches.map(a=>a.id);
      return reply('Which visit do you mean? '+matches.map((a,i)=>(i+1)+': '+appointmentLabel(a)).join('. ')+'. Say its number.');
    }
    const start=clean.match(/^(?:I have (?:an? )?appointment with|(?:please )?(?:remember|add|save) (?:my |an? )?appointment with|I(?:'m| am) seeing) (.+?)(?: (on .+|today.+|tomorrow.+))?$/i);
    if(start){
      if(state.memoryPending||state.medicationPending)return reply('Please finish or cancel the current confirmation first.');
      pending={with:start[1],stage:'date',source,original:text,at:now.getTime()};
      if(start[2])pending.startsAt=parseWhen(start[2],now);
      if(!pending.startsAt)return reply('What date and time is the visit? For example, “October 3 at 10 AM.”');
    }else if(pending?.stage==='date'){
      pending.startsAt=parseWhen(clean,now);
      if(!pending.startsAt){pending=null;return reply('I couldn’t confirm the date and time. Nothing was saved. Please try the appointment again with a month, day, time, and AM or PM.');}
      pending.original+='\nDate/time clarification: '+text;
    }else{
      pending=null;
      if(/^(?:when is|what is|what's) my next appointment\??$/i.test(clean)){
        const next=upcomingAppointments(state,now)[0];return reply(next?'Your next recorded visit is '+appointmentLabel(next)+'.':'I don’t have an upcoming appointment saved here yet.');
      }
      if(/^(?:what did I want to (?:discuss with|ask) (?:my |the )?doctor|(?:help me )?prepare for (?:my |the )?(?:next )?appointment|what (?:are my questions|should I ask my doctor))\??$/i.test(clean)){
        const next=upcomingAppointments(state,now)[0],questions=doctorQuestions(state);
        const low=state.interaction?.mode==='low'&&state.interaction.expiresAt>now.getTime(),limit=low?1:3;
        return reply((next?'Your next recorded visit is '+appointmentLabel(next)+'. ':'')+(questions.length?'Your open questions for the care team are: '+questions.slice(0,limit).map(q=>q.text).join(' ')+(questions.length>limit?' There are '+(questions.length-limit)+' more in your list.':''):'You haven’t saved any open questions for your care team yet.'));
      }
      const question=clean.match(/^(?:please )?(?:add|save) (?:a |this )?question for (?:my |the )?(?:doctor|appointment)[: ,]+(.+)$/i);
      if(question){
        if(!activeLoops(state.openLoops).some(q=>loopKey(q.text)===loopKey(question[1])))state.openLoops.unshift({id:crypto.randomUUID(),kind:'appointment_question',text:question[1],status:'open',source,original:text,provenance:'patient_report',createdAt:now.toISOString()});
        return reply('Got it. That’s on your care-team question list.');
      }
      return {handled:false};
    }
    pending.stage='confirm';return reply('Should I remember your appointment with '+appointmentLabel(pending)+'? The time is in this device’s local time zone.');
  }};
}
