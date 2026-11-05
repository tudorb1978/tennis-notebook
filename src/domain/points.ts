import { awardPoint, other } from './scoring.ts';
import type { MatchScore, Side } from './scoring.ts';
import { validatePointNoteOptions } from './pointNotes.ts';
import type { CallSource, PlayerNote, RallyLength } from './pointNotes.ts';

export const strokes = ['forehand', 'backhand', 'volley', 'overhead', 'serve', 'other', 'unknown'] as const;
export type Stroke = typeof strokes[number];
export type Ending = 'winner' | 'unforced-error' | 'forced-error' | 'ace' | 'double-fault' | 'unknown';
export interface PointObservations {
  readonly firstServe: 'in' | 'fault' | 'unknown';
  readonly secondServe: 'in' | 'fault' | 'unknown';
  readonly returnStroke: 'forehand' | 'backhand' | 'other' | 'unknown';
  readonly returnResult: 'in' | 'error' | 'unknown';
  readonly longRally: boolean;
  readonly questionableCall: boolean;
  readonly disputed: boolean;
  readonly callBy: CallSource | null;
  readonly notes: string;
  readonly rallyLength?: RallyLength | null;
  readonly questionableCallsBy?: readonly CallSource[];
  readonly playerNotes?: readonly [readonly PlayerNote[], readonly PlayerNote[]];
}
export function emptyObservations(): PointObservations {
  return { firstServe: 'unknown', secondServe: 'unknown', returnStroke: 'unknown', returnResult: 'unknown',
    longRally: false, questionableCall: false, disputed: false, callBy: null, notes: '' };
}
export type PointInput = (
  | { readonly type: 'ending'; readonly actor: Side; readonly ending: 'winner' | 'unforced-error' | 'forced-error'; readonly stroke: Stroke }
  | { readonly type: 'ace' | 'double-fault'; readonly actor: Side }
  | { readonly type: 'winner-only'; readonly winner: Side }
) & { readonly observations?: PointObservations; readonly actualServer?: Side };

export function serveWasIn(observations?: PointObservations): boolean {
  return observations?.firstServe === 'in' || observations?.secondServe === 'in';
}

export function serveEndingIssue(input: PointInput): string | null {
  if (!serveWasIn(input.observations)) return null;
  if (input.type === 'double-fault') return 'A serve marked In cannot be a double fault. Correct the serve details first.';
  if (input.type === 'ending' && input.stroke === 'serve' && input.ending !== 'winner') {
    return 'A serve marked In cannot end the point as a serve error. Choose a different stroke or correct the serve details.';
  }
  return null;
}

export interface RecordedPoint {
  readonly context: { readonly stage: number; readonly games: readonly [number, number]; readonly points: readonly [number, number]; readonly phase: string };
  readonly server: Side;
  readonly servedOutOfTurn: boolean;
  readonly winner: Side;
  readonly actor: Side | null;
  readonly ending: Ending;
  readonly stroke: Stroke | null;
  readonly observations?: PointObservations;
}

