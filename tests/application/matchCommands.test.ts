import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendMatchEvent, backDraftService, canRecordMatch, changeDraftObservations, correctionForServerOrder, createMatch,
  preparePointInput, selectPointDetail, selectStrokeInput, serviceEndingInput, skipDraftService, toggleDraftServer, undoMatch,
} from '../../src/application/matchCommands.ts';
import type { CommandRuntime, SetupValues } from '../../src/application/matchCommands.ts';
import { replayMatch } from '../../src/domain/history.ts';
import type { MatchEvent } from '../../src/domain/history.ts';
import { emptyObservations } from '../../src/domain/points.ts';
import type { PointInput } from '../../src/domain/points.ts';
import { presets } from '../../src/domain/presets.ts';
import { effectiveServer } from '../../src/domain/serviceOrder.ts';
import { emptyDraft, validateMatch } from '../../src/storage/model.ts';
import type { MatchRecord, StartedMatchRecord } from '../../src/storage/model.ts';
import type { MatchGroup } from '../../src/storage/matchGroups.ts';

const now = '2026-11-11T12:00:00.000Z';
const player = { id: 'player-1', name: 'Alex', createdAt: now };
const values: SetupValues = {
  playerId: player.id, playerName: '', opponent: ' Jamie ', preset: 'fast4-single', mode: 'detailed',
  group: ' Club tournament ', date: '2026-11-11', round: ' First round ', venue: ' Local club ', surface: ' Hard ',
  courtSetting: 'Outdoor', conditions: ' Windy ',
};
function runtime(): CommandRuntime {
  let nextId = 0;
  return { id: () => `id-${++nextId}`, now: () => now };
}
function fixture(): StartedMatchRecord {
  const { match } = createMatch(values, [player], null, runtime());
  return { ...match, firstServer: 0, timingStartedAt: now };
}
const point: MatchEvent = { id: 'point-1', type: 'point', input: { type: 'winner-only', winner: 0 } };
function savePoint(match: MatchRecord, input: PointInput, id: string): MatchRecord {
  return appendMatchEvent(match, { id, type: 'point', input: preparePointInput(match, input) }, true);
}

test('Match setup constructs a valid unstarted record without mutating form data or inventing play', () => {
  const input = structuredClone(values);
  const { match, newPlayer } = createMatch(input, [player], null, runtime());
  validateMatch(match);
  assert.equal(newPlayer, null);
  assert.deepEqual(match.players, [{ id: player.id, name: player.name }, { id: null, name: 'Jamie' }]);
  assert.equal(match.group, 'Club tournament');
  assert.equal(match.round, 'First round');
  assert.equal(match.venue, 'Local club');
  assert.equal(match.surface, 'Hard');
  assert.equal(match.conditions, 'Windy');
  assert.equal(match.firstServer, null);
  assert.equal(match.timingStartedAt, null);
  assert.deepEqual(match.events, []);
  assert.deepEqual(match.draft, emptyDraft());
  assert.deepEqual(input, values);

  const created = createMatch({ ...values, playerId: '', playerName: ' Taylor ', group: '' }, [], null, runtime());
  validateMatch(created.match);
  assert.equal(created.newPlayer?.name, 'Taylor');
  assert.equal(created.newPlayer?.id, created.match.players[0].id);
  assert.equal(created.newPlayer?.createdAt, created.match.createdAt);
  assert.equal(created.match.eventId, undefined);
  assert.throws(() => createMatch({ ...values, playerId: 'missing' }, [player], null, runtime()), /name for each player/);
  assert.throws(() => createMatch({ ...values, opponent: ' ' }, [player], null, runtime()), /name for each player/);
});

test('Adding a match to an event preserves its identity and historical rules snapshot', () => {
  const latest = fixture();
  latest.serverOrderSwitched = true;
  latest.format = { ...latest.format, name: 'Earlier FAST4 rules', serviceLet: 'play-on' };
  const event: MatchGroup = { key: 'event-existing', name: latest.group, dateLabel: latest.date, named: true, latest, matches: [latest] };
  const { match } = createMatch(values, [player], event, runtime());
  assert.equal(match.eventId, event.key);
  assert.deepEqual(match.format, latest.format);
  assert.equal(match.serverOrderSwitched, undefined, 'A service-order mistake belongs only to the original match.');
  const changed = createMatch({ ...values, preset: 'normal-best-of-three' }, [player], event, runtime()).match;
  assert.equal(changed.eventId, event.key);
  assert.equal(changed.format.id, 'normal-best-of-three');
});

