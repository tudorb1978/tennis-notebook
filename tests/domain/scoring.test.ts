import assert from 'node:assert/strict';
import { test } from 'node:test';
import { awardPoint, changeLifecycle, correctCurrentStage, createScore, pointLabels, pointStakes, tieBreakServer, validateFormat } from '../../src/domain/scoring.ts';
import type { MatchFormat, MatchScore, SetRules, Side } from '../../src/domain/scoring.ts';
import { presets } from '../../src/domain/presets.ts';

function pointRun(score: MatchScore, winners: readonly Side[]): MatchScore { return winners.reduce(awardPoint, score); }
function winGame(score: MatchScore, winner: Side): MatchScore { return pointRun(score, [winner, winner, winner, winner]); }
function winSet(score: MatchScore, winner: Side): MatchScore {
  const index = score.current!.index;
  while (score.current?.index === index) score = winGame(score, winner);
  return score;
}
function alternatingGames(score: MatchScore, total: number): MatchScore {
  for (let i = 0; i < total; i++) score = winGame(score, (i % 2) as Side);
  return score;
}
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function freeze(value: object): void { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); }

for (const [id, format] of Object.entries(presets)) {
  test(`${id} creates an isolated, serializable rules snapshot`, () => {
    const score = createScore(format, 1);
    assert.equal(score.current!.server, 1);
    assert.notEqual(score.format, format);
    assert.deepEqual(copy(score), score);
    validateFormat(score.format);
  });
}

test('One FAST4 set ends 4–0 without creating a second stage', () => {
  const score = winSet(createScore(presets['fast4-single'], 0), 0);
  assert.equal(score.status, 'completed');
  assert.equal(score.current, null);
  assert.deepEqual(score.stagesWon, [1, 0]);
  assert.deepEqual(score.completedStages, [{ kind: 'set', games: [4, 0], winner: 0, tieBreakPoints: null }]);
});

test('FAST4 deuce is a deciding point; its receiver wins without advantage', () => {
  let score = pointRun(createScore(presets['fast4-single'], 0), [0, 0, 0, 1, 1, 1]);
  assert.deepEqual(pointLabels(score), ['40', '40']);
  score = awardPoint(score, 1);
  assert.deepEqual(score.current!.games, [0, 1]);
  assert.deepEqual(pointLabels(score), ['0', '0']);
  assert.equal(score.current!.server, 1);
});

test('FAST4 deciding points can give each player a different opportunity', () => {
  const score = correctCurrentStage(createScore(presets['fast4-single'], 0), { games: [3, 2], points: [3, 3], nextServer: 0 });
  assert.deepEqual(pointStakes(score), [['match'], ['break']]);
  assert.deepEqual(pointStakes(score, 1), [['match', 'break'], []]);
  assert.deepEqual(pointStakes(changeLifecycle(score, { type: 'suspend' })), [[], []]);
  assert.deepEqual(pointStakes(awardPoint(score, 0)), [[], []]);
});

test('Normal games can return from advantage to deuce repeatedly', () => {
  let score = pointRun(createScore(presets['normal-match-tiebreak'], 0), [0, 0, 0, 1, 1, 1]);
  for (let i = 0; i < 5; i++) {
    score = awardPoint(score, 0);
    assert.deepEqual(pointLabels(score), ['Ad', '40']);
    score = awardPoint(score, 1);
    assert.deepEqual(pointLabels(score), ['40', '40']);
    assert.equal(score.current!.server, 0);
  }
  score = pointRun(score, [1, 1]);
  assert.deepEqual(score.current!.games, [0, 1]);
});

test('A normal set at 6–5 continues until 7–5', () => {
  let score = alternatingGames(createScore(presets['normal-match-tiebreak'], 0), 10);
  score = winGame(score, 0);
  assert.deepEqual(score.current!.games, [6, 5]);
  assert.equal(score.completedStages.length, 0);
  score = winGame(score, 0);
  assert.equal(score.completedStages[0]!.kind, 'set');
  assert.deepEqual((score.completedStages[0] as { games: readonly number[] }).games, [7, 5]);
  assert.equal(score.current!.server, 0);
});

test('A normal set point requires a game point and a two-game lead after winning the game', () => {
  const match = createScore(presets['normal-match-tiebreak'], 0);
  const close = correctCurrentStage(match, { games: [5, 4], points: [3, 3], nextServer: 1 });
  assert.deepEqual(pointStakes(close), [[], []]);
  const advantage = awardPoint(close, 0);
  assert.deepEqual(pointStakes(advantage), [['set', 'break'], []]);
  assert.deepEqual(pointStakes(advantage, 0), [['set'], []]);
  const stillLevel = correctCurrentStage(match, { games: [5, 5], points: [4, 3], nextServer: 1 });
  assert.deepEqual(pointStakes(stillLevel), [['break'], []]);
});

