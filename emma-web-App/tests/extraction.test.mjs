import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPatientText as extract} from '../public/extraction.mjs';

for (const text of [
  'I might take my nausea pill.', 'Should I take my nausea pill?',
  "I didn't take my nausea pill.", "I haven't taken my nausea pill.",
  'I will take my nausea pill tomorrow.', 'I usually take my nausea pill.',
  'My husband took his nausea pill.', 'If I took my nausea pill, would it help?',
  'I think I took my nausea pill.', 'I took no medication.',
  'I have no nausea.', 'Do I have nausea?', 'I might have nausea.',
  'My nausea pill is blue.', 'I am Susan.',
]) test(`no asserted event: ${text}`, () => assert.deepEqual(extract(text).events, []));

for (const text of ['I just took my nausea pill.', "I've just taken my nausea pill.", 'I took ondansetron.']) {
  test(`completed medication only: ${text}`, () => {
    const result = extract(text);
    assert.deepEqual(result.events.map(e => e.type), ['medication']);
    assert.equal(result.events[0].data.medicationResolution, 'unverified');
  });
}
test('doctor question is an open loop, not a symptom', () => {
  const result = extract('Can you remember to ask my doctor about tingling?');
  assert.equal(result.loops.length, 1);
  assert.deepEqual(result.events, []);
});
test('negative reminder request is not saved', () => assert.equal(extract("Don't remind me to ask my doctor about tingling.").loops.length, 0));
for (const text of ['I have nausea.', 'My nausea is awful today.', "I'm exhausted.", "I've been nauseous today."]) {
  test(`explicit symptom: ${text}`, () => assert.deepEqual(extract(text).events.map(e => e.type), ['symptom']));
}
test('separate completed medication and explicit symptom', () => {
  assert.deepEqual(extract('I took my nausea pill and I have tingling.').events.map(e => e.type), ['medication', 'symptom']);
});
test('uncertain dose does not suppress a separate symptom assertion', () => {
  assert.deepEqual(extract('I might take my nausea pill. I have nausea.').events.map(e => e.type), ['symptom']);
});
test('completed fluid intake', () => assert.equal(extract('I drank 500 mL of water.').events[0].data.amount, '500'));
test('planned fluid intake is not recorded', () => assert.equal(extract('I might drink 500 mL of water.').events.length, 0));
test('name from explicit instruction only', () => {
  assert.equal(extract('Call me Susan.').name, 'Susan');
  assert.equal(extract('I am Tired.').name, null);
});
