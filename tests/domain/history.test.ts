import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendEvent, replayMatch, undoLast } from '../../src/domain/history.ts';
import type { MatchEvent } from '../../src/domain/history.ts';
import { emptyObservations, recordPoint } from '../../src/domain/points.ts';
import type { PointObservations } from '../../src/domain/points.ts';
import { createScore } from '../../src/domain/scoring.ts';
import { presets } from '../../src/domain/presets.ts';

const format = presets['fast4-single'];
const examples: readonly MatchEvent[] = [
  { id: 'a', type: 'point', input: { type: 'ending', actor: 0, ending: 'winner', stroke: 'forehand' } },
  { id: 'b', type: 'point', input: { type: 'ending', actor: 0, ending: 'unforced-error', stroke: 'backhand' } },
  { id: 'c', type: 'point', input: { type: 'ending', actor: 1, ending: 'forced-error', stroke: 'volley' } },
];

test('Pressure point totals replay old points, honour the actual server, and update after undo', () => {
  const events: readonly MatchEvent[] = [
    { id: 'correct-game', type: 'correction', reason: 'Catch up to the live score', correction: { games: [3, 2], points: [3, 3], nextServer: 0 } },
    { id: 'saved', type: 'point', input: { type: 'winner-only', winner: 1, actualServer: 1 } },
    { id: 'correct-tiebreak', type: 'correction', reason: 'Catch up to the tie-break', correction: { games: [3, 3], points: [6, 5], nextServer: 0 } },
    { id: 'converted', type: 'point', input: { type: 'winner-only', winner: 0 } },
  ];
  const { stats, score } = replayMatch(format, 0, events);
  assert.equal(score.status, 'completed');
  const [{ pressurePoints: alex }, { pressurePoints: jamie }] = stats.players;
  assert.deepEqual(alex.break.chances, { won: 0, lost: 1 });
  assert.deepEqual(jamie.break.faced, { won: 1, lost: 0 });
  for (const stake of ['set', 'match'] as const) {
    assert.deepEqual(alex[stake].chances, { won: 1, lost: 1 });
    assert.deepEqual(jamie[stake].faced, { won: 1, lost: 1 });
  }
  const undone = replayMatch(format, 0, undoLast(format, 0, events, 'undo-conversion'));
  assert.deepEqual(undone.stats.players[0].pressurePoints.match.chances, { won: 0, lost: 1 });
});

test('Winner and error strokes are required and determine the correct point winner', () => {
  const projection = replayMatch(format, 0, examples);
  assert.deepEqual(projection.score.current!.points, [2, 1]);
  assert.equal(projection.stats.players[0].byStroke.forehand.winners, 1);
  assert.equal(projection.stats.players[0].byStroke.backhand.unforcedErrors, 1);
  assert.equal(projection.stats.players[1].byStroke.volley.forcedErrors, 1);
  const missingStroke = { type: 'ending', actor: 0, ending: 'winner' } as unknown as Parameters<typeof recordPoint>[1];
  assert.throws(() => recordPoint(createScore(format, 0), missingStroke), /Choose a stroke/);
});

test('Aces count as serve winners and double faults count as unforced serve errors', () => {
  const events: readonly MatchEvent[] = [
    { id: 'a', type: 'point', input: { type: 'ace', actor: 0 } },
    { id: 'b', type: 'point', input: { type: 'double-fault', actor: 0 } },
    { id: 'c', type: 'point', input: { type: 'ending', actor: 0, ending: 'winner', stroke: 'serve' } },
  ];
  const projection = replayMatch(format, 0, events);
  assert.deepEqual(projection.score.current!.points, [2, 1]);
  assert.equal(projection.stats.players[0].byStroke.serve.winners, 2);
  assert.equal(projection.stats.players[0].aces, 1);
  assert.equal(projection.stats.players[0].doubleFaults, 1);
  assert.equal(projection.stats.players[0].byStroke.serve.unforcedErrors, 1);
  assert.equal(projection.stats.players[1].byStroke.serve.unforcedErrors, 0);
  assert.throws(() => recordPoint(createScore(format, 0), { type: 'ace', actor: 1 }));
});

