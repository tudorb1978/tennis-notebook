import { playerNoteGroups, playerNoteLabels, playerNotes, questionableCallSources, rallyLengthLabels, rallyLengthOf } from '../domain/pointNotes.ts';
import type { CallSource, PlayerNote } from '../domain/pointNotes.ts';
import type { PointObservations, RecordedPoint } from '../domain/points.ts';

export function callSourceLabel(source: CallSource, names: readonly [string, string]) {
  return typeof source === 'number' ? names[source] : source === 'official' ? 'Official' : 'Not known';
}

export function pointNoteLabels(observations: PointObservations | undefined, names: readonly [string, string]): string[] {
  if (!observations) return [];
  const labels: string[] = [];
  const rally = rallyLengthOf(observations);
  if (rally) labels.push(rallyLengthLabels[rally]);
  for (const source of questionableCallSources(observations)) {
    labels.push(`Questionable call by ${callSourceLabel(source, names)}`);
  }
  if (observations.disputed) {
    const source = observations.callBy;
    labels.push(source === null ? 'Disputed outcome' : `Disputed outcome · Call by ${callSourceLabel(source, names)}`);
  }
  for (const side of [0, 1] as const) {
    for (const note of observations.playerNotes?.[side] ?? []) {
      labels.push(`${names[side]} · ${playerNoteLabels[note]}`);
    }
  }
  return labels;
}

export function pointNoteSummary(points: readonly RecordedPoint[], names: readonly [string, string]) {
  const rallies = { long: 0, 'very-long': 0, legacy: 0 };
  const calls = { 0: 0, 1: 0, official: 0, unknown: 0 };
  const mindset = names.map(() => Object.fromEntries(playerNotes.map(note => [note, 0])) as Record<PlayerNote, number>) as [Record<PlayerNote, number>, Record<PlayerNote, number>];
  for (const { observations } of points) {
    const rally = rallyLengthOf(observations);
    if (rally) rallies[rally]++;
    for (const source of questionableCallSources(observations)) calls[source]++;
    for (const side of [0, 1] as const) {
      for (const note of observations?.playerNotes?.[side] ?? []) mindset[side][note]++;
    }
  }

  const sections: { title: string; lines: string[] }[] = [];
  if (rallies.long || rallies['very-long'] || rallies.legacy) {
    const lines = (['long', 'very-long'] as const).map(rally => `${rallyLengthLabels[rally]} · ${rallies[rally]}`);
    if (rallies.legacy) lines.push(`${rallyLengthLabels.legacy} · ${rallies.legacy}`);
    sections.push({ title: 'Rally estimates', lines });
  }
  if (calls[0] || calls[1] || calls.official || calls.unknown) {
    const lines = [`${names[0]} · ${calls[0]}`, `${names[1]} · ${calls[1]}`];
    if (calls.official) lines.push(`Official · ${calls.official}`);
    if (calls.unknown) lines.push(`Not known · ${calls.unknown}`);
    sections.push({ title: 'Questionable calls', lines });
  }
  for (const { title, notes } of playerNoteGroups) {
    if (!notes.some(note => mindset[0][note] || mindset[1][note])) continue;
    const lines = notes.map(note => `${playerNoteLabels[note]} · ${names[0]} ${mindset[0][note]} · ${names[1]} ${mindset[1][note]}`);
    sections.push({ title: `${title} player observations`, lines });
  }
  return sections;
}
