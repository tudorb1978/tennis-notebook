import type { MatchFormat, SetRules, TieBreakRules } from './scoring.ts';

const setTieBreak: TieBreakRules = { pointsToWin: 7, winBy: 2, cap: null, serviceOrder: 'one-then-two' };
const matchTieBreak: TieBreakRules = { pointsToWin: 10, winBy: 2, cap: null, serviceOrder: 'one-then-two' };
const fast4: SetRules = { kind: 'set', gamesToWin: 4, winBy: 1, deuce: 'deciding-point', tieBreakAt: 3, tieBreak: setTieBreak };
const normal: SetRules = { kind: 'set', gamesToWin: 6, winBy: 2, deuce: 'advantage', tieBreakAt: 6, tieBreak: setTieBreak };

/** LTA FAST4 defaults. Each match receives its own rules snapshot. */
export const presets = {
  'fast4-single': {
    version: 1, id: 'fast4-single', name: 'One FAST4 set', serviceLet: 'replay', stages: [fast4],
  },
  'fast4-match-tiebreak': {
    version: 1, id: 'fast4-match-tiebreak', name: 'Two FAST4 sets and a deciding match tie-break', serviceLet: 'replay',
    stages: [fast4, fast4, { kind: 'match-tie-break', tieBreak: matchTieBreak }],
  },
  'normal-match-tiebreak': {
    version: 1, id: 'normal-match-tiebreak', name: 'Two normal sets and a deciding match tie-break', serviceLet: 'replay',
    stages: [normal, normal, { kind: 'match-tie-break', tieBreak: matchTieBreak }],
  },
  'normal-best-of-three': {
    version: 1, id: 'normal-best-of-three', name: 'Best of 3 normal sets', serviceLet: 'replay',
    stages: [normal, normal, normal],
  },
} as const satisfies Record<string, MatchFormat>;

export type PresetId = keyof typeof presets;