test('New points cannot end in a serve error or double fault after a serve marked in', () => {
  const inServes: PointObservations[] = [
    { ...emptyObservations(), firstServe: 'in' },
    { ...emptyObservations(), firstServe: 'fault', secondServe: 'in' },
  ];
  for (const observations of inServes) {
    for (const ending of ['forced-error', 'unforced-error'] as const) {
      assert.throws(() => appendEvent(format, 0, [], {
        id: 'serve-error', type: 'point', input: { type: 'ending', actor: 0, ending, stroke: 'serve', observations },
      }), /marked In/);
    }
    assert.throws(() => appendEvent(format, 0, [], {
      id: 'double-fault', type: 'point', input: { type: 'double-fault', actor: 0, observations },
    }), /marked In/);
    const winner = appendEvent(format, 0, [], {
      id: 'serve-winner', type: 'point', input: { type: 'ending', actor: 0, ending: 'winner', stroke: 'serve', observations },
    });
    assert.equal(replayMatch(format, 0, winner).points[0]?.winner, 0);
  }
  const fault = appendEvent(format, 0, [], {
    id: 'double-fault', type: 'point', input: { type: 'double-fault', actor: 0, observations: { ...emptyObservations(), firstServe: 'fault' } },
  });
  assert.equal(replayMatch(format, 0, fault).points[0]?.ending, 'double-fault');
});

test('Existing match records can replay a previously saved serve error with an in serve', () => {
  const projection = replayMatch(format, 0, [{
    id: 'legacy-serve-error', type: 'point',
    input: { type: 'ending', actor: 0, ending: 'unforced-error', stroke: 'serve', observations: { ...emptyObservations(), firstServe: 'in' } },
  }]);
  assert.equal(projection.points[0]?.ending, 'unforced-error');
  assert.equal(projection.points[0]?.winner, 1);
});

test('Other strokes, unseen strokes, and winner-only points retain distinct meanings', () => {
  const projection = replayMatch(format, 0, [
    { id: 'a', type: 'point', input: { type: 'ending', actor: 1, ending: 'unforced-error', stroke: 'other' } },
    { id: 'b', type: 'point', input: { type: 'ending', actor: 1, ending: 'unforced-error', stroke: 'unknown' } },
    { id: 'c', type: 'point', input: { type: 'winner-only', winner: 0 } },
  ]);
  assert.equal(projection.stats.players[1].byStroke.other.unforcedErrors, 1);
  assert.equal(projection.stats.players[1].byStroke.unknown.unforcedErrors, 1);
  assert.deepEqual(projection.stats.coverage, { points: 3, endings: 2, strokes: 1 });
});

test('Undo is retained in history and reverts score, server, and stroke statistics', () => {
  const events = undoLast(format, 0, examples, 'undo-c');
  assert.equal(events.length, 4);
  assert.deepEqual(events.at(-1), { id: 'undo-c', type: 'undo', targetId: 'c' });
  const projection = replayMatch(format, 0, events);
  assert.deepEqual(projection.score.current!.points, [1, 1]);
  assert.equal(projection.score.current!.server, 0);
  assert.equal(projection.stats.players[1].byStroke.volley.forcedErrors, 0);
  const twice = undoLast(format, 0, events, 'undo-b');
  assert.deepEqual(replayMatch(format, 0, twice).score.current!.points, [1, 0]);
});

