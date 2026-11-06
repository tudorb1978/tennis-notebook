import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendEvent, replayMatch, undoLast } from '../../src/domain/history.ts';
import type { MatchEvent } from '../../src/domain/history.ts';
import { emptyObservations, recordPoint, summarisePoints } from '../../src/domain/points.ts';
import { hasPointNotes } from '../../src/domain/pointNotes.ts';
import { correctCurrentStage, createScore } from '../../src/domain/scoring.ts';
import { presets } from '../../src/domain/presets.ts';
import { pointNoteLabels, pointNoteSummary } from '../../src/reports/pointNotes.ts';

const format = presets['fast4-single'];
test('Point notes tally rally estimates once and keep legacy tags and each player distinct', () => {
  const names = ['Alex', 'Jamie'] as const;
  const first = recordPoint(createScore(format, 0), {
    type: 'winner-only', winner: 0,
    observations: { ...emptyObservations(), longRally: true, questionableCall: true, callBy: 1 },
  });
  const second = recordPoint(first.score, {
    type: 'winner-only', winner: 1,
    observations: { ...emptyObservations(), rallyLength: 'very-long', questionableCallsBy: [0, 1], playerNotes: [['tired'], ['body-language', 'tired']] },
  });
  assert.deepEqual(pointNoteLabels(first.point.observations, names), ['Long rally (older tag)', 'Questionable call by Jamie']);
  const summary = pointNoteSummary([first.point, second.point], names);
  assert.deepEqual(summary[0]?.lines, ['Long rally (est. over 15 shots) · 0', 'Very long rally (est. over 25 shots) · 1', 'Long rally (older tag) · 1']);
  assert.deepEqual(summary[1]?.lines, ['Alex · 1', 'Jamie · 2']);
  assert.ok(summary[2]?.lines.includes('Looks tired · Alex 1 · Jamie 1'));
  assert.throws(() => recordPoint(first.score, {
    type: 'winner-only', winner: 1,
    observations: { ...emptyObservations(), playerNotes: [['tired', 'tired'], []] },
  }), /Invalid player observations/);
});
test('Unified call notes distinguish disputed and incorrect calls and keep attribution optional', () => {
  const names = ['Alex', 'Jamie'] as const;
  const score = createScore(format, 0);
  const both = recordPoint(score, { type: 'winner-only', winner: 0,
    observations: { ...emptyObservations(), disputed: true, callIncorrect: true, callBy: 'official' } }).point;
  const incorrect = recordPoint(score, { type: 'winner-only', winner: 0,
    observations: { ...emptyObservations(), callIncorrect: true } }).point;
  const questionable = recordPoint(score, { type: 'winner-only', winner: 0,
    observations: { ...emptyObservations(), callIncorrect: false, callBy: 0 } }).point;
  assert.deepEqual(pointNoteLabels(both.observations, names), ['Call was disputed and incorrect · Call by Official']);
  assert.equal(hasPointNotes(incorrect.observations), true);
  assert.deepEqual(pointNoteSummary([both, incorrect, questionable], names), [
    { title: 'Questionable calls', lines: ['Alex · 1', 'Jamie · 0'] },
    { title: 'Disputed calls', lines: ['Alex · 0', 'Jamie · 0', 'Official · 1'] },
    { title: 'Incorrect calls', lines: ['Alex · 0', 'Jamie · 0', 'Official · 1', 'Unattributed · 1'] },
  ]);
});

