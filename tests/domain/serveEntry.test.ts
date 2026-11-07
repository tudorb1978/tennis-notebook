import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyObservations, recordPoint, summarisePoints } from '../../src/domain/points.ts';
import { answerServeEntry, previousServeEntryStep, serveEntryStep, skipServeEntry } from '../../src/domain/serveEntry.ts';
import { createScore } from '../../src/domain/scoring.ts';
import { presets } from '../../src/domain/presets.ts';

test('Skipping the serve still asks about the return without inventing service statistics', () => {
  const skipped = skipServeEntry({ observations: emptyObservations() });
  assert.equal(skipped.serveStep, 'return-result');
  assert.deepEqual(skipped.observations, emptyObservations());
  assert.equal(serveEntryStep(JSON.parse(JSON.stringify(skipped))), 'return-result');
  const returned = answerServeEntry(skipped, { ...skipped.observations, returnResult: 'in' });
  assert.equal(returned.serveStep, 'return-stroke');
  const finished = answerServeEntry(returned, { ...returned.observations, returnStroke: 'backhand' });
  assert.equal(finished.serveStep, 'point-ending');
  const point = recordPoint(createScore(presets['fast4-single'], 0), {
    type: 'ending', actor: 0, ending: 'winner', stroke: 'forehand', observations: finished.observations,
  }).point;
  const stats = summarisePoints([point]);
  assert.equal(stats.players[0].firstServesObserved, 0);
  assert.equal(stats.players[0].secondServesObserved, 0);
  assert.equal(stats.players[1].returnsObserved, 1);
});

test('Skipping second serve preserves the first fault and unknown return results bypass the stroke question', () => {
  const fault = answerServeEntry({ observations: emptyObservations() }, { ...emptyObservations(), firstServe: 'fault' });
  assert.equal(fault.serveStep, 'second-serve');
  const skipped = skipServeEntry(fault);
  assert.equal(skipped.serveStep, 'return-result');
  assert.equal(skipped.observations.firstServe, 'fault');
  assert.equal(skipped.observations.secondServe, 'unknown');
  const ended = skipServeEntry(skipped);
  assert.equal(ended.serveStep, 'point-ending');
  assert.equal(previousServeEntryStep(ended), 'return-result');
  assert.equal(previousServeEntryStep(skipped), 'second-serve');
  assert.equal(previousServeEntryStep(fault), 'first-serve');
});

test('Changing an earlier answer clears dependent observations while Back alone preserves them', () => {
  const observations = { ...emptyObservations(), firstServe: 'fault', secondServe: 'in',
    returnResult: 'error', returnStroke: 'backhand', notes: 'Keep this note.' } as const;
  const draft = { observations, serveStep: 'point-ending' as const };
  assert.equal(previousServeEntryStep(draft), 'return-stroke');
  assert.equal(draft.observations, observations);
  const first = answerServeEntry({ ...draft, serveStep: 'first-serve' }, { ...observations, firstServe: 'in' });
  assert.equal(first.serveStep, 'return-result');
  assert.equal(first.observations.secondServe, 'unknown');
  assert.equal(first.observations.returnResult, 'unknown');
  assert.equal(first.observations.returnStroke, 'unknown');
  assert.equal(first.observations.notes, observations.notes);
  const result = answerServeEntry({ ...draft, serveStep: 'return-result' }, { ...observations, returnResult: 'in' });
  assert.equal(result.serveStep, 'return-stroke');
  assert.equal(result.observations.returnStroke, 'unknown');
  const skipped = skipServeEntry({ ...draft, serveStep: 'return-result' });
  assert.equal(skipped.observations.returnResult, 'unknown');
  assert.equal(skipped.observations.returnStroke, 'unknown');
});

test('Legacy drafts resume conservatively and pending winner or shot choices retain their place', () => {
  const empty = { observations: emptyObservations() };
  assert.equal(serveEntryStep(empty), 'first-serve');
  assert.equal(serveEntryStep({ observations: { ...empty.observations, firstServe: 'in' } }), 'return-result');
  assert.equal(serveEntryStep({ observations: { ...empty.observations, returnResult: 'error' } }), 'return-stroke');
  assert.equal(serveEntryStep({ observations: { ...empty.observations, returnStroke: 'forehand' } }), 'point-ending');
  assert.equal(serveEntryStep({ ...empty, pending: { winner: 0 } }), 'point-ending');
  assert.equal(serveEntryStep({ ...empty, pending: { actor: 1, ending: 'forced-error' } }), 'point-ending');
});
