import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendMatchEvent, backDraftService, canRecordMatch, changeDraftObservations, createMatch,
  selectPointDetail, selectStrokeInput, serviceEndingInput, skipDraftService, toggleDraftServer, undoMatch,
} from '../../src/application/matchCommands.ts';
import type { CommandRuntime, SetupValues } from '../../src/application/matchCommands.ts';
import { replayMatch } from '../../src/domain/history.ts';
import type { MatchEvent } from '../../src/domain/history.ts';
import { emptyObservations } from '../../src/domain/points.ts';
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
  latest.format = { ...latest.format, name: 'Earlier FAST4 rules', serviceLet: 'play-on' };
  const event: MatchGroup = { key: 'event-existing', name: latest.group, dateLabel: latest.date, named: true, latest, matches: [latest] };
  const { match } = createMatch(values, [player], event, runtime());
  assert.equal(match.eventId, event.key);
  assert.deepEqual(match.format, latest.format);
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
  assert.equal(switched.draft.actualServer, 1);
  assert.equal(toggleDraftServer(switched, 0).draft.actualServer, null);
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