test('Deleting the latest point removes its notes and stats while preserving edits to other points', () => {
  const events: MatchEvent[] = [
    ...examples,
    { id: 'note-c', type: 'edit-point', targetId: 'c', input: { type: 'ending', actor: 1, ending: 'forced-error', stroke: 'volley',
      observations: { ...emptyObservations(), notes: 'At the net' } } },
    { id: 'edit-a', type: 'edit-point', targetId: 'a', input: { type: 'ending', actor: 0, ending: 'winner', stroke: 'backhand' } },
  ];
  const before = replayMatch(format, 0, events);
  const deleted = appendEvent(format, 0, events, { id: 'delete-c', type: 'delete-point', targetId: 'c' });
  const after = replayMatch(format, 0, JSON.parse(JSON.stringify(deleted)));
  assert.deepEqual(after.pointEntries.map(entry => entry.id), ['a', 'b']);
  assert.deepEqual(after.score.current!.points, [1, 1]);
  assert.equal(after.stats.players[0].byStroke.backhand.winners, 1);
  assert.equal(after.stats.players[1].byStroke.volley.forcedErrors, 0);
  assert.equal(after.lastActionId, 'delete-c');
  assert.equal(after.canDeleteLastPoint, true);
  assert.equal(before.points.at(-1)?.observations?.notes, 'At the net');
  const restored = undoLast(format, 0, deleted, 'restore-c');
  assert.deepEqual(replayMatch(format, 0, restored), before);
});

test('Deleting a point preserves pause and resume actions and match timing', () => {
  const startedAt = '2026-11-05T12:00:00.000Z';
  const resumedAt = '2026-11-05T12:00:15.000Z';
  const events: MatchEvent[] = [
    { ...examples[0]!, recordedAt: '2026-11-05T12:00:05.000Z' },
    { id: 'pause', type: 'lifecycle', action: { type: 'suspend' }, recordedAt: '2026-11-05T12:00:10.000Z' },
    { id: 'resume', type: 'lifecycle', action: { type: 'resume' }, recordedAt: resumedAt },
  ];
  const deleted = appendEvent(format, 0, events, { id: 'delete', type: 'delete-point', targetId: 'a' });
  const projection = replayMatch(format, 0, deleted, startedAt);
  assert.equal(projection.score.status, 'in-progress');
  assert.deepEqual(projection.score.current!.points, [0, 0]);
  assert.equal(projection.canDeleteLastPoint, false);
  assert.deepEqual(projection.timing, replayMatch(format, 0, events, startedAt).timing);
  assert.equal(projection.timing!.runningSinceMs, Date.parse(resumedAt));
});

test('Only the latest live point can be deleted and a later active correction blocks deletion', () => {
  const deleteC = { id: 'delete-c', type: 'delete-point', targetId: 'c' } as const;
  assert.throws(() => appendEvent(format, 0, examples, { ...deleteC, targetId: 'a' }), /latest recorded point/);
  const corrected = appendEvent(format, 0, examples, {
    id: 'checkpoint', type: 'correction', correction: { games: [2, 1], points: [3, 2], nextServer: 1 }, reason: 'Missed points',
  });
  assert.equal(replayMatch(format, 0, corrected).canDeleteLastPoint, false);
  assert.throws(() => appendEvent(format, 0, corrected, deleteC), /later score correction/);
  const correctionUndone = undoLast(format, 0, corrected, 'undo-correction');
  assert.equal(replayMatch(format, 0, correctionUndone).canDeleteLastPoint, true);
  const deleted = appendEvent(format, 0, correctionUndone, deleteC);
  assert.equal(appendEvent(format, 0, deleted, deleteC), deleted);
  assert.throws(() => appendEvent(format, 0, deleted, { ...deleteC, id: 'delete-c-again' }), /latest recorded point/);
  assert.throws(() => appendEvent(format, 0, deleted, {
    id: 'edit-c', type: 'edit-point', targetId: 'c', input: { type: 'winner-only', winner: 0 },
  }), /no longer available/);
  const twice = appendEvent(format, 0, deleted, { id: 'delete-b', type: 'delete-point', targetId: 'b' });
  assert.deepEqual(replayMatch(format, 0, twice).pointEntries.map(entry => entry.id), ['a']);
});

