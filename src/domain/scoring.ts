export type Side = 0 | 1;
export type Pair = readonly [number, number];

export interface TieBreakRules {
  readonly pointsToWin: number;
  readonly winBy: number;
  /** Null means play on until the winning margin is achieved. */
  readonly cap: number | null;
  readonly serviceOrder: 'one-then-two';
}

export interface SetRules {
  readonly kind: 'set';
  readonly gamesToWin: number;
  readonly winBy: number;
  readonly deuce: 'advantage' | 'deciding-point';
  readonly tieBreakAt: number | null;
  readonly tieBreak: TieBreakRules | null;
}

export interface MatchTieBreakRules {
  readonly kind: 'match-tie-break';
  readonly tieBreak: TieBreakRules;
}

export type StageRules = SetRules | MatchTieBreakRules;

export interface MatchFormat {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  /** A deciding match tie-break is a stage, never an ordinary set of games. */
  readonly stages: readonly StageRules[];
  readonly serviceLet: 'replay' | 'play-on';
}

export type StageResult =
  | { readonly kind: 'set'; readonly winner: Side; readonly games: Pair; readonly tieBreakPoints: Pair | null }
  | { readonly kind: 'match-tie-break'; readonly winner: Side; readonly points: Pair };

export interface CurrentStage {
  readonly index: number;
  readonly phase: 'game' | 'set-tie-break' | 'match-tie-break';
  readonly games: Pair;
  readonly points: Pair;
  readonly server: Side;
  readonly tieBreakFirstServer: Side | null;
}

export interface MatchScore {
  readonly engineVersion: 1;
  readonly format: MatchFormat;
  readonly firstServer: Side;
  readonly completedStages: readonly StageResult[];
  readonly stagesWon: Pair;
  readonly current: CurrentStage | null;
  readonly status: 'in-progress' | 'completed' | 'suspended' | 'retired' | 'abandoned';
  readonly winner: Side | null;
}

export function other(side: Side): Side { return side === 0 ? 1 : 0; }

function assertSide(side: unknown): asserts side is Side {
  if (side !== 0 && side !== 1) throw new Error('Player side must be 0 or 1.');
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
}

function validateTieBreak(rules: TieBreakRules): void {
  positiveInteger(rules.pointsToWin, 'Tie-break target');
  positiveInteger(rules.winBy, 'Tie-break winning margin');
  if (rules.cap !== null) {
    positiveInteger(rules.cap, 'Tie-break cap');
    if (rules.cap < rules.pointsToWin) throw new Error('Tie-break cap cannot precede its target.');
  }
  if (rules.serviceOrder !== 'one-then-two') throw new Error('Unsupported tie-break service order.');
}

export function validateFormat(format: MatchFormat): void {
  if (format.version !== 1) throw new Error('Unsupported format version.');
  if (!format.id.trim() || !format.name.trim()) throw new Error('A format needs an ID and a name.');
  if (!format.stages.length || format.stages.length % 2 !== 1) throw new Error('A match needs an odd number of stages.');
  if (!['replay', 'play-on'].includes(format.serviceLet)) throw new Error('Invalid service let rule.');
  for (const [index, stage] of format.stages.entries()) {
    if (stage.kind === 'match-tie-break') {
      if (index !== format.stages.length - 1) throw new Error('A match tie-break must be the final stage.');
      validateTieBreak(stage.tieBreak);
      continue;
    }
    if (stage.kind !== 'set') throw new Error('Invalid match stage.');
    positiveInteger(stage.gamesToWin, 'Set target');
    positiveInteger(stage.winBy, 'Set winning margin');
    if (!['advantage', 'deciding-point'].includes(stage.deuce)) throw new Error('Invalid deuce rule.');
    if ((stage.tieBreakAt === null) !== (stage.tieBreak === null)) throw new Error('Set tie-break rules and trigger must be specified together.');
    if (stage.tieBreakAt !== null) {
      positiveInteger(stage.tieBreakAt, 'Set tie-break trigger');
      if (stage.tieBreakAt < stage.gamesToWin - 1 || stage.tieBreakAt > stage.gamesToWin + stage.winBy - 2) {
        throw new Error('The set tie-break trigger is inconsistent with the set target and winning margin.');
      }
      validateTieBreak(stage.tieBreak!);
    }
  }
}