test('Recording and undo commands preserve original records and reset the saved entry draft', () => {
  const original = fixture();
  original.draft = { ...emptyDraft(), pending: { winner: 0 }, observations: { ...emptyObservations(), notes: 'A draft note' } };
  const before = structuredClone(original);
  const recorded = appendMatchEvent(original, point, true);
  assert.deepEqual(original, before);
  assert.deepEqual(recorded.draft, emptyDraft());
  assert.equal(recorded.firstServer, 0);
  assert.deepEqual(replayMatch(recorded.format, recorded.firstServer!, recorded.events).score.current?.points, [1, 0]);
  const undone = undoMatch(recorded, 'undo-1');
  assert.deepEqual(replayMatch(undone.format, undone.firstServer!, undone.events).score.current?.points, [0, 0]);
  assert.deepEqual(recorded.events, [point]);
  const unstarted = createMatch(values, [player], null, runtime()).match;
  assert.throws(() => appendMatchEvent(unstarted, point), /Start the match/);
  assert.throws(() => undoMatch(unstarted, 'undo-unstarted'), /Start the match/);
});

test('The application keeps finished matches closed to undo while allowing suspended match recovery', () => {
  const original = appendMatchEvent(fixture(), point);
  const suspended = appendMatchEvent(original, { id: 'pause', type: 'lifecycle', action: { type: 'suspend' } });
  assert.equal(canRecordMatch(replayMatch(suspended.format, suspended.firstServer!, suspended.events).score.status), true);
  const resumed = undoMatch(suspended, 'undo-pause');
  assert.equal(replayMatch(resumed.format, resumed.firstServer!, resumed.events).score.status, 'in-progress');
  const finished = appendMatchEvent(original, { id: 'finish', type: 'lifecycle', action: { type: 'abandon' } });
  assert.equal(canRecordMatch(replayMatch(finished.format, finished.firstServer!, finished.events).score.status), false);
  assert.equal(canRecordMatch(undefined), false);
  assert.throws(() => undoMatch(finished, 'undo-finished'), /Finished matches/);
});

test('Serve draft commands preserve recovery data and explicitly skipped answers across navigation', () => {
  const original = fixture();
  original.draft = { ...emptyDraft(), lets: 2, actualServer: 1, serveStep: 'first-serve',
    observations: { ...emptyObservations(), notes: 'Keep this observation.' } };
  const answered = changeDraftObservations(original, { ...original.draft.observations, firstServe: 'fault' });
  assert.equal(answered.draft.serveStep, 'second-serve');
  assert.equal(answered.draft.pending, null);
  const skipped = skipDraftService(answered);
  assert.equal(skipped.draft.serveStep, 'return-result');
  assert.equal(skipped.draft.observations.firstServe, 'fault');
  assert.equal(skipped.draft.observations.secondServe, 'unknown');
  assert.equal(skipped.draft.observations.notes, original.draft.observations.notes);
  assert.equal(skipped.draft.lets, 2);
  assert.equal(skipped.draft.actualServer, 1);
  const previous = backDraftService(skipped);
  assert.equal(previous.draft.serveStep, 'second-serve');
  assert.deepEqual(previous.draft.observations, skipped.draft.observations);
  assert.equal(skipDraftService(selectPointDetail(original, { winner: 0 })).draft.pending, null);
  assert.equal(original.draft.pending, null);
  assert.equal(original.draft.serveStep, 'first-serve');
  const switched = toggleDraftServer(fixture(), 0);
  assert.equal(switched.serverOrderSwitched, true);
  assert.equal(switched.draft.actualServer, null);
  assert.equal(toggleDraftServer(switched, 0).serverOrderSwitched, false);
});

