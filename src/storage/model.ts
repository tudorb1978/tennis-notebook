import { replayMatch } from '../domain/history.ts';
import type { MatchEvent } from '../domain/history.ts';
import { emptyObservations } from '../domain/points.ts';
import type { PointObservations } from '../domain/points.ts';
import type { MatchFormat, Side } from '../domain/scoring.ts';
import { validatePointNoteOptions } from '../domain/pointNotes.ts';
import { isMatchDate } from '../domain/matchDates.ts';

export interface PlayerProfile { id: string; name: string; createdAt: string }
export interface PlayerSnapshot { id: string | null; name: string }
export type RecordingMode = 'score' | 'endings' | 'detailed';
export interface PendingEnding { actor: Side; ending: 'winner' | 'unforced-error' | 'forced-error' }
export interface MatchDraft { observations: PointObservations; pending: PendingEnding | { winner: Side } | null; lets: number; actualServer?: Side | null }
export interface MatchRecord {
  schemaVersion: 1;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  timingStartedAt?: string;
  players: [PlayerSnapshot, PlayerSnapshot];
  date: string;
  group: string;
  eventId?: string;
  round: string;
  venue: string;
  surface: string;
  courtSetting?: '' | 'Indoor' | 'Outdoor';
  conditions: string;
  format: MatchFormat;
  firstServer: Side;
  mode: RecordingMode;
  events: readonly MatchEvent[];
  draft: MatchDraft;
}
export function emptyDraft(): MatchDraft { return { observations: emptyObservations(), pending: null, lets: 0 }; }
export interface Backup { schemaVersion: 1; application: 'tennis-tracker'; exportedAt: string; players: PlayerProfile[]; matches: MatchRecord[] }

function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a record.');
}
function text(value: unknown, max: number, required = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error('Invalid text in saved data.');
}
function id(value: unknown): asserts value is string { text(value, 100, true); if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/.test(value)) throw new Error('Invalid record identifier.'); }
function timestamp(value: unknown): void { text(value, 40, true); if (!Number.isFinite(Date.parse(value))) throw new Error('Invalid saved timestamp.'); }
export function validatePlayer(value: unknown): asserts value is PlayerProfile {
  object(value); id(value.id); text(value.name, 80, true); timestamp(value.createdAt);
}
export function validateMatch(value: unknown): asserts value is MatchRecord {
  object(value);
  if (value.schemaVersion !== 1) throw new Error('Unsupported match version.');
  id(value.id); timestamp(value.createdAt); timestamp(value.updatedAt);
  if (value.timingStartedAt !== undefined) timestamp(value.timingStartedAt);
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) throw new Error('Invalid match revision.');
  if (!Array.isArray(value.players) || value.players.length !== 2) throw new Error('A match needs two sides.');
  for (const player of value.players) { object(player); if (player.id !== null) id(player.id); text(player.name, 80, true); }
  if (value.players[0].id === null) throw new Error('The tracked player needs a profile.');
  text(value.date, 10, true);
  if (!isMatchDate(value.date)) throw new Error('Invalid match date.');
  for (const key of ['group', 'round', 'venue', 'surface', 'conditions']) text(value[key], 200);
  if (value.eventId !== undefined) text(value.eventId, 250, true);
  if (value.courtSetting !== undefined && value.courtSetting !== '' && value.courtSetting !== 'Indoor' && value.courtSetting !== 'Outdoor') {
    throw new Error('Invalid court setting.');
  }
  if (!['score', 'endings', 'detailed'].includes(value.mode as string)) throw new Error('Invalid recording mode.');
  if (!Array.isArray(value.events) || value.events.length > 20000) throw new Error('Invalid match history.');
  object(value.draft); object(value.draft.observations);
  if (value.draft.actualServer !== undefined && value.draft.actualServer !== null && value.draft.actualServer !== 0 && value.draft.actualServer !== 1) {
    throw new Error('Invalid server for the pending point.');
  }
  if (!Number.isSafeInteger(value.draft.lets) || (value.draft.lets as number) < 0) throw new Error('Invalid draft.');
  if (value.draft.pending !== null) {
    object(value.draft.pending);
    if ('winner' in value.draft.pending) {
      if (value.draft.pending.winner !== 0 && value.draft.pending.winner !== 1) throw new Error('Invalid pending point winner.');
    } else if (![0, 1].includes(value.draft.pending.actor as number) || !['winner', 'unforced-error', 'forced-error'].includes(value.draft.pending.ending as string)) {
      throw new Error('Invalid pending stroke.');
    }
  }
  const obs = value.draft.observations;
  if (!['in', 'fault', 'unknown'].includes(obs.firstServe as string) || !['in', 'fault', 'unknown'].includes(obs.secondServe as string)) throw new Error('Invalid draft serve.');
  if (obs.secondServe !== 'unknown' && obs.firstServe !== 'fault') throw new Error('Inconsistent draft serve observations.');
  if (obs.secondServe === 'fault') throw new Error('A double fault must be recorded as a completed point.');
  if (!['forehand', 'backhand', 'other', 'unknown'].includes(obs.returnStroke as string) || !['in', 'error', 'unknown'].includes(obs.returnResult as string)) throw new Error('Invalid draft return.');
  if ([obs.longRally, obs.questionableCall, obs.disputed].some(v => typeof v !== 'boolean')) throw new Error('Invalid draft tags.');
  validatePointNoteOptions(obs.rallyLength, obs.questionableCallsBy, obs.playerNotes);
  if (![null, 0, 1, 'official', 'unknown'].includes(obs.callBy as null | number | string)) throw new Error('Invalid call attribution.');
  text(obs.notes, 2000);
  const match = value as unknown as MatchRecord;
  replayMatch(match.format, match.firstServer, match.events);
}

export function parseBackup(input: string): Backup {
  if (input.length > 20_000_000) throw new Error('This backup is too large to import.');
  try {
    const value: unknown = JSON.parse(input); object(value);
    if (value.application !== 'tennis-tracker' || value.schemaVersion !== 1) throw new Error('Unsupported backup format.');
    timestamp(value.exportedAt);
    if (!Array.isArray(value.players) || !Array.isArray(value.matches) || value.players.length > 10000 || value.matches.length > 10000) throw new Error('Invalid backup contents.');
    const ids = new Set<string>();
    for (const player of value.players) { validatePlayer(player); if (ids.has(player.id)) throw new Error('Duplicate player ID.'); ids.add(player.id); }
    const matchIds = new Set<string>();
    for (const match of value.matches) {
      validateMatch(match);
      if (matchIds.has(match.id)) throw new Error('Duplicate match ID.'); matchIds.add(match.id);
      if (!ids.has(match.players[0].id!)) throw new Error('A tracked player profile is missing from the backup.');
    }
    return value as unknown as Backup;
  } catch (error) {
    throw new Error(`Cannot restore this backup: ${error instanceof Error ? error.message : 'invalid file'}`);
  }
}
