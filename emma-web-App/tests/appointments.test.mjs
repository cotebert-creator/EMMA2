import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppointmentCompanion,doctorQuestions} from '../public/appointments.mjs';
import {emptyState,validateState} from '../public/storage.mjs';
const now=new Date(2026,8,16,9);
test('appointment requires confirmation, uses explicit local date and survives serialization',()=>{
  const s=emptyState(),c=createAppointmentCompanion();
  assert.match(c.turn(s,'I have an appointment with Dr. Brown tomorrow at 10 AM.','voice',now).message,/Should I remember/);
  assert.equal(s.appointments.length,0);c.turn(s,'yes','voice',now);
  assert.equal(s.appointments.length,1);assert.equal(new Date(s.appointments[0].startsAt).getDate(),17);assert.equal(new Date(s.appointments[0].startsAt).getHours(),10);
  const restored=validateState(JSON.parse(JSON.stringify(s)));assert.match(createAppointmentCompanion().turn(restored,'When is my next appointment?','voice',now).message,/Dr. Brown/);
});
test('missing time is clarified, not guessed; invalid date is rejected',()=>{
  const s=emptyState(),c=createAppointmentCompanion();
  assert.match(c.turn(s,'I am seeing Dr. Brown','voice',now).message,/date and time/);
  assert.match(c.turn(s,'October 3 at 10 AM','voice',now).message,/Should I remember/);c.turn(s,'cancel','voice',now);assert.equal(s.appointments.length,0);
  c.turn(s,'I have an appointment with Dr. Brown on February 30 at 10 AM','voice',now);c.turn(s,'yes','voice',now);assert.equal(s.appointments.length,0);
});
test('private and handled questions are excluded; duplicate questions are not added twice',()=>{
  const s=emptyState(),c=createAppointmentCompanion();
  c.turn(s,'Add a question for my doctor: Could we discuss my sleep?','voice',now);
  c.turn(s,'Add a question for my doctor: Could we discuss my sleep?','voice',now);
  assert.equal(s.openLoops.length,1);
  assert.match(c.turn(s,'What did I want to discuss with my doctor?','voice',now).message,/sleep/);
  s.openLoops[0].visibility='private';assert.equal(doctorQuestions(s).length,0);
  delete s.openLoops[0].visibility;s.openLoops[0].status='closed';assert.equal(doctorQuestions(s).length,0);
});
test('stale confirmation and topic changes never save a visit',()=>{
  for(const change of ['timeout','topic']){
    const s=emptyState(),c=createAppointmentCompanion();c.turn(s,'I have an appointment with Dr. Brown tomorrow at 10 AM','voice',now);
    if(change==='topic')c.turn(s,'I like music','voice',now);
    c.turn(s,'yes','voice',new Date(now.getTime()+(change==='timeout'?130000:1000)));assert.equal(s.appointments.length,0);
  }
});
test('older records gain appointments without losing memory; malformed appointments blocked',()=>{
  const old=emptyState();delete old.appointments;assert.deepEqual(validateState(old).appointments,[]);
  assert.throws(()=>validateState({...old,appointments:[{id:'a',with:'Dr. Brown',startsAt:'not a date'}]}));
});


const savedVisit=()=>({...emptyState(),appointments:[{id:'a1',with:'Dr. Brown',startsAt:new Date(2026,8,17,10).toISOString(),status:'scheduled'}]});
test('reschedule confirms full weekday date, preserves id and history',()=>{
  const s=savedVisit(),c=createAppointmentCompanion(),before=s.appointments[0].startsAt;
  assert.match(c.turn(s,'My appointment with Dr. Brown moved to Friday at 2 PM.','voice',now).message,/Change your recorded visit/);
  assert.equal(s.appointments[0].startsAt,before);c.turn(s,'yes','voice',now);
  assert.equal(s.appointments.length,1);assert.equal(s.appointments[0].id,'a1');assert.equal(new Date(s.appointments[0].startsAt).getDate(),18);assert.equal(new Date(s.appointments[0].startsAt).getHours(),14);assert.equal(s.appointments[0].history[0].startsAt,before);
});
test('cancellation stays local and is confirmed; cancel aborts proposal',()=>{
  const s=savedVisit(),c=createAppointmentCompanion();c.turn(s,'That appointment was cancelled.','voice',now);c.turn(s,'cancel','voice',now);assert.equal(s.appointments[0].status,'scheduled');
  c.turn(s,'That appointment was cancelled.','voice',now);assert.match(c.turn(s,'yes','voice',now).message,/haven’t contacted/);assert.equal(s.appointments[0].status,'cancelled');assert.equal(s.events[0].type,'appointment_cancelled');
});
test('multiple visits require selection; stale or invalid requests cannot mutate',()=>{
  const s=savedVisit(),c=createAppointmentCompanion();s.appointments.push({...s.appointments[0],id:'a2',startsAt:new Date(2026,8,19,10).toISOString()});
  assert.match(c.turn(s,'My appointment with Dr. Brown moved to Friday at 2 PM','voice',now).message,/Which visit/);
  assert.match(c.turn(s,'second','voice',now).message,/Change your recorded/);s.appointments[1].status='cancelled';c.turn(s,'yes','voice',now);assert.equal(s.appointments[0].history,undefined);assert.equal(s.events.length,0);
});
test('missing AM or PM prompts clarification without assuming time',()=>{
  const s=savedVisit(),c=createAppointmentCompanion();assert.match(c.turn(s,'Move my appointment to Friday at 2','voice',now).message,/new date and time/);
  c.turn(s,'Friday at 2 PM','voice',now);c.turn(s,'yes','voice',now);assert.equal(new Date(s.appointments[0].startsAt).getHours(),14);
});