export function recordPoint(score: MatchScore, input: PointInput): { score: MatchScore; point: RecordedPoint } {
  if (score.status !== 'in-progress' || !score.current) throw new Error('The match is not in progress.');
  const server = input.actualServer === undefined ? score.current.server : input.actualServer;
  if (server !== 0 && server !== 1) throw new Error('Invalid server for this point.');
  let point: Omit<RecordedPoint, 'context' | 'servedOutOfTurn'>;
  if (input.type === 'winner-only') {
    point = { server, winner: input.winner, actor: null, ending: 'unknown', stroke: null };
  } else {
    if (input.actor !== 0 && input.actor !== 1) throw new Error('Invalid ending player.');
    if (input.type === 'ending') {
      if (!['winner', 'unforced-error', 'forced-error'].includes(input.ending)) throw new Error('Invalid point ending.');
      if (!strokes.includes(input.stroke)) throw new Error('Choose a stroke or explicitly record that it was not seen.');
      if (input.stroke === 'serve' && input.actor !== server) throw new Error('Only the server can play a serve.');
      point = { server, actor: input.actor, ending: input.ending, stroke: input.stroke,
        winner: input.ending === 'winner' ? input.actor : other(input.actor) };
    } else {
      if (!['ace', 'double-fault'].includes(input.type)) throw new Error('Invalid service outcome.');
      if (input.actor !== server) throw new Error('A service outcome must belong to the current server.');
      point = { server, actor: input.actor, ending: input.type, stroke: 'serve',
        winner: input.type === 'ace' ? input.actor : other(input.actor) };
    }
  }
  if (input.observations || input.type === 'double-fault') {
    let obs = { ...(input.observations ?? emptyObservations()) };
    if (input.type === 'double-fault') obs = { ...obs, firstServe: 'fault', secondServe: 'fault', returnResult: 'unknown', returnStroke: 'unknown' };
    if (input.type === 'ace' && obs.firstServe === 'fault') obs.secondServe = 'in';
    if (!['in', 'fault', 'unknown'].includes(obs.firstServe) || !['in', 'fault', 'unknown'].includes(obs.secondServe)) throw new Error('Invalid serve observation.');
    if (!['forehand', 'backhand', 'other', 'unknown'].includes(obs.returnStroke) || !['in', 'error', 'unknown'].includes(obs.returnResult)) throw new Error('Invalid return observation.');
    if (obs.firstServe === 'in' && obs.secondServe !== 'unknown') throw new Error('A first serve in cannot also have a second serve.');
    if (obs.secondServe !== 'unknown' && obs.firstServe !== 'fault') throw new Error('Record the first-serve fault before the second serve.');
    if (input.type === 'ace' && (obs.returnStroke !== 'unknown' || obs.returnResult !== 'unknown')) throw new Error('An ace cannot also have a recorded return.');
    if (input.type !== 'double-fault' && obs.secondServe === 'fault') throw new Error('Two service faults must be recorded as a double fault.');
    if (obs.callBy !== null && obs.callBy !== 0 && obs.callBy !== 1 && !['official', 'unknown'].includes(obs.callBy)) throw new Error('Invalid call attribution.');
    if (typeof obs.notes !== 'string' || obs.notes.length > 2000) throw new Error('Notes must contain at most 2000 characters.');
    if ([obs.longRally, obs.questionableCall, obs.disputed].some(v => typeof v !== 'boolean')) throw new Error('Invalid point tags.');
    validatePointNoteOptions(obs.rallyLength, obs.questionableCallsBy, obs.playerNotes);
    point = { ...point, observations: obs };
  }
  return { score: awardPoint(score, point.winner), point: { ...point, servedOutOfTurn: server !== score.current.server, context: { stage: score.current.index,
    games: score.current.games, points: score.current.points, phase: score.current.phase } } };
}

export interface StrokeCounts { winners: number; unforcedErrors: number; forcedErrors: number }
export interface PlayerStats {
  pointsWon: number;
  aces: number;
  doubleFaults: number;
  firstServesObserved: number;
  firstServesIn: number;
  secondServesObserved: number;
  secondServesIn: number;
  returnsObserved: number;
  returnsIn: number;
  byStroke: Record<Stroke, StrokeCounts>;
}

export function summarisePoints(points: readonly RecordedPoint[]): {
  players: readonly [PlayerStats, PlayerStats];
  coverage: { points: number; endings: number; strokes: number };
} {
  function empty(): PlayerStats {
    return { pointsWon: 0, aces: 0, doubleFaults: 0, firstServesObserved: 0, firstServesIn: 0,
      secondServesObserved: 0, secondServesIn: 0, returnsObserved: 0, returnsIn: 0,
      byStroke: Object.fromEntries(strokes.map(stroke => [stroke, { winners: 0, unforcedErrors: 0, forcedErrors: 0 }])) as Record<Stroke, StrokeCounts> };
  }
  const players: [PlayerStats, PlayerStats] = [empty(), empty()];
  const coverage = { points: points.length, endings: 0, strokes: 0 };
  for (const point of points) {
    players[point.winner].pointsWon++;
    const serve = players[point.server];
    const receiver = players[other(point.server)];
    const obs = point.observations;
    if (obs?.firstServe && obs.firstServe !== 'unknown') { serve.firstServesObserved++; if (obs.firstServe === 'in') serve.firstServesIn++; }
    if (obs?.secondServe && obs.secondServe !== 'unknown') { serve.secondServesObserved++; if (obs.secondServe === 'in') serve.secondServesIn++; }
    if (obs?.returnResult && obs.returnResult !== 'unknown') { receiver.returnsObserved++; if (obs.returnResult === 'in') receiver.returnsIn++; }
    if (point.ending === 'unknown' || point.actor === null || point.stroke === null) continue;
    coverage.endings++;
    if (point.stroke !== 'unknown') coverage.strokes++;
    const stats = players[point.actor];
    if (point.ending === 'ace') stats.aces++;
    if (point.ending === 'double-fault') stats.doubleFaults++;
    else if (point.ending === 'winner' || point.ending === 'ace') stats.byStroke[point.stroke].winners++;
    else if (point.ending === 'unforced-error') stats.byStroke[point.stroke].unforcedErrors++;
    else if (point.ending === 'forced-error') stats.byStroke[point.stroke].forcedErrors++;
  }
  return { players, coverage };
}