test('Undoing a match-winning point reopens the correct game and server', () => {
  const events: MatchEvent[] = [
    { id: 'checkpoint', type: 'correction', correction: { games: [3, 2], points: [3, 0], nextServer: 1 }, reason: 'Joined late' },
    { id: 'last', type: 'point', input: { type: 'ending', actor: 0, ending: 'winner', stroke: 'backhand' } },
  ];
  assert.equal(replayMatch(format, 0, events).score.status, 'completed');
  const score = replayMatch(format, 0, undoLast(format, 0, events, 'undo-last')).score;
  assert.equal(score.status, 'in-progress');
  assert.deepEqual(score.current!.points, [3, 0]);
  assert.equal(score.current!.server, 1);
});

test('Deleting a match-winning point reopens the match and its playing clock', () => {
  const startedAt = '2026-11-05T12:00:00.000Z';
  const events: MatchEvent[] = [
    { id: 'checkpoint', type: 'correction', correction: { games: [3, 2], points: [3, 0], nextServer: 1 }, reason: 'Joined late' },
    { id: 'last', type: 'point', input: { type: 'winner-only', winner: 0 }, recordedAt: '2026-11-05T12:30:00.000Z' },
  ];
  const completed = replayMatch(format, 0, events, startedAt);
  assert.equal(completed.score.status, 'completed');
  const deleted = appendEvent(format, 0, events, { id: 'delete-last', type: 'delete-point', targetId: 'last' });
  const projection = replayMatch(format, 0, deleted, startedAt);
  assert.equal(projection.score.status, 'in-progress');
  assert.deepEqual(projection.score.current!.points, [3, 0]);
  assert.equal(projection.score.current!.server, 1);
  assert.equal(projection.timing!.endedAt, null);
  assert.equal(projection.timing!.runningSinceMs, Date.parse(startedAt));
  assert.deepEqual(replayMatch(format, 0, undoLast(format, 0, deleted, 'restore-last'), startedAt), completed);
});

test('Corrections preserve known statistics without inventing missing points', () => {
  const events = appendEvent(format, 0, examples, {
    id: 'checkpoint', type: 'correction', correction: { games: [2, 1], points: [3, 2], nextServer: 1 }, reason: 'Missed points',
  });
  const projection = replayMatch(format, 0, events);
  assert.equal(projection.hasScoreCorrections, true);
  assert.equal(projection.points.length, 3);
  assert.equal(projection.stats.players[0].pointsWon, 2);
  assert.equal(projection.stats.players[1].pointsWon, 1);
  assert.deepEqual(projection.score.current!.games, [2, 1]);
  const restored = replayMatch(format, 0, undoLast(format, 0, events, 'undo-correction'));
  assert.equal(restored.hasScoreCorrections, false);
  assert.deepEqual(restored.score.current!.points, [2, 1]);
});

test('Retrying the same event is idempotent; conflicting contents or duplicate replay IDs fail', () => {
  const first = appendEvent(format, 0, [], examples[0]!);
  assert.equal(appendEvent(format, 0, first, examples[0]!), first);
  assert.throws(() => appendEvent(format, 0, first, { id: 'a', type: 'point', input: { type: 'winner-only', winner: 1 } }));
  assert.throws(() => replayMatch(format, 0, [...first, ...first]));
});

test('An undo cannot target an older action while a newer one remains active', () => {
  assert.throws(() => appendEvent(format, 0, examples, { id: 'bad', type: 'undo', targetId: 'a' }));
  assert.throws(() => undoLast(format, 0, [], 'empty'));
});

test('Undo is unavailable after all recorded actions have been reversed', () => {
  const events = undoLast(format, 0, [examples[0]!], 'undo-first');
  assert.equal(replayMatch(format, 0, events).lastActionId, null);
});

test('Retirement can be undone without changing the observed points', () => {
  const retired = appendEvent(format, 0, examples, { id: 'retire', type: 'lifecycle', action: { type: 'retire', player: 0 } });
  assert.equal(replayMatch(format, 0, retired).score.winner, 1);
  assert.deepEqual(replayMatch(format, 0, undoLast(format, 0, retired, 'undo-retire')).score, replayMatch(format, 0, examples).score);
});

test('An event snapshot cannot be changed by later UI draft edits', () => {
  const event: MatchEvent = { id: 'new', type: 'point', input: { type: 'winner-only', winner: 0 } };
  const events = appendEvent(format, 0, [], event);
  Object.assign(event.input, { winner: 1 });
  assert.equal(replayMatch(format, 0, events).points[0]!.winner, 0);
});