test('A server switch persists across saved points and a game until it is explicitly switched back', () => {
  const original = fixture();
  let match = toggleDraftServer(original, 0);
  for (let i = 0; i < 4; i++) {
    match = savePoint(match, serviceEndingInput(match, 'ace', 1), `ace-${i}`);
    assert.equal(match.serverOrderSwitched, true);
    assert.deepEqual(match.draft, emptyDraft());
  }
  let projection = replayMatch(match.format, match.firstServer!, match.events);
  assert.deepEqual(projection.points.map(point => point.server), [1, 1, 1, 1]);
  assert.deepEqual(projection.score.current!.games, [0, 1]);
  assert.equal(projection.score.current!.server, 1);
  assert.equal(effectiveServer(projection.score.current!.server, match.serverOrderSwitched), 0);
  assert.equal(projection.stats.players[1].aces, 4);

  match = savePoint(match, serviceEndingInput(match, 'ace', 0), 'next-game-ace');
  projection = replayMatch(match.format, match.firstServer!, match.events);
  assert.equal(projection.points.at(-1)!.server, 0);
  assert.equal(projection.stats.players[0].aces, 1);
  assert.equal(match.serverOrderSwitched, true);
  const restored = toggleDraftServer(match, projection.score.current!.server);
  assert.equal(restored.serverOrderSwitched, false);
  assert.equal(preparePointInput(restored, { type: 'winner-only', winner: 0 }).actualServer, 1);
  assert.equal(original.serverOrderSwitched, undefined);
  assert.deepEqual(original.events, []);
});

test('A persistent switch follows baseline service rotation through set and tie-break boundaries', () => {
  let match: MatchRecord = { ...fixture(), format: presets['fast4-match-tiebreak'], serverOrderSwitched: true };
  match = appendMatchEvent(match, {
    id: 'first-set-score', type: 'correction', reason: 'Current score',
    correction: correctionForServerOrder(match, { games: [3, 0], points: [3, 0], nextServer: 0 }),
  });
  match = savePoint(match, serviceEndingInput(match, 'ace', 0), 'first-set-ace');
  let projection = replayMatch(match.format, match.firstServer!, match.events);
  assert.equal(projection.score.current!.index, 1);
  assert.equal(projection.score.current!.server, 0);
  assert.equal(preparePointInput(match, { type: 'winner-only', winner: 1 }).actualServer, 1);

  match = appendMatchEvent(match, {
    id: 'second-set-score', type: 'correction', reason: 'Current score',
    correction: correctionForServerOrder(match, { games: [3, 3], points: [6, 6], nextServer: 1 }),
  });
  assert.equal(preparePointInput(match, { type: 'winner-only', winner: 1 }).actualServer, 1);
  match = savePoint(match, { type: 'winner-only', winner: 1 }, 'tie-seven-six');
  assert.equal(preparePointInput(match, { type: 'winner-only', winner: 1 }).actualServer, 0);
  match = savePoint(match, { type: 'winner-only', winner: 1 }, 'tie-eight-six');
  projection = replayMatch(match.format, match.firstServer!, match.events);
  assert.deepEqual(projection.score.stagesWon, [1, 1]);
  assert.equal(projection.score.current!.phase, 'match-tie-break');
  assert.equal(match.serverOrderSwitched, true);

  const servers: number[] = [];
  for (let i = 0; i < 5; i++) {
    const input = preparePointInput(match, { type: 'winner-only', winner: 0 });
    servers.push(input.actualServer!);
    match = savePoint(match, input, `match-tie-point-${i}`);
  }
  assert.deepEqual(servers, [0, 1, 1, 0, 0]);
  assert.equal(match.serverOrderSwitched, true);
});

test('Undo, delete and edit retain the switch and historical service attribution', () => {
  let match = toggleDraftServer(fixture(), 0);
  match = savePoint(match, serviceEndingInput(match, 'ace', 1), 'ace');
  match = savePoint(match, serviceEndingInput(match, 'double-fault', 1), 'double-fault');
  const undone = undoMatch(match, 'undo-double-fault');
  let projection = replayMatch(undone.format, undone.firstServer!, undone.events);
  assert.equal(undone.serverOrderSwitched, true);
  assert.deepEqual(projection.score.current!.points, [0, 1]);
  assert.equal(projection.stats.players[1].aces, 1);
  assert.equal(projection.stats.players[1].doubleFaults, 0);
  assert.equal(preparePointInput(undone, { type: 'winner-only', winner: 0 }).actualServer, 1);

  const deleted = appendMatchEvent(match, { id: 'delete', type: 'delete-point', targetId: 'double-fault' }, true);
  assert.equal(deleted.serverOrderSwitched, true);
  assert.deepEqual(replayMatch(deleted.format, deleted.firstServer!, deleted.events).stats, projection.stats);

  const switchedBack = toggleDraftServer(deleted, projection.score.current!.server);
  const edited = appendMatchEvent(switchedBack, {
    id: 'edit', type: 'edit-point', targetId: 'ace',
    input: { type: 'double-fault', actor: 1, actualServer: 1 },
  }, true);
  projection = replayMatch(edited.format, edited.firstServer!, edited.events);
  assert.equal(edited.serverOrderSwitched, false);
  assert.deepEqual(projection.score.current!.points, [1, 0]);
  assert.equal(projection.points[0]!.server, 1);
  assert.equal(projection.stats.players[1].aces, 0);
  assert.equal(projection.stats.players[1].doubleFaults, 1);
});

