import type { MatchProjection } from '../domain/history.ts';
import { summarisePoints } from '../domain/points.ts';
import type { RecordedPoint } from '../domain/points.ts';
import { stagePointLabels } from '../domain/scoring.ts';
import type { Side } from '../domain/scoring.ts';
import { pointNoteDetails } from './pointNotes.ts';
import type { PointNoteDetail } from './pointNotes.ts';
import { pointEndingLabel, pointScoreBefore, setTieBreakLabel, strokeNames } from './report.ts';

export interface PointByPointEntry {
  number: number;
  scoreBefore: string;
  winnerSide: Side;
  ending: string;
  serve: string;
  pressure: string[];
  labels: PointNoteDetail[];
  notes: string;
}

export interface PointByPointStage {
  title: string;
  score: string;
  setTieBreak: string;
  status: 'completed' | 'in-progress' | 'paused' | 'unfinished';
  points: PointByPointEntry[];
  stats: ReturnType<typeof summarisePoints>;
}

function serveDescription(point: RecordedPoint, names: readonly [string, string]): string {
  const { observations, server, servedOutOfTurn } = point;
  const details = [`${names[server]} served${servedOutOfTurn ? ' out of turn' : ''}`];
  if (observations) {
    const { firstServe, secondServe, returnResult, returnStroke } = observations;
    if (firstServe !== 'unknown') details.push(`First serve ${firstServe}`);
    if (secondServe !== 'unknown') details.push(`Second serve ${secondServe}`);
    if (returnResult !== 'unknown' || returnStroke !== 'unknown') {
      const result = returnResult === 'in' ? ' in' : returnResult === 'error' ? ' missed' : '';
      const stroke = returnStroke === 'unknown' ? '' : ` (${strokeNames[returnStroke].toLowerCase()})`;
      details.push(`Return${result}${stroke}`);
    }
  }
  return details.join(' · ');
}

function pointEntry(point: RecordedPoint, number: number, names: readonly [string, string]): PointByPointEntry {
  const { observations } = point;
  return {
    number,
    scoreBefore: pointScoreBefore(point, true),
    winnerSide: point.winner,
    ending: pointEndingLabel(point, names),
    serve: serveDescription(point, names),
    pressure: point.stakes.flatMap((stakes, side) => stakes
      .filter(stake => stake !== 'set' || !stakes.includes('match'))
      .map(stake => `${stake[0]!.toUpperCase()}${stake.slice(1)} point for ${names[side]}`)),
    labels: pointNoteDetails(observations, names),
    notes: observations?.notes.trim() ?? '',
  };
}

export function buildPointByPoint(projection: MatchProjection, names: readonly [string, string]): PointByPointStage[] {
  const { score, points } = projection;
  const buckets = score.format.stages.map(() => ({
    recorded: [] as RecordedPoint[],
    entries: [] as PointByPointEntry[],
  }));
  for (const [index, point] of points.entries()) {
    const stage = buckets[point.context.stage]!;
    stage.recorded.push(point);
    stage.entries.push(pointEntry(point, index + 1, names));
  }
  const stageData = (index: number) => {
    const { recorded, entries } = buckets[index]!;
    return { points: entries, stats: summarisePoints(recorded) };
  };
  const stages: PointByPointStage[] = score.completedStages.map((result, index) => ({
    title: result.kind === 'match-tie-break' ? 'Match tie-break' : `Set ${index + 1}`,
    score: (result.kind === 'match-tie-break' ? result.points : result.games).join('–'),
    setTieBreak: setTieBreakLabel(result),
    status: 'completed',
    ...stageData(index),
  }));
  const current = score.current;
  if (current && (buckets[current.index]!.recorded.length || current.games.some(Boolean) || current.points.some(Boolean))) {
    const { index, phase, games, points } = current;
    const gameScore = points.some(Boolean) ? ` · ${phase === 'set-tie-break' ? 'Tie-break' : 'Points'} ${stagePointLabels(current).join('–')}` : '';
    stages.push({
      title: phase === 'match-tie-break' ? 'Match tie-break' : `Set ${index + 1}`,
      score: phase === 'match-tie-break' ? points.join('–') : games.join('–') + gameScore,
      setTieBreak: '',
      status: score.status === 'in-progress' ? 'in-progress' : score.status === 'suspended' ? 'paused' : 'unfinished',
      ...stageData(index),
    });
  }
  return stages;
}
