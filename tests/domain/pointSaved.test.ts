import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replayMatch } from '../../src/domain/history.ts';
import type { MatchEvent } from '../../src/domain/history.ts';
import { presets } from '../../src/domain/presets.ts';
import { pointSavedSummary } from '../../src/ui/pointSaved.ts';

const names = ['Stefan', 'Harry'] as const;
const format = presets['fast4-match-tiebreak'];
const firstSet: MatchEvent[] = [
  { id: 'first-score', type: 'correction', reason: 'Current score', correction: { games: [3, 2], points: [3, 2], nextServer: 0 } },
  { id: 'first-point', type: 'point', input: { type: 'winner-only', winner: 0 } },
];
const splitSets: MatchEvent[] = [
  ...firstSet,
  { id: 'second-score', type: 'correction', reason: 'Current score', correction: { games: [3, 3], points: [8, 9], nextServer: 0 } },
  { id: 'second-point', type: 'point', input: { type: 'winner-only', winner: 1 } },
];

test('Saved point scores follow the player order, including advantage and an empty projection', () => {
  assert.deepEqual(pointSavedSummary(replayMatch(format, 0, [
    { id: 'point', type: 'point', input: { type: 'winner-only', winner: 1 } },
  ]), names), { score: '0–15', context: 'Set 1 · Games 0–0', next: 'Next point', winnerSide: 1 });

  assert.deepEqual(pointSavedSummary(replayMatch(presets['normal-match-tiebreak'], 0, [
    { id: 'score', type: 'correction', reason: 'Current score', correction: { games: [2, 1], points: [3, 3], nextServer: 0 } },
    { id: 'point', type: 'point', input: { type: 'winner-only', winner: 1 } },
  ]), names), { score: '40–Ad', context: 'Set 1 · Games 2–1', next: 'Next point', winnerSide: 1 });

  assert.deepEqual(pointSavedSummary(replayMatch(format, 0, []), names),
    { score: '0–0', context: 'Set 1 · Games 0–0', next: 'Next point', winnerSide: null });
});

test('A deciding deuce point shows the new games score instead of the reset point score', () => {
  const projection = replayMatch(format, 0, [
    { id: 'score', type: 'correction', reason: 'Current score', correction: { games: [1, 1], points: [3, 3], nextServer: 0 } },
    { id: 'point', type: 'point', input: { type: 'winner-only', winner: 1 } },
  ]);
  assert.deepEqual(pointSavedSummary(projection, names),
    { score: '1–2', context: 'Game to Harry · Set 1', next: 'Next game', winnerSide: 1 });
});

test('Entering and continuing a set tie-break identifies the tie-break and the set score', () => {
  const events: MatchEvent[] = [
    { id: 'score', type: 'correction', reason: 'Current score', correction: { games: [2, 3], points: [3, 0], nextServer: 0 } },
    { id: 'point', type: 'point', input: { type: 'winner-only', winner: 0 } },
  ];
  assert.deepEqual(pointSavedSummary(replayMatch(format, 0, events), names),
    { score: '3–3', context: 'Game to Stefan · Set 1', next: 'Tie-break next', winnerSide: 0 });
  assert.deepEqual(pointSavedSummary(replayMatch(format, 0, [
    ...events, { id: 'tie-point', type: 'point', input: { type: 'winner-only', winner: 1 } },
  ]), names), { score: '0–1', context: 'Set 1 · Tie-break at 3–3', next: 'Next point', winnerSide: 1 });
});

test('Set wins show the completed set, including an extended tie-break, and identify what follows', () => {
  assert.deepEqual(pointSavedSummary(replayMatch(format, 0, firstSet), names),
    { score: '4–2', context: 'Set 1 to Stefan', next: 'Next set', winnerSide: 0 });
  assert.deepEqual(pointSavedSummary(replayMatch(format, 0, splitSets), names),
    { score: '3–4[8]', context: 'Set 2 to Harry', next: 'Match tie-break next', winnerSide: 1 });
  assert.deepEqual(pointSavedSummary(replayMatch(format, 0, [
    ...splitSets,
    { id: 'tie-point', type: 'point', input: { type: 'winner-only', winner: 0 } },
  ]), names), { score: '1–0', context: 'Match tie-break', next: 'Next point', winnerSide: 0 });
});

test('A deciding match tie-break win shows the full match result', () => {
  const projection = replayMatch(format, 0, [
    ...splitSets,
    { id: 'final-score', type: 'correction', reason: 'Current score', correction: { games: [0, 0], points: [15, 16], nextServer: 1 } },
    { id: 'final-point', type: 'point', input: { type: 'winner-only', winner: 1 } },
  ]);
  assert.deepEqual(pointSavedSummary(projection, names),
    { score: '4–2  3–4[8]  15–17', context: 'Harry wins', next: 'Match complete', winnerSide: 1 });
});

test('A single-set match ending in a set tie-break shows the final result and winner', () => {
  const projection = replayMatch(presets['fast4-single'], 0, [
    { id: 'score', type: 'correction', reason: 'Current score', correction: { games: [3, 3], points: [7, 8], nextServer: 0 } },
    { id: 'point', type: 'point', input: { type: 'winner-only', winner: 1 } },
  ]);
  assert.deepEqual(pointSavedSummary(projection, names),
    { score: '3–4[7]', context: 'Harry wins', next: 'Match complete', winnerSide: 1 });
});
