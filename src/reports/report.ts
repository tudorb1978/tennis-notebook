import { replayMatch } from '../domain/history.ts';
import type { MatchTiming } from '../domain/history.ts';
import { strokes } from '../domain/points.ts';
import type { RecordedPoint } from '../domain/points.ts';
import { hasPointNotes, playerNoteLabels, questionableCallSources, rallyLengthLabels, rallyLengthOf } from '../domain/pointNotes.ts';
import { callSourceLabel, pointNoteLabels, pointNoteSummary } from './pointNotes.ts';
import { stagePointLabels } from '../domain/scoring.ts';
import type { MatchScore, Side, StageResult } from '../domain/scoring.ts';
import type { MatchRecord } from '../storage/model.ts';

export const strokeNames = { forehand: 'Forehand', backhand: 'Backhand', volley: 'Volley', overhead: 'Overhead', serve: 'Serve', other: 'Other', unknown: 'Not seen' };
export const endingNames = { winner: 'Winner', 'unforced-error': 'Unforced error', 'forced-error': 'Forced error', ace: 'Ace', 'double-fault': 'Double fault', unknown: 'Outcome only' };
export function pointScoreBefore({ context }: RecordedPoint): string {
  const points = stagePointLabels(context).join('–');
  if (context.phase === 'match-tie-break') return `Before point · Match tie-break ${points}`;
  const pointLabel = context.phase === 'set-tie-break' ? 'Tie-break' : 'Points';
  return `Before point · Set ${context.stage + 1} · Games ${context.games.join('–')} · ${pointLabel} ${points}`;
}
export function pointEndingLabel(point: RecordedPoint, names: readonly [string, string]): string {
  if (point.actor === null) return 'Ending not recorded';
  return [names[point.actor], endingNames[point.ending], point.stroke ? strokeNames[point.stroke] : ''].filter(Boolean).join(' · ');
}
export function stageLabel(result: StageResult): string { return result.kind === 'set' ? result.games.join('–') : `[${result.points.join('–')}]`; }
export function resultLabel(score: MatchScore): string {
  const completed = score.completedStages.map(stageLabel);
  if (score.current) completed.push(score.current.phase === 'match-tie-break' ? `[${score.current.points.join('–')}]` : score.current.games.join('–'));
  return completed.join('  ') || '0–0';
}
export function timingLabels(timing: MatchTiming | null): string[] {
  if (!timing) return [];
  const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });
  const labels = [`Started ${dateTime.format(new Date(timing.startedAt))}`];
  if (timing.endedAt) labels.push(`Finished ${dateTime.format(new Date(timing.endedAt))}`);
  if (timing.playingMs !== null && timing.pausedMs !== null) {
    const duration = (ms: number) => {
      const seconds = Math.floor(ms / 1000);
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor(seconds / 60) % 60;
      return [hours ? `${hours}h` : '', hours || minutes ? `${minutes}m` : '', `${seconds % 60}s`].filter(Boolean).join(' ');
    };
    labels.push(`Playing time ${duration(timing.playingMs)}`, `Paused ${duration(timing.pausedMs)}`);
  }
  return labels;
}
export function escapeHTML(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
export function reportHTML(record: MatchRecord): string {
  const { score, stats, points, pointEntries, hasScoreCorrections, timing } = replayMatch(record.format, record.firstServer, record.events, record.timingStartedAt);
  const times = timingLabels(timing);
  const e = escapeHTML;
  const names = [record.players[0].name, record.players[1].name] as const;
  const summary = pointNoteSummary(points, names).map(section =>
    `<h3>${e(section.title)}</h3><ul>${section.lines.map(line => `<li>${e(line)}</li>`).join('')}</ul>`,
  ).join('');
  const tables = ([0, 1] as const).map(side => {
    const player = stats.players[side];
    return `<h2>${e(record.players[side].name)}</h2><table><thead><tr><th>Stroke</th><th>Winners</th><th>Unforced errors</th><th>Forced errors</th></tr></thead><tbody>${strokes.map(stroke => {
      const counts = player.byStroke[stroke];
      return `<tr><th>${e(strokeNames[stroke])}</th><td>${counts.winners}</td><td>${counts.unforcedErrors}</td><td>${counts.forcedErrors}</td></tr>`;
    }).join('')}</tbody></table><p>Points won: ${player.pointsWon} · Aces: ${player.aces} · Double faults: ${player.doubleFaults} · First serves in: ${player.firstServesIn}/${player.firstServesObserved} observed · Second serves in: ${player.secondServesIn}/${player.secondServesObserved} observed · Returns in: ${player.returnsIn}/${player.returnsObserved} observed</p>`;
  }).join('');
  const notes = pointEntries.filter(({ point }) => hasPointNotes(point.observations)).map(({ point }) => {
    const obs = point.observations!;
    return `<li>${e(pointScoreBefore(point))}<br><strong>${e(names[point.winner])} won</strong><br>${e(pointEndingLabel(point, names))}<br>${[...pointNoteLabels(obs, names), obs.notes].filter(Boolean).map(e).join(' · ')}</li>`;
  }).join('');
  const matchNotes = record.matchNotes?.trim();
  const status = score.winner !== null ? `${record.players[score.winner].name} won${score.status === 'retired' ? ' by retirement' : ''}` : score.status === 'abandoned' ? 'Abandoned without a winner' : score.status === 'suspended' ? 'Suspended' : 'In progress';
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font:12px system-ui,sans-serif;color:#172d24}h1{font-size:24px;margin-bottom:6px}h2{font-size:17px;margin:22px 0 8px}p{line-height:1.5;color:#43594e}table{border-collapse:collapse;width:100%;break-inside:avoid}th,td{padding:8px;border-bottom:1px solid #cbd8cf;text-align:center}th:first-child{text-align:left}li{margin-bottom:10px;line-height:1.5}.score{font-size:22px;font-weight:600}.match-notes{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>${e(record.players[0].name)} vs ${e(record.players[1].name)}</h1><p>${[record.date, record.group, record.round, record.venue, record.surface, record.courtSetting, record.conditions].filter(Boolean).map(e).join(' · ')}</p><div class="score">${e(resultLabel(score))}</div><p>${e(status)} · ${e(record.format.name)}</p>${times.length ? `<p>${times.map(e).join(' · ')}</p>` : ''}<h2>Winners and errors by stroke</h2>${tables}<p>Aces count as serve winners; double faults are shown separately. Endings recorded: ${stats.coverage.endings}/${stats.coverage.points}; stroke recorded: ${stats.coverage.strokes}/${stats.coverage.endings} classified endings.${hasScoreCorrections ? ' The score contains manual corrections; point statistics cover recorded points only.' : ''}</p>${matchNotes ? `<h2>Match notes</h2><p class="match-notes">${e(matchNotes)}</p>` : ''}${summary ? '<h2>Point notes summary</h2>' + summary : ''}${notes ? '<h2>Notes and notable points</h2><p>Scores follow the player order above.</p><ul>' + notes + '</ul>' : ''}</body></html>`;
}
function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // Spreadsheet apps must treat names and notes as text, never as formulas.
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function reportCSV(record: MatchRecord): string {
  const { pointEntries } = replayMatch(record.format, record.firstServer, record.events);
  const names = [record.players[0].name, record.players[1].name] as const;
  const name = (side: Side | null) => side === null ? '' : record.players[side].name;
  const rows: unknown[][] = [['Point', 'Date', 'Group', 'Stage', 'Games before', 'Points before', 'Server', 'Winner', 'Ending player', 'Ending', 'Stroke', 'First serve', 'Second serve', 'Return stroke', 'Return result', 'Long rally', 'Questionable call', 'Disputed', 'Call by', 'Notes', 'Rally length estimate', 'Questionable call by', 'Tracked player observations', 'Opponent observations']];
  pointEntries.forEach(({ point: p }, index) => {
    const obs = p.observations;
    const rally = rallyLengthOf(obs);
    const calls = questionableCallSources(obs);
    rows.push([index + 1, record.date, record.group, p.context.stage + 1, p.context.games.join('-'), p.context.points.join('-'), name(p.server), name(p.winner), name(p.actor), endingNames[p.ending], p.stroke ? strokeNames[p.stroke] : '', obs?.firstServe, obs?.secondServe, obs?.returnStroke, obs?.returnResult, obs ? rally !== null : undefined, obs ? calls.length > 0 : undefined, obs?.disputed, typeof obs?.callBy === 'number' ? name(obs.callBy) : obs?.callBy, obs?.notes,
      rally ? rallyLengthLabels[rally] : '',
      calls.map(source => callSourceLabel(source, names)).join(' | '),
      ...([0, 1] as const).map(side => obs?.playerNotes?.[side].map(note => playerNoteLabels[note]).join(' | ')),
    ]);
  });
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
