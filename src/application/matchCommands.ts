import { appendEvent, replayMatch, undoLast } from '../domain/history.ts';
import type { MatchEvent } from '../domain/history.ts';
import type { PointInput, PointObservations, Stroke } from '../domain/points.ts';
import { presets } from '../domain/presets.ts';
import type { PresetId } from '../domain/presets.ts';
import { other } from '../domain/scoring.ts';
import type { MatchScore, ScoreCorrection, Side } from '../domain/scoring.ts';
import { effectiveServer } from '../domain/serviceOrder.ts';
import { answerServeEntry, previousServeEntryStep, serveEntryStep, skipServeEntry } from '../domain/serveEntry.ts';
import type { MatchGroup } from '../storage/matchGroups.ts';
import { emptyDraft } from '../storage/model.ts';
import type { MatchDraft, MatchRecord, PlayerProfile, RecordingMode, UnstartedMatchRecord } from '../storage/model.ts';

export type SavedMatchDetails = Pick<MatchRecord, 'group' | 'date' | 'round' | 'venue' | 'surface' | 'courtSetting' | 'conditions'>;
export type MatchDetails = Required<SavedMatchDetails>;
export type MatchDetailsValues = MatchDetails & { opponent: string };
export interface SetupValues extends MatchDetails {
  playerId: string;
  playerName: string;
  opponent: string;
  preset: PresetId;
  mode: RecordingMode;
}
export interface CommandRuntime {
  id(): string;
  now(): string;
}

export function matchDetailsFrom(values: SavedMatchDetails): MatchDetails {
  return {
    group: values.group.trim(),
    date: values.date.trim(),
    round: values.round.trim(),
    venue: values.venue.trim(),
    surface: values.surface.trim(),
    courtSetting: values.courtSetting ?? '',
    conditions: values.conditions.trim(),
  };
}

export function canRecordMatch(status: MatchScore['status'] | undefined): boolean {
  return status === 'in-progress' || status === 'suspended';
}

/** Construct the same saved record regardless of the form or layout that supplied the values. */
export function createMatch(values: SetupValues, players: readonly PlayerProfile[], setupEvent: MatchGroup | null, runtime: CommandRuntime): {
  match: UnstartedMatchRecord;
  newPlayer: PlayerProfile | null;
} {
  const name = values.playerId ? players.find(player => player.id === values.playerId)?.name : values.playerName.trim();
  if (!name || !values.opponent.trim()) throw new Error('Enter a name for each player.');
  const now = runtime.now();
  const newPlayer = values.playerId ? null : { id: runtime.id(), name, createdAt: now };
  const ownerId = values.playerId || newPlayer!.id;
  const details = matchDetailsFrom(values);
  const eventId = setupEvent?.key ?? (details.group ? `event:${runtime.id()}` : undefined);
  const match: UnstartedMatchRecord = {
    schemaVersion: 1, id: runtime.id(), revision: 0, createdAt: now, updatedAt: now, timingStartedAt: null,
    players: [{ id: ownerId, name }, { id: null, name: values.opponent.trim() }], ...details, ...(eventId ? { eventId } : {}),
    format: setupEvent?.latest.format.id === values.preset ? setupEvent.latest.format : presets[values.preset],
    firstServer: null, mode: values.mode, events: [], draft: emptyDraft(),
  };
  return { match, newPlayer };
}

export function appendMatchEvent(match: MatchRecord, event: MatchEvent, clearDraft = false): MatchRecord {
  if (match.firstServer === null) throw new Error('Start the match before recording play.');
  const savedOrder = clearDraft ? preserveLegacyServerOrder(match) : match;
  return { ...savedOrder, events: appendEvent(match.format, match.firstServer, match.events, event), draft: clearDraft ? emptyDraft() : match.draft };
}

export function undoMatch(match: MatchRecord, id: string): MatchRecord {
  if (match.firstServer === null) throw new Error('Start the match before recording play.');
  if (!canRecordMatch(replayMatch(match.format, match.firstServer, match.events).score.status)) {
    throw new Error('Finished matches cannot be undone.');
  }
  return { ...preserveLegacyServerOrder(match), events: undoLast(match.format, match.firstServer, match.events, id), draft: emptyDraft() };
}

