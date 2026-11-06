import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replayMatch } from '../../src/domain/history.ts';
import type { MatchEvent } from '../../src/domain/history.ts';
import { emptyObservations } from '../../src/domain/points.ts';
import { presets } from '../../src/domain/presets.ts';
import { buildPointByPoint } from '../../src/reports/pointByPoint.ts';

const format = presets['fast4-match-tiebreak'];
const names = ['Stefan', 'Harry'] as const;

test('Point-by-point reports preserve point order, stage scores and the recorded details', () => {
  const events: MatchEvent[] = [
    { id: 'first-score', type: 'correction', reason: 'Recording started late', correction: { games: [3, 3], points: [6, 5], nextServer: 1 } },
    { id: 'first-point', type: 'point', input: {
      type: 'ending', actor: 0, ending: 'winner', stroke: 'forehand', actualServer: 0,
      observations: { ...emptyObservations(), firstServe: 'fault', secondServe: 'in', returnResult: 'in', returnStroke: 'backhand',
        rallyLength: 'very-long', disputed: true, callIncorrect: true, callBy: 'official',
        playerNotes: [['great-effort'], ['frustration']], notes: 'Recovered after chasing a drop shot.' },
    } },
    { id: 'second-score', type: 'correction', reason: 'Missed games', correction: { games: [2, 3], points: [2, 3], nextServer: 0 } },
    { id: 'second-point', type: 'point', input: { type: 'winner-only', winner: 1 } },
    { id: 'third-score', type: 'correction', reason: 'Missed points', correction: { games: [0, 0], points: [9, 8], nextServer: 1 } },
    { id: 'third-point', type: 'point', input: { type: 'double-fault', actor: 1 } },
  ];
  const stages = buildPointByPoint(replayMatch(format, 0, events), names);

  assert.deepEqual(stages.map(({ title, score, setTieBreak, status, points }) => [title, score, setTieBreak, status, points[0]?.number]), [
    ['Set 1', '4–3', '[5]', 'completed', 1],
    ['Set 2', '2–4', '', 'completed', 2],
    ['Match tie-break', '10–8', '', 'completed', 3],
  ]);
  assert.deepEqual(stages[0]?.points[0], {
    number: 1,
    scoreBefore: 'Games 3–3 · Tie-break 6–5',
    winner: 'Stefan',
    ending: 'Stefan · Winner · Forehand',
    serve: 'Stefan served out of turn · First serve fault · Second serve in · Return in (backhand)',
    pressure: ['Set point for Stefan'],
    labels: [
      { text: 'Very long rally (est. over 25 shots)', tone: 'rally' },
      { text: 'Call was disputed · Call by Official', tone: 'neutral' },
      { text: 'Call was incorrect · Call by Official', tone: 'neutral' },
      { text: 'Stefan · Great effort', tone: 'positive' },
      { text: 'Harry · Anger or frustration (racket smashing or tears)', tone: 'negative' },
    ],
    notes: 'Recovered after chasing a drop shot.',
  });
  assert.deepEqual(stages.map(stage => stage.stats.players.map(player => player.pointsWon)), [[1, 0], [0, 1], [1, 0]]);
  assert.equal(stages[2]?.stats.players[1].byStroke.serve.unforcedErrors, 1);
});

test('A score-only correction can describe an unfinished stage without inventing any points', () => {
  const events: MatchEvent[] = [
    { id: 'score', type: 'correction', reason: 'Recording started late', correction: { games: [2, 1], points: [1, 2], nextServer: 0 } },
    { id: 'stop', type: 'lifecycle', action: { type: 'abandon' } },
  ];
  const [stage] = buildPointByPoint(replayMatch(format, 0, events), names);
  assert.equal(stage?.score, '2–1 · Points 15–30');
  assert.equal(stage?.status, 'unfinished');
  assert.deepEqual(stage?.points, []);
  assert.equal(stage?.stats.coverage.points, 0);
  assert.deepEqual(buildPointByPoint(replayMatch(format, 0, []), names), []);
});
