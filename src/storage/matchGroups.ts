import type { MatchRecord } from './model.ts';

export interface MatchGroup {
  readonly key: string;
  readonly name: string;
  readonly dateLabel: string;
  readonly named: boolean;
  readonly latest: MatchRecord;
  readonly matches: readonly MatchRecord[];
}

export function matchEventKey(match: MatchRecord): string | null {
  // Older matches used the event name and date as their grouping key.
  return match.eventId ?? (match.group ? `legacy:${match.date}:${match.group}` : null);
}

export function groupMatches(matches: readonly MatchRecord[]): MatchGroup[] {
  const groups = new Map<string, MatchRecord[]>();
  const newestFirst = [...matches].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  for (const match of newestFirst) {
    const key = matchEventKey(match) ?? `day:${match.date}`;
    const existing = groups.get(key);
    if (existing) existing.push(match);
    else groups.set(key, [match]);
  }
  return [...groups].map(([key, rows]) => {
    const latest = rows[0]!;
    const firstDate = rows.at(-1)!.date;
    const named = matchEventKey(latest) !== null;
    return {
      key, latest, named, matches: rows,
      name: rows.find(row => row.group)?.group ?? (named ? 'Unnamed event' : 'Matches'),
      dateLabel: firstDate === latest.date ? firstDate : `${firstDate} to ${latest.date}`,
    };
  });
}