test('A completed match tie-break can be undone and restored across serialization', () => {
  const twoSets: MatchEvent[] = [];
  for (let i = 0; i < 32; i++) twoSets.push({ id: `p${i}`, type: 'point', input: { type: 'winner-only', winner: i < 16 ? 0 : 1 } });
  const events = [...twoSets,
    { id: 'tie', type: 'correction', correction: { games: [0, 0], points: [9, 8], nextServer: 1 }, reason: 'Caught up' } as const,
    { id: 'last', type: 'point', input: { type: 'winner-only', winner: 0 } } as const];
  const threeStageFormat = presets['fast4-match-tiebreak'];
  assert.equal(replayMatch(threeStageFormat, 0, events).score.status, 'completed');
  const undone = undoLast(threeStageFormat, 0, events, 'undo-last');
  const restored = replayMatch(threeStageFormat, 0, JSON.parse(JSON.stringify(undone)) as MatchEvent[]);
  assert.equal(restored.score.current!.phase, 'match-tie-break');
  assert.deepEqual(restored.score.current!.points, [9, 8]);
  assert.equal(restored.score.current!.server, 1);
  assert.deepEqual(restored.score.stagesWon, [1, 1]);
});

test('Timing deducts pauses, including a pause still open when a match is ended', () => {
  const startedAt = '2026-11-05T12:00:00.000Z';
  const endedAt = '2026-11-05T12:00:24.000Z';
  const events: MatchEvent[] = [
    { id: 'pause-1', type: 'lifecycle', action: { type: 'suspend' }, recordedAt: '2026-11-05T12:00:10.000Z' },
    { id: 'resume', type: 'lifecycle', action: { type: 'resume' }, recordedAt: '2026-11-05T12:00:15.000Z' },
    { id: 'pause-2', type: 'lifecycle', action: { type: 'suspend' }, recordedAt: '2026-11-05T12:00:20.000Z' },
    { id: 'abandon', type: 'lifecycle', action: { type: 'abandon' }, recordedAt: endedAt },
  ];
  assert.deepEqual(replayMatch(format, 0, events.slice(0, 2), startedAt).timing, {
    startedAt, endedAt: null, pausedMs: null, playingMs: 10000, runningSinceMs: Date.parse('2026-11-05T12:00:15.000Z'),
  });
  assert.deepEqual(replayMatch(format, 0, events, startedAt).timing, { startedAt, endedAt, pausedMs: 9000, playingMs: 15000, runningSinceMs: null });
  const reopened = replayMatch(format, 0, undoLast(format, 0, events, 'undo-finish'), startedAt);
  assert.equal(reopened.score.status, 'suspended');
  assert.deepEqual(reopened.timing, { startedAt, endedAt: null, pausedMs: null, playingMs: 15000, runningSinceMs: null });
});

test('Match timing uses the final point timestamp and skips legacy records', () => {
  const startedAt = '2026-11-05T12:00:00.000Z';
  const endedAt = '2026-11-05T13:04:00.000Z';
  const events: MatchEvent[] = [
    { id: 'correction', type: 'correction', correction: { games: [3, 0], points: [3, 0], nextServer: 0 }, reason: 'Caught up' },
    { id: 'last-point', type: 'point', input: { type: 'winner-only', winner: 0 }, recordedAt: endedAt },
    { id: 'edit', type: 'edit-point', targetId: 'last-point', input: { type: 'ending', actor: 0, ending: 'winner', stroke: 'forehand' } },
  ];
  assert.equal(replayMatch(format, 0, events).timing, null);
  assert.deepEqual(replayMatch(format, 0, events, startedAt).timing, { startedAt, endedAt, pausedMs: 0, playingMs: 3840000, runningSinceMs: null });
  assert.throws(() => replayMatch(format, 0, [{ ...events[0]!, recordedAt: 'invalid' }]), /timestamp/);
});
