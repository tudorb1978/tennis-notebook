import React from 'react';
import { Image, Text, View, useWindowDimensions } from 'react-native';
import { replayMatch } from '../domain/history.ts';
import type { MatchScore } from '../domain/scoring.ts';
import { resultLabel } from '../reports/report.ts';
import type { MatchGroup } from '../storage/matchGroups.ts';
import type { MatchRecord, PlayerProfile } from '../storage/model.ts';
import { CourtLines } from './CourtLines.tsx';
import { Icon } from './Icon.tsx';
import { Button, Card, Choices, Eyebrow, Row, Stack, T, useTheme } from './kit.tsx';

const statusLabels: Record<MatchScore['status'], string> = {
  'in-progress': 'In progress',
  suspended: 'Paused',
  completed: 'Completed',
  retired: 'Retirement',
  abandoned: 'Abandoned',
};

const welcomeFeatures = [
  { icon: 'record', title: 'Record live', detail: 'Keep score and note how each point ends.' },
  { icon: 'chart', title: 'See patterns', detail: 'Review serves, shots and pressure points.' },
  { icon: 'report', title: 'Share a report', detail: 'Send a match PDF to your coach.' },
] as const;

export function MatchLibrary({ groups, players, filter, busy, available, onFilter, onNewMatch, onAddToEvent, onPerformance, onOpenMatch }: {
  groups: readonly MatchGroup[];
  players: readonly PlayerProfile[];
  filter: string;
  busy: boolean;
  available: boolean;
  onFilter: (playerId: string) => void;
  onNewMatch: () => void;
  onAddToEvent: () => void;
  onPerformance: (group: MatchGroup | null) => void;
  onOpenMatch: (id: string) => void;
}) {
  const c = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 540 && fontScale <= 1.2;
  const empty = groups.length === 0;
  const visibleGroups = groups.map(group => ({
    group, matches: group.matches.filter(match => filter === 'all' || match.players[0].id === filter),
  })).filter(group => group.matches.length > 0);
  const hasEvents = groups.some(group => group.named);
  const selectedPlayer = players.find(player => player.id === filter);

  return <Stack>
    <View style={{
      backgroundColor: c.court, borderRadius: 22, padding: empty ? 22 : 20, overflow: 'hidden',
      flexDirection: empty && wide ? 'row' : 'column', alignItems: empty && wide ? 'center' : 'stretch',
      gap: empty ? 8 : 0,
    }}>
      {!empty && <CourtLines opacity={0.8} />}
      <View style={{ flex: empty && wide ? 1 : undefined, minWidth: 0, gap: 8 }}>
        <Eyebrow style={{ color: c.lime }}>{empty ? 'Courtside companion' : 'Match library'}</Eyebrow>
        <Text accessibilityRole="header" style={{
          color: c.courtInk, fontSize: empty ? 36 : 31, fontWeight: '700',
          letterSpacing: -1.1, lineHeight: empty ? 40 : 36,
        }}>Your tennis notebook</Text>
        <T small style={{ color: c.courtSub, maxWidth: empty ? 280 : 360 }}>
          {empty ? 'Capture each point as it happens and see what shaped the match.' : 'Record and review match play.'}
        </T>
      </View>
      {empty && <Image source={require('../../assets/welcome-court.png')} accessible={false} resizeMode="contain"
        style={{ width: wide ? '48%' : '100%', maxWidth: wide ? 264 : 250, height: wide ? 174 : 164, alignSelf: 'center' }} />}
    </View>
    {empty ? <Button primary icon="plus" testID="new-match" disabled={busy || !available} onPress={onNewMatch}
      style={{ minHeight: 64, borderRadius: 16, paddingHorizontal: 20 }}>
      Start recording your first match
    </Button> : <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8 }}>
      <Button primary icon="plus" style={{ flex: 1, minWidth: 0 }} testID="new-match" disabled={busy || !available} onPress={onNewMatch}>New match &amp; event</Button>
      {hasEvents && <Button icon="calendar" style={{ flex: 1, minWidth: 0 }} disabled={busy} onPress={onAddToEvent}>Add match to event</Button>}
    </View>}
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.soft }}>
            <Icon name="history" color={c.accent} />
          </View>
          <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 18, lineHeight: 24, fontWeight: '700', flexShrink: 1 }}>Match history</Text>
        </View>
        {players.length > 0 && <Button quiet compact icon="chart" disabled={busy} onPress={() => onPerformance(null)}>Player performance</Button>}
      </Row>
      {players.length > 0 && <Choices compact label="Player" value={filter} options={[{ value: 'all', label: 'All players' }, ...players.map(player => ({ value: player.id, label: player.name }))]} onChange={onFilter} />}
      {visibleGroups.length === 0 && <View style={{ backgroundColor: c.bg, borderRadius: 12, padding: 12 }}>
        <T small muted>{selectedPlayer ? `No matches recorded yet for ${selectedPlayer.name}` : 'No matches recorded yet'}</T>
      </View>}
      {visibleGroups.map(({ group, matches }) => <View key={group.key} style={{ gap: 8, borderTopWidth: 1, borderColor: c.line, paddingTop: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 104 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="calendar" size={13} color={c.sub} />
              <T small muted style={{ flexShrink: 1 }}>{group.dateLabel}</T>
            </View>
            <T bold style={{ fontSize: 16, lineHeight: 22 }}>{group.name}</T>
          </View>
          {group.named && <Button quiet compact icon="chart" disabled={busy} onPress={() => onPerformance(group)}>Event performance</Button>}
        </Row>
        {matches.map(match => {
          const { score, points } = replayMatch(match.format, match.firstServer, match.events);
          const active = score.status === 'in-progress' || score.status === 'suspended';
          const title = `${match.players[0].name} vs ${match.players[1].name}`;
          const result = resultLabel(score);
          const status = statusLabels[score.status];
          return <Button key={match.id} label={`${title}, ${status}, ${result}`} disabled={busy} onPress={() => onOpenMatch(match.id)}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: c.bg, paddingHorizontal: 12, paddingVertical: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <T bold style={{ fontSize: 16, lineHeight: 22 }}>{title}</T>
              <Text style={{ color: c.ink, fontSize: 22, fontWeight: '700', lineHeight: 26, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{result}</Text>
              <T small muted>{match.date} · {points.length} {points.length === 1 ? 'recorded point' : 'recorded points'}</T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ backgroundColor: active ? c.soft : c.card, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 7 }}>
                <T small bold style={{ color: active ? c.ink : c.sub }}>{status}</T>
              </View>
              <Icon name="chevron-right" size={15} color={c.sub} />
            </View>
          </Button>;
        })}
      </View>)}
    </Card>
    {empty && <Card style={{ gap: 14, padding: 17 }}>
      <T bold>From first point to final report</T>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 14 : 12 }}>
        {welcomeFeatures.map(({ icon, title, detail }) => <View key={title} style={{
          flex: wide ? 1 : undefined, minWidth: 0, flexDirection: wide ? 'column' : 'row', alignItems: 'flex-start', gap: 9,
        }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: c.soft }}>
            <Icon name={icon} color={c.accent} size={18} />
          </View>
          <View style={{ flex: wide ? undefined : 1, minWidth: 0, gap: 2 }}>
            <T small bold>{title}</T>
            <T small muted>{detail}</T>
          </View>
        </View>)}
      </View>
    </Card>}
  </Stack>;
}
