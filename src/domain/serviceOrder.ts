import { other } from './scoring.ts';
import type { Side } from './scoring.ts';

/** Keep the scoring sequence intact while following a reversed on-court service order. */
export function effectiveServer(scheduled: Side, switched = false, override?: Side | null): Side {
  return override ?? (switched ? other(scheduled) : scheduled);
}