test('Only observed serve and return results enter their statistic denominators', () => {
  const { point } = recordPoint(createScore(format, 0), { type: 'winner-only', winner: 1, observations: { ...emptyObservations(), firstServe: 'fault', secondServe: 'in', returnStroke: 'backhand', returnResult: 'in' } });
  const stats = summarisePoints([point]);
  assert.equal(stats.players[0].firstServesObserved, 1); assert.equal(stats.players[0].firstServesIn, 0);
  assert.equal(stats.players[0].secondServesObserved, 1); assert.equal(stats.players[0].secondServesIn, 1);
  assert.equal(stats.players[1].returnsIn, 1); assert.equal(stats.coverage.endings, 0);
});
test('Service outcomes normalize certain facts and reject incompatible observations', () => {
  const score = createScore(format, 0);
  const point = recordPoint(score, { type: 'ace', actor: 0, observations: { ...emptyObservations(), firstServe: 'fault' } }).point;
  assert.equal(point.observations!.secondServe, 'in');
  assert.equal(recordPoint(score, { type: 'double-fault', actor: 0 }).point.observations!.firstServe, 'fault');
  assert.throws(() => recordPoint(score, { type: 'ace', actor: 0, observations: { ...emptyObservations(), returnStroke: 'forehand' } }));
  assert.throws(() => recordPoint(score, { type: 'winner-only', winner: 0, observations: { ...emptyObservations(), firstServe: 'in', secondServe: 'in' } }));
});
test('A serve out of turn is attributed to the actual server and keeps the scheduled rotation', () => {
  const score = correctCurrentStage(createScore(presets['fast4-match-tiebreak'], 0), {
    games: [3, 3], points: [5, 6], nextServer: 0,
  });
  const overridden = recordPoint(score, {
    type: 'ace', actor: 1, actualServer: 1, observations: { ...emptyObservations(), firstServe: 'in' },
  });
  assert.equal(overridden.point.server, 1);
  assert.equal(overridden.point.servedOutOfTurn, true);
  const stats = summarisePoints([overridden.point]);
  assert.equal(stats.players[1].firstServesIn, 1);
  assert.equal(stats.players[0].firstServesObserved, 0);
  assert.deepEqual(overridden.score, recordPoint(score, { type: 'winner-only', winner: 1 }).score);
  assert.equal(overridden.score.current?.phase, 'game');
  assert.equal(overridden.score.current?.index, 1);

  const following = recordPoint(overridden.score, { type: 'winner-only', winner: 0 });
  assert.equal(following.point.server, overridden.score.current?.server);
  assert.equal(following.point.servedOutOfTurn, false);
});
test('Editing a stroke or annotation updates reports, and undo restores its previous value', () => {
  const original: MatchEvent = { id: 'point', type: 'point', input: { type: 'ending', actor: 0, ending: 'winner', stroke: 'forehand' } };
  const events = appendEvent(format, 0, [original], { id: 'edit', type: 'edit-point', targetId: 'point', input: { type: 'ending', actor: 0, ending: 'winner', stroke: 'backhand', observations: { ...emptyObservations(), disputed: true, callBy: 1, notes: 'Questionable baseline call' } } });
  const edited = replayMatch(format, 0, events);
  assert.equal(edited.stats.players[0].byStroke.forehand.winners, 0);
  assert.equal(edited.stats.players[0].byStroke.backhand.winners, 1);
  assert.equal(edited.points[0]!.observations!.disputed, true);
  assert.equal(replayMatch(format, 0, undoLast(format, 0, events, 'undo')).stats.players[0].byStroke.forehand.winners, 1);
});
test('Changing a point winner before a correction requires reconciliation', () => {
  const events: MatchEvent[] = [{ id: 'point', type: 'point', input: { type: 'winner-only', winner: 0 } }, { id: 'correction', type: 'correction', correction: { games: [1, 1], points: [0, 0], nextServer: 0 }, reason: 'Missed points' }];
  assert.throws(() => appendEvent(format, 0, events, { id: 'edit', type: 'edit-point', targetId: 'point', input: { type: 'winner-only', winner: 1 } }), /later score correction/);
});
test('An edit that would end the match before later recorded points is rejected', () => {
  const events: MatchEvent[] = [{ id: 'correction', type: 'correction', correction: { games: [3, 0], points: [3, 2], nextServer: 0 }, reason: 'Current score' }, { id: 'a', type: 'point', input: { type: 'winner-only', winner: 1 } }, { id: 'b', type: 'point', input: { type: 'winner-only', winner: 0 } }];
  assert.throws(() => appendEvent(format, 0, events, { id: 'edit', type: 'edit-point', targetId: 'a', input: { type: 'winner-only', winner: 0 } }));
});
