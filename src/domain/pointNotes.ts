import type { PointObservations } from './points.ts';
import type { Side } from './scoring.ts';

export const rallyLengthLabels = {
  long: 'Long rally (est. over 15 shots)',
  'very-long': 'Very long rally (est. over 25 shots)',
  legacy: 'Long rally (older tag)',
} as const;
export type RallyLength = Exclude<keyof typeof rallyLengthLabels, 'legacy'>;

const positivePlayerNotes = {
  'great-effort': 'Great effort',
  'positive-attitude': 'Positive attitude',
  'positive-body-language': 'Positive body language',
  'calming-techniques': 'Uses calming techniques',
  'resets-after-setback': 'Resets after a setback',
} as const;
const negativePlayerNotes = {
  frustration: 'Anger or frustration (racket smashing or tears)',
  'body-language': 'Bad body language',
  'giving-up': 'Looks like giving up',
  'low-effort': 'Doesn’t show enough effort',
  tired: 'Looks tired',
} as const;
export const playerNoteLabels = { ...positivePlayerNotes, ...negativePlayerNotes };
export type PlayerNote = keyof typeof playerNoteLabels;
export const playerNoteGroups = [
  { title: 'Positive', notes: Object.keys(positivePlayerNotes) as PlayerNote[] },
  { title: 'Negative', notes: Object.keys(negativePlayerNotes) as PlayerNote[] },
] as const;
export const playerNotes = Object.keys(playerNoteLabels) as PlayerNote[];
export type CallSource = Side | 'official' | 'unknown';

export function rallyLengthOf(observations?: PointObservations) {
  return observations?.rallyLength !== undefined ? observations.rallyLength : observations?.longRally ? 'legacy' : null;
}

export function questionableCallSources(observations?: PointObservations): readonly CallSource[] {
  if (observations?.callIncorrect !== undefined) {
    return !observations.disputed && !observations.callIncorrect && observations.callBy !== null ? [observations.callBy] : [];
  }
  return observations?.questionableCallsBy ?? (observations?.questionableCall ? [observations.callBy ?? 'unknown'] : []);
}

export function hasPointNotes(observations?: PointObservations) {
  return Boolean(observations && (observations.notes || observations.disputed || observations.callIncorrect || rallyLengthOf(observations)
    || questionableCallSources(observations).length || observations.playerNotes?.some(notes => notes.length > 0)));
}

function uniqueAllowed(values: unknown, allowed: readonly unknown[]): boolean {
  return Array.isArray(values) && values.length <= allowed.length && new Set(values).size === values.length
    && values.every(value => allowed.includes(value));
}

export function validatePointNoteOptions(rallyLength: unknown, calls: unknown, notes: unknown, callIncorrect: unknown) {
  if (callIncorrect !== undefined && typeof callIncorrect !== 'boolean') {
    throw new Error('Invalid incorrect call flag.');
  }
  if (rallyLength !== undefined && rallyLength !== null && rallyLength !== 'long' && rallyLength !== 'very-long') {
    throw new Error('Invalid rally estimate.');
  }
  if (calls !== undefined && !uniqueAllowed(calls, [0, 1, 'official', 'unknown'])) {
    throw new Error('Invalid questionable call attribution.');
  }
  if (notes !== undefined && (!Array.isArray(notes) || notes.length !== 2 || !notes.every(side => uniqueAllowed(side, playerNotes)))) {
    throw new Error('Invalid player observations.');
  }
}