function startStage(index: number, rules: StageRules, server: Side): CurrentStage {
  return {
    index,
    phase: rules.kind === 'set' ? 'game' : 'match-tie-break',
    games: [0, 0], points: [0, 0], server,
    tieBreakFirstServer: rules.kind === 'set' ? null : server,
  };
}

export function createScore(format: MatchFormat, firstServer: Side): MatchScore {
  validateFormat(format);
  assertSide(firstServer);
  // Each match owns a JSON-compatible rules snapshot, isolated from preset edits.
  const snapshot = JSON.parse(JSON.stringify(format)) as MatchFormat;
  return {
    engineVersion: 1, format: snapshot, firstServer,
    completedStages: [], stagesWon: [0, 0],
    current: startStage(0, snapshot.stages[0]!, firstServer),
    status: 'in-progress', winner: null,
  };
}

function increment(pair: Pair, side: Side): Pair {
  return side === 0 ? [pair[0] + 1, pair[1]] : [pair[0], pair[1] + 1];
}

function hasWon(pair: Pair, side: Side, target: number, margin: number, cap: number | null = null): boolean {
  return (cap !== null && pair[side] >= cap) || (pair[side] >= target && pair[side] - pair[other(side)] >= margin);
}

export function tieBreakServer(first: Side, pointsAlreadyPlayed: number): Side {
  assertSide(first);
  if (!Number.isSafeInteger(pointsAlreadyPlayed) || pointsAlreadyPlayed < 0) throw new Error('Invalid tie-break point count.');
  return Math.floor((pointsAlreadyPlayed + 1) / 2) % 2 === 0 ? first : other(first);
}

function finishStage(score: MatchScore, result: StageResult, nextServer: Side): MatchScore {
  const completedStages = [...score.completedStages, result];
  const stagesWon = increment(score.stagesWon, result.winner);
  const required = Math.floor(score.format.stages.length / 2) + 1;
  if (stagesWon[result.winner] >= required) {
    return { ...score, completedStages, stagesWon, current: null, status: 'completed', winner: result.winner };
  }
  const index = completedStages.length;
  const rules = score.format.stages[index];
  if (!rules) throw new Error('Match format ran out of stages.');
  return { ...score, completedStages, stagesWon, current: startStage(index, rules, nextServer) };
}

export function awardPoint(score: MatchScore, winner: Side): MatchScore {
  assertSide(winner);
  if (score.status !== 'in-progress' || !score.current) throw new Error('Points can only be recorded while a match is in progress.');
  const current = score.current;
  const rules = score.format.stages[current.index]!;
  const points = increment(current.points, winner);
  if (current.phase !== 'game') {
    const tie = rules.tieBreak!;
    const first = current.tieBreakFirstServer!;
    if (hasWon(points, winner, tie.pointsToWin, tie.winBy, tie.cap)) {
      const result: StageResult = current.phase === 'match-tie-break'
        ? { kind: 'match-tie-break', winner, points }
        : { kind: 'set', winner, games: increment(current.games, winner), tieBreakPoints: points };
      // The next set starts with the receiver of the FIRST tie-break point,
      // regardless of who served its final point.
      return finishStage(score, result, other(first));
    }
    return { ...score, current: { ...current, points, server: tieBreakServer(first, points[0] + points[1]) } };
  }
  if (rules.kind !== 'set') throw new Error('Only a regular set can contain service games.');
  const margin = rules.deuce === 'advantage' ? 2 : 1;
  if (!hasWon(points, winner, 4, margin)) return { ...score, current: { ...current, points } };
  const games = increment(current.games, winner);
  const server = other(current.server);
  if (hasWon(games, winner, rules.gamesToWin, rules.winBy)) {
    return finishStage(score, { kind: 'set', winner, games, tieBreakPoints: null }, server);
  }
  const entersTieBreak = rules.tieBreakAt !== null && games[0] === rules.tieBreakAt && games[1] === rules.tieBreakAt;
  return { ...score, current: { ...current, games, points: [0, 0], server,
    phase: entersTieBreak ? 'set-tie-break' : 'game', tieBreakFirstServer: entersTieBreak ? server : null } };
}

