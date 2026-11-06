import { changeLifecycle, correctCurrentStage, createScore, other } from './scoring.ts';
import type { LifecycleAction, MatchFormat, MatchScore, ScoreCorrection, Side } from './scoring.ts';
import { recordPoint, serveEndingIssue, summarisePoints } from './points.ts';
import type { PointInput, RecordedPoint } from './points.ts';

export type MatchEvent = { readonly id: string; readonly recordedAt?: string } & (
  | { readonly type: 'point'; readonly input: PointInput }
  | { readonly type: 'edit-point'; readonly targetId: string; readonly input: PointInput }
  | { readonly type: 'delete-point'; readonly targetId: string }
  | { readonly type: 'correction'; readonly correction: ScoreCorrection; readonly reason: string }
  | { readonly type: 'lifecycle'; readonly action: LifecycleAction }
  | { readonly type: 'undo'; readonly targetId: string }
);

function activeEvents(events: readonly MatchEvent[]): readonly MatchEvent[] {
  const ids = new Set<string>();
  const active: MatchEvent[] = [];
  for (const event of events) {
    if (!event.id.trim() || ids.has(event.id)) throw new Error('Match event IDs must be nonempty and unique.');
    if (event.recordedAt !== undefined && (typeof event.recordedAt !== 'string' || !Number.isFinite(Date.parse(event.recordedAt)))) {
      throw new Error('Invalid match event timestamp.');
    }
    ids.add(event.id);
    if (event.type === 'undo') {
      if (active.at(-1)?.id !== event.targetId) throw new Error('Undo must target the latest active action.');
      active.pop();
    } else active.push(event);
  }
  return active;
}

export interface MatchTiming {
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly pausedMs: number | null;
  /** Playing time accrued through the latest clock transition. */
  readonly playingMs: number | null;
  readonly runningSinceMs: number | null;
}

export interface MatchProjection {
  readonly score: MatchScore;
  readonly points: readonly RecordedPoint[];
  readonly pointEntries: readonly { id: string; input: PointInput; point: RecordedPoint }[];
  readonly stats: ReturnType<typeof summarisePoints>;
  readonly hasScoreCorrections: boolean;
  readonly canDeleteLastPoint: boolean;
  readonly lastActionId: string | null;
  readonly timing: MatchTiming | null;
}

function pointWinner(input: PointInput): Side {
  if (input.type === 'winner-only') return input.winner;
  if (input.type === 'ace' || (input.type === 'ending' && input.ending === 'winner')) return input.actor;
  return other(input.actor);
}

export function replayMatch(format: MatchFormat, firstServer: Side, events: readonly MatchEvent[], startedAt?: string): MatchProjection {
  let score = createScore(format, firstServer);
  const points: RecordedPoint[] = [];
  const pointEntries: { id: string; input: PointInput; point: RecordedPoint }[] = [];
  let hasScoreCorrections = false;
  let endedAt: string | null = null;
  const startedAtMs = startedAt === undefined ? NaN : Date.parse(startedAt);
  let lastChangeMs = startedAtMs;
  let pausedMs = 0;
  let timingComplete = Number.isFinite(lastChangeMs);
  const active = activeEvents(events);

  // Resolve point changes before replaying the score, keeping other actions in place.
  const livePoints: { id: string; input: PointInput; index: number }[] = [];
  const pointsById = new Map<string, (typeof livePoints)[number]>();
  let lastCorrectionIndex = -1;
  for (let i = 0; i < active.length; i++) {
    const event = active[i]!;
    if (event.type === 'point') {
      const point = { id: event.id, input: event.input, index: i };
      livePoints.push(point);
      pointsById.set(event.id, point);
    } else if (event.type === 'correction') {
      lastCorrectionIndex = i;
    } else if (event.type === 'edit-point') {
      const target = pointsById.get(event.targetId);
      if (!target) throw new Error('The point being edited is no longer available.');
      if (target.index < lastCorrectionIndex && pointWinner(target.input) !== pointWinner(event.input)) {
        throw new Error('Undo the later score correction before changing this point’s winner.');
      }
      target.input = event.input;
    } else if (event.type === 'delete-point') {
      const target = livePoints.at(-1);
      if (!target || target.id !== event.targetId) throw new Error('Only the latest recorded point can be deleted.');
      if (target.index < lastCorrectionIndex) throw new Error('Undo the later score correction before deleting this point.');
      livePoints.pop();
      pointsById.delete(target.id);
    }
  }
  for (const event of active) {
    const previousStatus = score.status;
    if (event.type === 'point') {
      const entry = pointsById.get(event.id);
      if (!entry) continue;
      const { input } = entry;
      const recorded = recordPoint(score, input);
      score = recorded.score;
      points.push(recorded.point);
      pointEntries.push({ id: event.id, input, point: recorded.point });
    } else if (event.type === 'correction') {
      if (!event.reason.trim()) throw new Error('A score correction needs a reason.');
      score = correctCurrentStage(score, event.correction);
      hasScoreCorrections = true;
    } else if (event.type === 'lifecycle') score = changeLifecycle(score, event.action);
    else if (event.type !== 'edit-point' && event.type !== 'delete-point') throw new Error('Unexpected match event.');

    if (startedAt === undefined || score.status === previousStatus) continue;
    const changedAtMs = event.recordedAt === undefined ? NaN : Date.parse(event.recordedAt);
    timingComplete = timingComplete && Number.isFinite(changedAtMs) && changedAtMs >= lastChangeMs;
    if (timingComplete && previousStatus === 'suspended') pausedMs += changedAtMs - lastChangeMs;
    lastChangeMs = changedAtMs;
    if (score.status !== 'in-progress' && score.status !== 'suspended') endedAt = event.recordedAt ?? null;
  }
  const hasDuration = timingComplete && endedAt !== null;
  const timing = startedAt === undefined ? null : {
    startedAt, endedAt,
    pausedMs: hasDuration ? pausedMs : null,
    playingMs: timingComplete ? lastChangeMs - startedAtMs - pausedMs : null,
    runningSinceMs: timingComplete && score.status === 'in-progress' ? lastChangeMs : null,
  };
  return { score, points, pointEntries, stats: summarisePoints(points), hasScoreCorrections,
    canDeleteLastPoint: (livePoints.at(-1)?.index ?? -1) > lastCorrectionIndex, lastActionId: active.at(-1)?.id ?? null, timing };
}

/** Validate before persistence; retrying the identical event cannot duplicate a point. */
export function appendEvent(format: MatchFormat, firstServer: Side, events: readonly MatchEvent[], event: MatchEvent): readonly MatchEvent[] {
  const existing = events.find(previous => previous.id === event.id);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(event)) return events;
    throw new Error('An event with this ID already has different contents.');
  }
  // Check new points here so historical matches remain readable during replay.
  if (event.type === 'point') {
    const issue = serveEndingIssue(event.input);
    if (issue) throw new Error(issue);
  }
  // JSON snapshots also isolate event inputs from later changes in UI drafts.
  const snapshot = JSON.parse(JSON.stringify(event)) as MatchEvent;
  const next = [...events, snapshot];
  replayMatch(format, firstServer, next);
  return next;
}

export function undoLast(format: MatchFormat, firstServer: Side, events: readonly MatchEvent[], undoId: string): readonly MatchEvent[] {
  const target = activeEvents(events).at(-1);
  if (!target) throw new Error('There is no action to undo.');
  return appendEvent(format, firstServer, events, { id: undoId, type: 'undo', targetId: target.id });
}