test('Legacy pending server overrides retain the current side when promoted across draft resets', () => {
  const legacy: MatchRecord = { ...fixture(), draft: { ...emptyDraft(), actualServer: 1 } };
  const prepared = preparePointInput(legacy, { type: 'winner-only', winner: 1 });
  assert.equal(prepared.actualServer, 1);
  const saved = savePoint(legacy, prepared, 'legacy-point');
  assert.equal(saved.serverOrderSwitched, true);
  assert.deepEqual(saved.draft, emptyDraft());
  assert.equal(preparePointInput(saved, { type: 'winner-only', winner: 0 }).actualServer, 1);
  assert.equal(undoMatch({ ...legacy, events: [point] }, 'legacy-undo').serverOrderSwitched, true);
  assert.equal(toggleDraftServer(legacy, 0).serverOrderSwitched, false);

  const explicit: MatchRecord = { ...legacy, serverOrderSwitched: false };
  assert.equal(preparePointInput(explicit, { type: 'winner-only', winner: 0 }).actualServer, 1);
  assert.equal(preparePointInput(explicit, { type: 'winner-only', winner: 0, actualServer: 0 }).actualServer, 0);
  assert.equal(savePoint(explicit, { type: 'winner-only', winner: 0 }, 'explicit-point').serverOrderSwitched, false);
});

test('Stroke selection produces the same business input independently of screen arrangement', () => {
  const original = fixture();
  assert.equal(selectStrokeInput(original, 'forehand', true), null);
  assert.equal(selectStrokeInput(selectPointDetail(original, { winner: 0 }), 'forehand', true), null);
  const pending = selectPointDetail(original, { actor: 0, ending: 'winner' });
  const input = selectStrokeInput(pending, 'forehand', false)!;
  assert.deepEqual(input, { type: 'ending', actor: 0, ending: 'winner', stroke: 'forehand', observations: original.draft.observations });
  const recorded = appendMatchEvent(pending, { id: 'forehand', type: 'point', input }, true);
  const projection = replayMatch(recorded.format, recorded.firstServer!, recorded.events);
  assert.equal(projection.points[0]?.winner, 0);
  assert.equal(projection.points[0]?.stroke, 'forehand');
  assert.equal(selectStrokeInput(pending, 'serve', false), null);
  assert.equal(selectStrokeInput(pending, 'serve', true)?.type, 'ace');
  assert.equal(selectStrokeInput(selectPointDetail(original, { actor: 0, ending: 'unforced-error' }), 'serve', true)?.type, 'double-fault');
  assert.deepEqual(original.draft, emptyDraft());
});

test('Detailed service outcomes retain first/second serve meaning without changing source drafts', () => {
  const original = fixture();
  const firstAce = serviceEndingInput(original, 'ace', 0);
  assert.equal(firstAce.observations?.firstServe, 'in');
  assert.equal(firstAce.observations?.secondServe, 'unknown');
  const secondServe = changeDraftObservations(original, { ...emptyObservations(), firstServe: 'fault' });
  const secondAce = serviceEndingInput(secondServe, 'ace', 0);
  assert.equal(secondAce.observations?.firstServe, 'fault');
  assert.equal(secondAce.observations?.secondServe, 'in');
  const finished = appendMatchEvent(secondServe, { id: 'second-ace', type: 'point', input: secondAce }, true);
  const projection = replayMatch(finished.format, finished.firstServer!, finished.events);
  assert.equal(projection.points[0]?.ending, 'ace');
  assert.equal(projection.points[0]?.observations?.secondServe, 'in');
  const quick: MatchRecord = { ...original, mode: 'endings' };
  assert.deepEqual(serviceEndingInput(quick, 'ace', 0).observations, emptyObservations());
  assert.deepEqual(serviceEndingInput(secondServe, 'double-fault', 0).observations, secondServe.draft.observations);
  assert.deepEqual(original.draft, emptyDraft());
  assert.equal(secondServe.draft.observations.secondServe, 'unknown');
});