export function pointLabels(score: MatchScore): readonly [string, string] {
  const current = score.current;
  if (!current) return ['—', '—'];
  const [a, b] = current.points;
  if (current.phase !== 'game') return [String(a), String(b)];
  if (a >= 3 && b >= 3) return a === b ? ['40', '40'] : a > b ? ['Ad', '40'] : ['40', 'Ad'];
  const names = ['0', '15', '30', '40'] as const;
  return [names[Math.min(a, 3)]!, names[Math.min(b, 3)]!];
}

export type LifecycleAction =
  | { readonly type: 'suspend' }
  | { readonly type: 'resume' }
  | { readonly type: 'retire'; readonly player: Side }
  | { readonly type: 'abandon' };

export function changeLifecycle(score: MatchScore, action: LifecycleAction): MatchScore {
  if (action.type === 'resume') {
    if (score.status !== 'suspended') throw new Error('Only suspended matches can resume.');
    return { ...score, status: 'in-progress' };
  }
  if (score.status !== 'in-progress' && score.status !== 'suspended') throw new Error('The match has already ended.');
  if (action.type === 'suspend') {
    if (score.status === 'suspended') throw new Error('The match is already suspended.');
    return { ...score, status: 'suspended' };
  }
  if (action.type === 'retire') {
    assertSide(action.player);
    return { ...score, status: 'retired', winner: other(action.player) };
  }
  return { ...score, status: 'abandoned', winner: null };
}

export interface ScoreCorrection {
  readonly games: Pair;
  readonly points: Pair;
  readonly nextServer: Side;
}

/** Correct the active set or match tie-break. Completed stage results stay intact. */
export function correctCurrentStage(score: MatchScore, correction: ScoreCorrection): MatchScore {
  if (!score.current || !['in-progress', 'suspended'].includes(score.status)) throw new Error('Only an active match stage can be corrected.');
  assertSide(correction.nextServer);
  const { games, points, nextServer } = correction;
  if ([...games, ...points].some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('Scores must be nonnegative integers.');
  const rules = score.format.stages[score.current.index]!;
  let phase: CurrentStage['phase'];
  if (rules.kind === 'match-tie-break') {
    if (games[0] !== 0 || games[1] !== 0) throw new Error('A match tie-break has no games.');
    phase = 'match-tie-break';
  } else {
    if ([0, 1].some(s => hasWon(games, s as Side, rules.gamesToWin, rules.winBy))) throw new Error('The correction would already end this set.');
    if (rules.tieBreakAt !== null && Math.max(...games) > rules.tieBreakAt) throw new Error('Games exceed the set tie-break trigger.');
    phase = rules.tieBreakAt !== null && games[0] === rules.tieBreakAt && games[1] === rules.tieBreakAt ? 'set-tie-break' : 'game';
  }
  if (phase === 'game') {
    const margin = (rules as SetRules).deuce === 'advantage' ? 2 : 1;
    if ([0, 1].some(s => hasWon(points, s as Side, 4, margin))) throw new Error('The correction would already end this game.');
  } else {
    const tie = rules.tieBreak!;
    if ([0, 1].some(s => hasWon(points, s as Side, tie.pointsToWin, tie.winBy, tie.cap))) throw new Error('The correction would already end this tie-break.');
  }
  const pointTotal = points[0] + points[1];
  const first = tieBreakServer(0, pointTotal) === nextServer ? 0 : 1;
  return { ...score, current: { index: score.current.index, phase, games: [...games], points: [...points], server: nextServer,
    tieBreakFirstServer: phase === 'game' ? null : first } };
}
