import type { MatchProjection } from '../domain/history.ts';
import { stagePointLabels } from '../domain/scoring.ts';
import type { Side } from '../domain/scoring.ts';
import { resultLabel, setTieBreakLabel } from '../reports/report.ts';

export interface PointSavedSummary {
  score: string;
  context: string;
  next: string;
  winnerSide: Side | null;
}

export function pointSavedSummary(projection: MatchProjection, names: readonly [string, string]): PointSavedSummary {
  const { score, points } = projection;
  const lastPoint = points.at(-1);
  const winnerSide = lastPoint?.winner ?? null;
  const current = score.current;
  if (score.status === 'completed' || !current) {
    return {
      score: resultLabel(score),
      context: score.winner === null ? 'Match complete' : `${names[score.winner]} wins`,
      next: 'Match complete',
      winnerSide,
    };
  }

  const completedSet = lastPoint && score.completedStages[lastPoint.context.stage];
  if (completedSet) {
    return {
      score: (completedSet.kind === 'set' ? completedSet.games : completedSet.points).join('–') + setTieBreakLabel(completedSet),
      context: `Set ${lastPoint.context.stage + 1} to ${names[completedSet.winner]}`,
      next: current.phase === 'match-tie-break' ? 'Match tie-break next' : 'Next set',
      winnerSide,
    };
  }

  const stageLabel = `Set ${current.index + 1}`;
  const games = current.games.join('–');
  const gameEnded = lastPoint?.context.stage === current.index
    && lastPoint.context.games.some((value, side) => value !== current.games[side]);
  if (gameEnded) {
    return {
      score: games,
      context: `Game to ${names[lastPoint.winner]} · ${stageLabel}`,
      next: current.phase === 'set-tie-break' ? 'Tie-break next' : 'Next game',
      winnerSide,
    };
  }

  return {
    score: stagePointLabels(current).join('–'),
    context: current.phase === 'match-tie-break' ? 'Match tie-break'
      : current.phase === 'set-tie-break' ? `${stageLabel} · Tie-break at ${games}`
      : `${stageLabel} · Games ${games}`,
    next: 'Next point',
    winnerSide,
  };
}