export function changeDraftObservations(match: MatchRecord, observations: PointObservations): MatchRecord {
  return { ...match, draft: { ...match.draft, ...answerServeEntry(match.draft, observations), pending: null } };
}

export function skipDraftService(match: MatchRecord): MatchRecord {
  return { ...match, draft: { ...match.draft, ...skipServeEntry(match.draft), pending: null } };
}

export function backDraftService(match: MatchRecord): MatchRecord {
  return { ...match, draft: { ...match.draft, serveStep: previousServeEntryStep(match.draft), pending: null } };
}

export function selectPointDetail(match: MatchRecord, pending: MatchDraft['pending']): MatchRecord {
  return { ...match, draft: { ...match.draft, pending } };
}

export function toggleDraftServer(match: MatchRecord, scheduledServer: Side): MatchRecord {
  const current = effectiveServer(scheduledServer, persistentServerOrder(match, scheduledServer), match.draft.actualServer);
  return { ...match, serverOrderSwitched: other(current) !== scheduledServer, draft: { ...match.draft, actualServer: null } };
}

/** Older versions kept the selection in the current draft. Retain that choice on upgrade. */
export function persistentServerOrder(match: MatchRecord, scheduledServer?: Side): boolean {
  if (match.serverOrderSwitched !== undefined) return match.serverOrderSwitched;
  if (match.draft.actualServer == null || match.firstServer === null) return false;
  const scheduled = scheduledServer ?? replayMatch(match.format, match.firstServer, match.events).score.current?.server;
  return scheduled !== undefined && match.draft.actualServer !== scheduled;
}

function preserveLegacyServerOrder(match: MatchRecord): MatchRecord {
  return match.serverOrderSwitched === undefined && match.draft.actualServer != null
    ? { ...match, serverOrderSwitched: persistentServerOrder(match) } : match;
}

/** Snapshot the server on each new point so later switches cannot rewrite its statistics. */
export function preparePointInput(match: MatchRecord, input: PointInput): PointInput {
  if (match.firstServer === null) throw new Error('Start the match before recording play.');
  const score = replayMatch(match.format, match.firstServer, match.events).score;
  if (score.status !== 'in-progress' || !score.current) throw new Error('The match is not in progress.');
  return { ...input, actualServer: input.actualServer ?? effectiveServer(score.current.server,
    persistentServerOrder(match, score.current.server), match.draft.actualServer) };
}

/** The form selects an actual player; the scoring engine stores its baseline service order. */
export function correctionForServerOrder(match: MatchRecord, correction: ScoreCorrection): ScoreCorrection {
  return { ...correction, nextServer: effectiveServer(correction.nextServer, persistentServerOrder(match)) };
}

export function selectStrokeInput(match: MatchRecord, value: Stroke, allowServeStroke: boolean): PointInput | null {
  const pending = match.draft.pending;
  if (!pending || 'winner' in pending) return null;
  if (value === 'serve') {
    if (!allowServeStroke) return null;
    return { type: pending.ending === 'winner' ? 'ace' : 'double-fault', actor: pending.actor, observations: match.draft.observations };
  }
  return { type: 'ending', actor: pending.actor, ending: pending.ending, stroke: value, observations: match.draft.observations };
}

export function serviceEndingInput(match: MatchRecord, type: 'ace' | 'double-fault', pointServer: Side): PointInput {
  const obs = match.draft.observations;
  const step = serveEntryStep(match.draft);
  const observations: PointObservations = type === 'ace' && match.mode === 'detailed'
    ? { ...obs, firstServe: step === 'second-serve' ? 'fault' : 'in', secondServe: step === 'second-serve' ? 'in' : 'unknown',
      returnResult: 'unknown', returnStroke: 'unknown' }
    : obs;
  return { type, actor: pointServer, observations };
}
