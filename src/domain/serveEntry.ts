import type { PointObservations } from './points.ts';

export const serveEntrySteps = ['first-serve', 'second-serve', 'return-result', 'return-stroke', 'point-ending'] as const;
export type ServeEntryStep = typeof serveEntrySteps[number];
interface EntryDraft {
  observations: PointObservations;
  serveStep?: ServeEntryStep;
  pending?: unknown;
}
interface EntryUpdate { observations: PointObservations; serveStep: ServeEntryStep }

// Unknown is a real answer. The saved cursor distinguishes it from an unanswered question.
export function serveEntryStep(draft: EntryDraft): ServeEntryStep {
  if (draft.pending) return 'point-ending';
  if (draft.serveStep) return draft.serveStep;
  const obs = draft.observations;
  if (obs.returnStroke !== 'unknown') return 'point-ending';
  if (obs.returnResult !== 'unknown') return 'return-stroke';
  if (obs.firstServe === 'in' || obs.secondServe === 'in') return 'return-result';
  return obs.firstServe === 'fault' ? 'second-serve' : 'first-serve';
}

export function answerServeEntry(draft: EntryDraft, observations: PointObservations): EntryUpdate {
  switch (serveEntryStep(draft)) {
    case 'first-serve': return {
      observations: { ...observations, secondServe: 'unknown', returnResult: 'unknown', returnStroke: 'unknown' },
      serveStep: observations.firstServe === 'fault' ? 'second-serve' : 'return-result',
    };
    case 'second-serve': return {
      observations: { ...observations, returnResult: 'unknown', returnStroke: 'unknown' }, serveStep: 'return-result',
    };
    case 'return-result': return {
      observations: { ...observations, returnStroke: 'unknown' },
      serveStep: observations.returnResult === 'unknown' ? 'point-ending' : 'return-stroke',
    };
    case 'return-stroke':
    case 'point-ending': return { observations, serveStep: 'point-ending' };
  }
}

export function skipServeEntry(draft: EntryDraft): EntryUpdate {
  const obs = draft.observations;
  switch (serveEntryStep(draft)) {
    case 'first-serve': return {
      observations: { ...obs, firstServe: 'unknown', secondServe: 'unknown', returnResult: 'unknown', returnStroke: 'unknown' },
      serveStep: 'return-result',
    };
    case 'second-serve': return {
      observations: { ...obs, secondServe: 'unknown', returnResult: 'unknown', returnStroke: 'unknown' }, serveStep: 'return-result',
    };
    case 'return-result': return {
      observations: { ...obs, returnResult: 'unknown', returnStroke: 'unknown' }, serveStep: 'point-ending',
    };
    case 'return-stroke':
    case 'point-ending': return { observations: { ...obs, returnStroke: 'unknown' }, serveStep: 'point-ending' };
  }
}

export function previousServeEntryStep(draft: EntryDraft): ServeEntryStep {
  switch (serveEntryStep(draft)) {
    case 'first-serve':
    case 'second-serve': return 'first-serve';
    case 'return-result': return draft.observations.firstServe === 'fault' ? 'second-serve' : 'first-serve';
    case 'return-stroke': return 'return-result';
    case 'point-ending': return draft.observations.returnResult === 'unknown' ? 'return-result' : 'return-stroke';
  }
}
