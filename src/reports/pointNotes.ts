import { playerNoteGroups, playerNoteLabels, playerNotes, questionableCallSources, rallyLengthLabels, rallyLengthOf } from '../domain/pointNotes.ts';
import type { CallSource, PlayerNote } from '../domain/pointNotes.ts';
import type { PointObservations, RecordedPoint } from '../domain/points.ts';

export function callSourceLabel(source: CallSource, names: readonly [string, string]) {
  return typeof source === 'number' ? names[source] : source === 'official' ? 'Official' : 'Not known';
}

export interface PointNoteDetail {
  text: string;
  tone: 'rally' | 'positive' | 'negative' | 'neutral';
}

export function pointNoteDetails(observations: PointObservations | undefined, names: readonly [string, string]): PointNoteDetail[] {
  if (!observations) return [];
  const labels: PointNoteDetail[] = [];
  const rally = rallyLengthOf(observations);
  if (rally) labels.push({ text: rallyLengthLabels[rally], tone: 'rally' });
  for (const source of questionableCallSources(observations)) {
    labels.push({ text: `Questionable call by ${callSourceLabel(source, names)}`, tone: 'neutral' });
  }
  const callOutcomes: string[] = [];
  if (observations.disputed) callOutcomes.push('disputed');
  if (observations.callIncorrect) callOutcomes.push('incorrect');
  if (callOutcomes.length) {
    const source = observations.callBy;
    const callMaker = source === null || source === 'unknown' ? '' : ` · Call by ${callSourceLabel(source, names)}`;
    labels.push({ text: `Call was ${callOutcomes.join(' and ')}${callMaker}`, tone: 'neutral' });
  }
  for (const side of [0, 1] as const) {
    for (const note of observations.playerNotes?.[side] ?? []) {
      const group = playerNoteGroups.find(({ notes }) => notes.includes(note));
      labels.push({ text: `${names[side]} · ${playerNoteLabels[note]}`, tone: group?.title === 'Positive' ? 'positive' : 'negative' });
    }
  }
  return labels;
}

export function pointNoteLabels(observations: PointObservations | undefined, names: readonly [string, string]): string[] {
  return pointNoteDetails(observations, names).map(({ text }) => text);
}

export function pointNoteSummary(points: readonly RecordedPoint[], names: readonly [string, string]) {
  const rallies = { long: 0, 'very-long': 0, legacy: 0 };
  const callTallies = {
    'Questionable calls': { 0: 0, 1: 0, official: 0, unknown: 0 },
    'Disputed calls': { 0: 0, 1: 0, official: 0, unknown: 0 },
    'Incorrect calls': { 0: 0, 1: 0, official: 0, unknown: 0 },
  };
  const mindset = names.map(() => Object.fromEntries(playerNotes.map(note => [note, 0])) as Record<PlayerNote, number>) as [Record<PlayerNote, number>, Record<PlayerNote, number>];
  for (const { observations } of points) {
    const rally = rallyLengthOf(observations);
    if (rally) rallies[rally]++;
    for (const source of questionableCallSources(observations)) callTallies['Questionable calls'][source]++;
    if (observations?.disputed) callTallies['Disputed calls'][observations.callBy ?? 'unknown']++;
    if (observations?.callIncorrect) callTallies['Incorrect calls'][observations.callBy ?? 'unknown']++;
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
  for (const [title, calls] of Object.entries(callTallies)) {
    if (!Object.values(calls).some(Boolean)) continue;
    const lines = [`${names[0]} · ${calls[0]}`, `${names[1]} · ${calls[1]}`];
    if (calls.official) lines.push(`Official · ${calls.official}`);
    if (calls.unknown) lines.push(`Unattributed · ${calls.unknown}`);
    sections.push({ title, lines });
  }
  for (const { title, notes } of playerNoteGroups) {
    if (!notes.some(note => mindset[0][note] || mindset[1][note])) continue;
    const lines = notes.map(note => `${playerNoteLabels[note]} · ${names[0]} ${mindset[0][note]} · ${names[1]} ${mindset[1][note]}`);
    sections.push({ title: `${title} player observations`, lines });
  }
  return sections;
}
