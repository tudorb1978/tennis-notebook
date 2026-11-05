import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { isMatchDate, localDate, monthsBefore } from '../domain/matchDates.ts';
import { performanceCountLabels, playerPerformance } from '../reports/playerPerformance.ts';
import type { PlayerPerformanceReport } from '../reports/playerPerformance.ts';
import { matchEventKey } from '../storage/matchGroups.ts';
import type { MatchGroup } from '../storage/matchGroups.ts';
import type { MatchRecord, PlayerProfile } from '../storage/model.ts';
import { Button, Card, Choices, Field, Heading, Notice, Stack, T, useTheme } from './kit.tsx';
import { StatsTable } from './Stats.tsx';

const periods = [
  { value: 'all', label: 'All dates' }, { value: '1', label: 'Last month' },
  { value: '3', label: 'Last 3 months' }, { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' }, { value: 'custom', label: 'Custom period' },
] as const;
type Period = (typeof periods)[number]['value'];

export function PlayerPerformance({ players, matches, playerId, event, hasEvents, busy, onPlayer, onChooseEvent, onExport }: {
  players: readonly PlayerProfile[];
  matches: readonly MatchRecord[];
  playerId: string;
  event: MatchGroup | null;
  hasEvents: boolean;
  busy: boolean;
  onPlayer: (id: string) => void;
  onChooseEvent: () => void;
  onExport: (report: PlayerPerformanceReport) => void;
}) {
  const c = useTheme();
  const [period, setPeriod] = useState<Period>('all');
  const today = localDate();
  const [customFrom, setCustomFrom] = useState(() => monthsBefore(today, 1));
  const [customTo, setCustomTo] = useState(today);
  const from = period === 'all' ? '' : period === 'custom' ? customFrom.trim() : monthsBefore(today, Number(period));
  const to = period === 'all' ? '' : period === 'custom' ? customTo.trim() : today;
  const valid = period !== 'custom' || (isMatchDate(from) && isMatchDate(to) && from <= to);
  const name = players.find(player => player.id === playerId)?.name ?? 'Player';
  const eventKey = event?.key;
  const scope = `${event ? `${event.name} (${event.dateLabel})` : 'All events'} · ${period === 'all' ? 'All dates' : `${from} to ${to}`}`;
  const report = useMemo(() => {
    if (!valid) return null;
    const included = matches.filter(match => match.players[0].id === playerId &&
      (!eventKey || matchEventKey(match) === eventKey) && (!from || match.date >= from) && (!to || match.date <= to));
    return playerPerformance(included, name, scope);
  }, [matches, playerId, eventKey, from, to, valid, name, scope]);

  const eventLabel = event ? `Event · ${event.name}` : 'Event · All events';

  return <Stack>
    <View style={{ gap: 4 }}>
      <Heading>Player performance</Heading>
      <T small muted>Review totals across matches.</T>
    </View>
    <Card>
      <Choices label="Player" value={playerId} options={players.map(player => ({ value: player.id, label: player.name }))} onChange={onPlayer} disabled={busy} />
      {hasEvents && <Button label={eventLabel} disabled={busy} onPress={onChooseEvent}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <T small bold style={{ flex: 1 }}>{eventLabel}</T>
          <T bold muted>›</T>
        </View>
      </Button>}
      <Choices<Period> label="Period" value={period} options={periods} onChange={setPeriod} disabled={busy} />
      {period === 'custom' && <View style={{ gap: 10, borderTopWidth: 1, borderColor: c.line, paddingTop: 10 }}>
        <Field label="From (YYYY-MM-DD)" value={customFrom} onChange={setCustomFrom} maxLength={10} />
        <Field label="To (YYYY-MM-DD)" value={customTo} onChange={setCustomTo} maxLength={10} />
      </View>}
    </Card>
    {!report ? <Notice>Enter valid dates with the start date on or before the end date.</Notice>
      : report.matchCount === 0 ? <Notice>No matches for this player in the selected event and period.</Notice>
      : <>
        <Card style={{ backgroundColor: c.soft, gap: 6 }}>
          <T small muted>{report.scope}</T>
          {performanceCountLabels(report).map((label, index) => <T key={label} small={index !== 0} bold={index === 0}>{label}</T>)}
        </Card>
        <Button disabled={busy} onPress={() => onExport(report)}>Export player PDF</Button>
        <StatsTable name={report.name} stats={report.stats} />
        {report.hasScoreCorrections && <Notice>Some matches contain score corrections. Statistics use recorded observations only.</Notice>}
        {report.noteSummary.map(section => <Card key={section.title} style={{ gap: 7 }}>
          <T bold>{section.title}</T>
          {section.lines.map(line => <T key={line} small>{line}</T>)}
        </Card>)}
      </>}
  </Stack>;
}
