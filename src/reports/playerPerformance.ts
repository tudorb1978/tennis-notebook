import { replayMatch } from '../domain/history.ts';
import { summarisePoints } from '../domain/points.ts';
import type { MatchRecord } from '../storage/model.ts';
import { pointNoteSummary } from './pointNotes.ts';

export function playerPerformance(matches: readonly MatchRecord[], name: string, scope: string) {
  const projections = matches.filter(match => match.firstServer !== null)
    .map(match => replayMatch(match.format, match.firstServer, match.events));
  const points = projections.flatMap(match => match.points);
  const wins = projections.filter(match => match.score.winner === 0).length;
  const losses = projections.filter(match => match.score.winner === 1).length;
  return {
    name, scope, matchCount: projections.length, pointCount: points.length,
    wins, losses, undecided: projections.length - wins - losses,
    stats: summarisePoints(points).players[0],
    noteSummary: pointNoteSummary(points, [name, 'Opponents']),
    hasScoreCorrections: projections.some(match => match.hasScoreCorrections),
  };
}

export type PlayerPerformanceReport = ReturnType<typeof playerPerformance>;

export function performanceCountLabels(report: PlayerPerformanceReport): [string, string] {
  return [
    `${report.matchCount} ${report.matchCount === 1 ? 'match' : 'matches'} · ${report.pointCount} recorded ${report.pointCount === 1 ? 'point' : 'points'}`,
    `${report.wins} won · ${report.losses} lost · ${report.undecided} without a result`,
  ];
}
