import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loopKey, mergeDuplicates, activeLoops, closureCandidates} from '../public/loops.mjs';
test('equivalent polite wording merges while preserving original records', () => {
  const loops = ['Remember to ask my doctor about tingling.', 'Can you remember to ask my doctor about tingling?'].map((text,id)=>({text,id,status:'open'}));
  mergeDuplicates(loops);
  assert.equal(activeLoops(loops).length,1);
  assert.equal(loops.length,2);
});
test('different question remains distinct', () => assert.notEqual(loopKey('Ask my doctor about tingling.'), loopKey('Ask my doctor about nausea.')));
test('explicit completion and ambiguity', () => {
  const loops = [{id:1,text:'Ask my doctor about tingling in my hands.',status:'open'}];
  assert.equal(closureCandidates("We talked to the doctor about tingling—that’s handled",loops).length,1);
  assert.equal(closureCandidates("We haven't talked to the doctor about tingling—that's handled",loops),null);
  loops.push({id:2,text:'Ask my doctor about tingling in my feet.',status:'open'});
  assert.equal(closureCandidates('Close the question about tingling.',loops).length,2);
});
