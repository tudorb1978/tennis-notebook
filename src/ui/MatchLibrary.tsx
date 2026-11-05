import React from 'react';
import { Text, View } from 'react-native';
import { replayMatch } from '../domain/history.ts';
import type { MatchScore } from '../domain/scoring.ts';
import { resultLabel } from '../reports/report.ts';
import type { MatchGroup } from '../storage/matchGroups.ts';
import type { MatchRecord, PlayerProfile } from '../storage/model.ts';
import { CourtLines } from './CourtLines.tsx';
import { Button, Card, Choices, Eyebrow, Row, Stack, T, useTheme } from './kit.tsx';

const statusLabels: Record<MatchScore['status'], string> = {
  'in-progress': 'In progress',
  suspended: 'Paused',
  completed: 'Completed',
  retired: 'Retirement',
  abandoned: 'Abandoned',
};

export function MatchLibrary({ groups, players, filter, busy, available, onFilter, onNewMatch, onAddToEvent, onPerformance, onOpenMatch, onBackup, onRestore }: {
  groups: readonly MatchGroup[];
  players: readonly PlayerProfile[];
  filter: string;
  busy: boolean;
  available: boolean;
  onFilter: (playerId: string) => void;
  onNewMatch: () => void;
  onAddToEvent: () => void;
  onPerformance: (group: MatchGroup | null) => void;
  onOpenMatch: (match: MatchRecord) => void;
  onBackup: () => void;
  onRestore: () => void;
}) {
  const c = useTheme();
  const visibleGroups = groups.map(group => ({
    group, matches: group.matches.filter(match => filter === 'all' || match.players[0].id === filter),
  })).filter(group => group.matches.length > 0);
  const hasEvents = groups.some(group => group.named);

  return <Stack>
    <View style={{ backgroundColor: c.court, borderRadius: 21, padding: 17, overflow: 'hidden', gap: 7 }}>
      <CourtLines />
      <Eyebrow style={{ color: c.lime }}>Match library</Eyebrow>
      <Text accessibilityRole="header" style={{ color: c.courtInk, fontSize: 33, fontWeight: '700', letterSpacing: -1.2, lineHeight: 36 }}>Your tennis notebook</Text>
      <T small style={{ color: c.courtSub }}>Record and review match play.</T>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8 }}>
      <Button primary style={{ flex: 1, minWidth: 0 }} testID="new-match" disabled={busy || !available} onPress={onNewMatch}>New match &amp; event</Button>
      {hasEvents && <Button style={{ flex: 1, minWidth: 0 }} disabled={busy} onPress={onAddToEvent}>Add match to event</Button>}
    </View>
    {players.length > 0 && <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 21, fontWeight: '700', letterSpacing: -0.45 }}>Match history</Text>
        <Button quiet compact disabled={busy} onPress={() => onPerformance(null)}>Player performance</Button>
      </Row>
      <Choices compact label="Player" value={filter} options={[{ value: 'all', label: 'All players' }, ...players.map(player => ({ value: player.id, label: player.name }))]} onChange={onFilter} />
    </View>}
    {visibleGroups.length === 0 && <Card style={{ gap: 6 }}>
      <T bold>{groups.length ? 'No matches for this player' : 'Start with your next match'}</T>
      <T muted small>{groups.length ? 'Choose another player to see their matches.' : 'Choose a player and format, then start recording points.'}</T>
    </Card>}
    {visibleGroups.map(({ group, matches }) => <View key={group.key} style={{ gap: 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 104 }}>
          <T small muted>{group.dateLabel}</T>
          <T bold style={{ fontSize: 19, lineHeight: 23, letterSpacing: -0.3 }}>{group.name}</T>
        </View>
        {group.named && <Button quiet compact disabled={busy} onPress={() => onPerformance(group)}>Event performance</Button>}
      </Row>
      {matches.map(match => {
        const { score, points } = replayMatch(match.format, match.firstServer, match.events);
        const active = score.status === 'in-progress' || score.status === 'suspended';
        return <Card key={match.id} style={{ gap: 8 }}>
          <T bold style={{ fontSize: 17, lineHeight: 22 }}>{match.players[0].name} vs {match.players[1].name}</T>
          <Row style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <Text style={{ color: c.ink, fontSize: 24, fontWeight: '700', lineHeight: 28, letterSpacing: -0.8, fontVariant: ['tabular-nums'] }}>{resultLabel(score)}</Text>
              <T small muted>{match.date} · {points.length} {points.length === 1 ? 'recorded point' : 'recorded points'}</T>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 5 }}>
              <View style={{ backgroundColor: active ? c.soft : c.bg, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 9 }}>
                <T small bold style={{ color: active ? c.ink : c.sub }}>{statusLabels[score.status]}</T>
              </View>
              {active && <Button primary compact style={{ paddingHorizontal: 9 }} disabled={busy} onPress={() => onOpenMatch(match)}>Resume match</Button>}
            </View>
          </Row>
          {!active && <Button disabled={busy} onPress={() => onOpenMatch(match)}>Open report</Button>}
        </Card>;
      })}
    </View>)}
    <Card style={{ gap: 8 }}>
      <T bold>Backup and restore</T>
      <T small muted>Save a copy of your records before moving phones or uninstalling.</T>
      <Row>
        <Button disabled={busy || !available} onPress={onBackup}>Back up all records</Button>
        <Button disabled={busy || !available} onPress={onRestore}>Restore backup</Button>
      </Row>
    </Card>
  </Stack>;
}