for (const [id, gameCount, finalGames] of [
  ['fast4-match-tiebreak', 6, [4, 3]],
  ['normal-match-tiebreak', 12, [7, 6]],
] as const) {
  test(`${id} enters its set tie-break and preserves its points and correct next server`, () => {
    let score = alternatingGames(createScore(presets[id], 0), gameCount);
    assert.equal(score.current!.phase, 'set-tie-break');
    assert.equal(score.current!.server, 0);
    score = pointRun(score, [0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(score.completedStages[0], { kind: 'set', games: finalGames, winner: 0, tieBreakPoints: [7, 0] });
    assert.equal(score.current!.server, 1, 'The receiver of the FIRST tie-break point serves the next set');
    assert.equal(score.current!.phase, 'game');
  });
}

test('Set tie-break at 6–6 points needs two clear, with no cap', () => {
  let score = alternatingGames(createScore(presets['fast4-single'], 1), 6);
  score = pointRun(score, [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
  assert.deepEqual(score.current!.points, [7, 6]);
  assert.equal(score.status, 'in-progress');
  score = awardPoint(score, 0);
  assert.equal(score.status, 'completed');
  assert.deepEqual(score.completedStages[0], { kind: 'set', games: [4, 3], winner: 0, tieBreakPoints: [8, 6] });
});

for (const id of ['fast4-match-tiebreak', 'normal-match-tiebreak'] as const) {
  test(`${id} ends in straight sets without starting a deciding tie-break`, () => {
    const score = winSet(winSet(createScore(presets[id], 1), 1), 1);
    assert.equal(score.status, 'completed');
    assert.equal(score.winner, 1);
    assert.deepEqual(score.stagesWon, [0, 2]);
    assert.equal(score.completedStages.length, 2);
  });

  test(`${id} starts a separate match tie-break at one set all, to ten and two clear`, () => {
    let score = winSet(winSet(createScore(presets[id], 0), 0), 1);
    assert.deepEqual(score.stagesWon, [1, 1]);
    assert.equal(score.current!.phase, 'match-tie-break');
    assert.deepEqual(score.current!.games, [0, 0]);
    const sequence: Side[] = Array.from({ length: 18 }, (_, i) => (i % 2) as Side);
    score = pointRun(score, sequence);
    assert.deepEqual(score.current!.points, [9, 9]);
    score = awardPoint(score, 1);
    assert.equal(score.status, 'in-progress');
    score = awardPoint(score, 1);
    assert.equal(score.status, 'completed');
    assert.deepEqual(score.stagesWon, [1, 2]);
    assert.deepEqual(score.completedStages[2], { kind: 'match-tie-break', points: [9, 11], winner: 1 });
  });
}

test('The match tie-break server follows the original service order after a 6–1 second set', () => {
  let score = winSet(createScore(presets['normal-match-tiebreak'], 0), 0); // 6–0, next server 0.
  score = winGame(score, 0); // Second set 1–0.
  for (let i = 0; i < 6; i++) score = winGame(score, 1); // 1–6; seven games flip server.
  assert.equal(score.current!.phase, 'match-tie-break');
  assert.equal(score.current!.server, 1);
});

test('Tie-break service sequence is one serve then two, for either first server', () => {
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => tieBreakServer(0, i)), [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => tieBreakServer(1, i)), [1, 0, 0, 1, 1, 0, 0, 1, 1, 0]);
  assert.throws(() => tieBreakServer(0, -1));
});

test('Configured tie-break caps and one-point margins work without changing presets', () => {
  const format: MatchFormat = { version: 1, id: 'short-tie', name: 'Short tie-break', serviceLet: 'replay',
    stages: [{ kind: 'match-tie-break', tieBreak: { pointsToWin: 5, winBy: 2, cap: 5, serviceOrder: 'one-then-two' } }] };
  let score = pointRun(createScore(format, 0), [0, 1, 0, 1, 0, 1, 0, 1]);
  assert.deepEqual(pointStakes(score), [['match'], ['match']]);
  score = awardPoint(score, 0);
  assert.equal(score.status, 'completed');
  const singleMargin: MatchFormat = { ...format, stages: [{ kind: 'match-tie-break', tieBreak: { pointsToWin: 7, winBy: 1, cap: null, serviceOrder: 'one-then-two' } }] };
  score = pointRun(createScore(singleMargin, 0), [...Array.from({ length: 12 }, (_, i) => (i % 2) as Side), 0]);
  assert.equal(score.status, 'completed');
});

test('Input format and score snapshots are not mutated by scoring', () => {
  const score = createScore(presets['fast4-single'], 0);
  const before = copy(score);
  freeze(score);
  const next = awardPoint(score, 0);
  assert.deepEqual(score, before);
  assert.deepEqual(next.current!.points, [1, 0]);
});

test('Invalid rules are rejected before a match starts', () => {
  assert.throws(() => validateFormat({ ...presets['fast4-single'], stages: [] }));
  assert.throws(() => validateFormat({ ...presets['fast4-single'], stages: [presets['fast4-single'].stages[0], presets['fast4-single'].stages[0]] }));
  const set = presets['fast4-single'].stages[0];
  assert.throws(() => validateFormat({ ...presets['fast4-single'], stages: [{ ...set, tieBreakAt: 6 }] }));
  assert.throws(() => validateFormat({ ...presets['fast4-single'], stages: [{ ...set, tieBreak: null }] }));
  assert.throws(() => validateFormat({ ...presets['fast4-single'], stages: [{ ...set, gamesToWin: 0 }] }));
  assert.throws(() => awardPoint(createScore(presets['fast4-single'], 0), 2 as Side));
});

test('Suspension preserves the exact score and server and prevents recording until resume', () => {
  const original = pointRun(createScore(presets['fast4-single'], 1), [0, 1, 0]);
  const suspended = changeLifecycle(original, { type: 'suspend' });
  assert.throws(() => awardPoint(suspended, 0));
  assert.deepEqual(changeLifecycle(suspended, { type: 'resume' }), original);
});

test('Retirement awards the other player; abandonment has no winner', () => {
  const score = pointRun(createScore(presets['fast4-single'], 1), [0, 1, 0]);
  assert.deepEqual(changeLifecycle(score, { type: 'retire', player: 0 }), { ...score, status: 'retired', winner: 1 });
  assert.deepEqual(changeLifecycle(score, { type: 'abandon' }), { ...score, status: 'abandoned', winner: null });
  assert.throws(() => awardPoint(changeLifecycle(score, { type: 'abandon' }), 0));
});

test('A score correction can enter a set tie-break and reconstruct its service position', () => {
  let score = correctCurrentStage(createScore(presets['fast4-match-tiebreak'], 0), { games: [3, 3], points: [6, 6], nextServer: 1 });
  assert.equal(score.current!.phase, 'set-tie-break');
  assert.equal(score.current!.server, 1);
  assert.equal(score.current!.tieBreakFirstServer, 1);
  score = pointRun(score, [1, 1]);
  assert.equal(score.current!.server, 0, 'Receiver of the first tie-break point serves the next set');
  assert.deepEqual(score.completedStages[0], { kind: 'set', winner: 1, games: [3, 4], tieBreakPoints: [6, 8] });
});

test('Corrected ordinary deuce and advantage continue accurately', () => {
  let score = correctCurrentStage(createScore(presets['normal-match-tiebreak'], 0), { games: [5, 5], points: [4, 3], nextServer: 1 });
  assert.deepEqual(pointLabels(score), ['Ad', '40']);
  score = awardPoint(score, 0);
  assert.deepEqual(score.current!.games, [6, 5]);
  assert.equal(score.current!.server, 0);
});

test('Corrections reject completed games, completed stages, impossible games, and negative points', () => {
  const fast = createScore(presets['fast4-single'], 0);
  assert.throws(() => correctCurrentStage(fast, { games: [4, 2], points: [0, 0], nextServer: 0 }));
  assert.throws(() => correctCurrentStage(fast, { games: [0, 0], points: [4, 3], nextServer: 0 }));
  assert.throws(() => correctCurrentStage(fast, { games: [3, 3], points: [7, 5], nextServer: 0 }));
  assert.throws(() => correctCurrentStage(fast, { games: [0, 0], points: [-1, 0], nextServer: 0 }));
  assert.throws(() => correctCurrentStage(createScore(presets['normal-match-tiebreak'], 0), { games: [7, 6], points: [0, 0], nextServer: 0 }));
});

test('Changing a preset after creation cannot change an existing match', () => {
  const format = copy(presets['fast4-single']) as unknown as { stages: SetRules[] } & MatchFormat;
  const score = createScore(format, 0);
  format.stages[0] = { ...format.stages[0]!, deuce: 'advantage' };
  assert.equal((score.format.stages[0] as SetRules).deuce, 'deciding-point');
});

test('Seeded matches preserve score and service invariants through full completion', () => {
  let random = 137;
  for (const format of Object.values(presets)) {
    for (let run = 0; run < 12; run++) {
      let score = createScore(format, (run % 2) as Side);
      let played = 0;
      while (score.status === 'in-progress' && played < 2000) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const old = score;
        score = awardPoint(score, (random >>> 31) as Side);
        assert.ok(score.stagesWon[0] + score.stagesWon[1] === score.completedStages.length);
        assert.ok(score.completedStages.length >= old.completedStages.length);
        assert.deepEqual(copy(score), score);
        if (score.current) assert.ok(score.current.server === 0 || score.current.server === 1);
        played++;
      }
      assert.equal(score.status, 'completed');
      assert.equal(score.stagesWon[score.winner!], Math.floor(format.stages.length / 2) + 1);
      assert.throws(() => awardPoint(score, 0));
    }
  }
});
