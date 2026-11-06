import React, { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { PointByPointEntry, PointByPointStage } from '../reports/pointByPoint.ts';
import { Icon } from './Icon.tsx';
import { Button, Card, Row, Stack, T, useTheme } from './kit.tsx';

type PointFilter = 'all' | 'notable';
type Props = {
  stages: readonly PointByPointStage[];
  names: readonly [string, string];
  renderStats: (stats: PointByPointStage['stats'], title: string) => React.ReactNode;
  renderActions?: (pointNumber: number) => React.ReactNode;
  initialFilter?: PointFilter;
};

const stageStatuses = { 'in-progress': 'In progress', paused: 'Paused', unfinished: 'Unfinished' };
const pointsPerPage = 60;

function isNotable({ labels, notes }: PointByPointEntry) {
  return labels.length > 0 || Boolean(notes);
}

export function MatchReportPoints({ stages, names, renderStats, renderActions, initialFilter = 'all' }: Props) {
  const c = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const splitRows = width >= 375 && fontScale <= 1.15;
  const [selected, selectStage] = useState(() => initialFilter === 'notable'
    ? Math.max(0, stages.findIndex(({ points }) => points.some(isNotable)))
    : 0);
  const [filter, setFilter] = useState<PointFilter>(initialFilter);
  const [visibleCount, setVisibleCount] = useState(pointsPerPage);
  const [showStats, setShowStats] = useState(false);
  const stage = stages[selected] ?? stages[0];
  if (!stage) return <Card><T bold>Point by point</T><T small muted>No points recorded yet.</T></Card>;

  const filteredPoints = filter === 'notable' ? stage.points.filter(isNotable) : stage.points;
  const total = stage.points.length;
  const showingStats = showStats && total > 0;

  return <Stack>
    <Card>
      <Row style={{ flexWrap: 'nowrap', gap: 10 }}>
        <View style={{ padding: 8, borderRadius: 9, backgroundColor: c.soft }}><Icon name="history" color={c.accent} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 18, lineHeight: 24, fontWeight: '700' }}>Point by point</Text>
          <T small muted>Scores before each point, with {names[0]} first.</T>
        </View>
      </Row>
      <Row style={{ alignItems: 'stretch', gap: 6 }}>
        {stages.map((option, index) => {
          const active = option === stage;
          const ink = active ? c.on : c.ink;
          return <Button key={option.title} compact toggle selected={active} testID={`report-stage-${index}`}
            label={`${option.title}, ${option.score}${option.setTieBreak}`} style={{ flex: 1, minWidth: 74, paddingHorizontal: 5 }}
            onPress={() => { selectStage(index); setVisibleCount(pointsPerPage); }}>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <T small bold style={{ color: ink, textAlign: 'center' }}>{option.title}</T>
              <T bold style={{ color: ink, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
                {option.score}<Text style={{ fontSize: 11 }}>{option.setTieBreak}</Text>
              </T>
            </View>
          </Button>;
        })}
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <T small muted>{total} {total === 1 ? 'recorded point' : 'recorded points'}{stage.status !== 'completed' ? ` · ${stageStatuses[stage.status]}` : ''}</T>
        {total > 0 && <Button quiet compact icon={showingStats ? 'history' : 'chart'} testID="report-stage-stats" onPress={() => setShowStats(!showingStats)}>
          {showingStats ? 'View points' : 'View stats'}
        </Button>}
      </Row>
      {!showingStats && total > 0 && <Row style={{ gap: 6 }}>
        {(['all', 'notable'] as const).map(choice => <Button key={choice} compact toggle selected={filter === choice}
          style={{ paddingHorizontal: 10 }} testID={`report-points-${choice}`}
          onPress={() => { setFilter(choice); setVisibleCount(pointsPerPage); }}>
          {choice === 'all' ? 'All points' : 'Notable points'}
        </Button>)}
      </Row>}
    </Card>

    {!showingStats && (filteredPoints.length ? <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
      <View style={{ backgroundColor: c.bg, paddingHorizontal: 12, paddingVertical: 8 }}>
        <T small muted>W = {names[0]} won · L = {names[0]} lost</T>
      </View>
      {filteredPoints.slice(0, visibleCount).map(point => <ReportPoint key={point.number} point={point} trackedPlayer={names[0]} split={splitRows}
        actions={isNotable(point) ? renderActions?.(point.number) : undefined} />)}
      {visibleCount < filteredPoints.length && <View style={{ padding: 12 }}>
        <Button icon="plus" onPress={() => setVisibleCount(visibleCount + pointsPerPage)}>Show more points</Button>
      </View>}
    </Card> : <Card><T small muted>{total ? 'No notable points recorded for this stage.' : 'No points recorded for this stage.'}</T></Card>)}
    {total > 0 && renderStats(stage.stats, stage.title)}
  </Stack>;
}

function ReportPoint({ point, trackedPlayer, split, actions }: {
  point: PointByPointEntry;
  trackedPlayer: string;
  split: boolean;
  actions: React.ReactNode;
}) {
  const c = useTheme();
  const won = point.winnerSide === 0;
  const player = c.reportPlayers[point.winnerSide];
  const labelStyles = {
    positive: { background: c.soft, ink: c.accent, prefix: '+ ' },
    negative: { background: c.bg, ink: c.error, prefix: '− ' },
    rally: { background: c.lime, ink: c.limeInk, prefix: '' },
    neutral: { background: c.bg, ink: c.sub, prefix: '' },
  };
  return <View testID={`report-point-${point.number}`} style={{ flexDirection: split ? 'row' : 'column', borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line, padding: 12, gap: split ? 14 : 6 }}>
    <View style={split ? { width: 102, gap: 4 } : { flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <Row style={{ flexWrap: 'nowrap', gap: 7 }}>
        <Text accessibilityLabel={`Point ${point.number}`} style={{ color: c.sub, fontSize: 13, lineHeight: 19, fontVariant: ['tabular-nums'] }}>#{point.number}</Text>
        <View style={{ minWidth: 24, paddingHorizontal: 5, borderRadius: 5, backgroundColor: player.header }}>
          <Text accessibilityLabel={`${trackedPlayer} ${won ? 'won' : 'lost'} the point`}
            style={{ color: player.ink, fontSize: 12, lineHeight: 19, textAlign: 'center', fontWeight: '700' }}>{won ? 'W' : 'L'}</Text>
        </View>
      </Row>
      <T small bold style={{ flex: split ? undefined : 1, minWidth: 0, fontVariant: ['tabular-nums'] }}>{point.scoreBefore}</T>
    </View>
    <View style={{ flex: split ? 1 : undefined, minWidth: 0, gap: 6 }}>
      <View style={{ gap: 2 }}>
        <T small bold>{point.ending}</T>
        <T small muted>{point.serve}</T>
      </View>
      {point.pressure.length > 0 && <Row style={{ flexWrap: 'nowrap', gap: 5, alignItems: 'flex-start' }}>
        <Icon name="record" size={14} color={c.accent} />
        <T small bold style={{ color: c.accent, flex: 1, minWidth: 0 }}>{point.pressure.join(' · ')}</T>
      </Row>}
      {point.labels.length > 0 && <Row style={{ gap: 4 }}>
        {point.labels.map(({ text, tone }, index) => {
          const { background, ink, prefix } = labelStyles[tone];
          return <View key={`${text}-${index}`} style={{ maxWidth: '100%', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: background }}>
            <T small bold style={{ color: ink, fontSize: 12, lineHeight: 16 }}>{prefix}{text}</T>
          </View>;
        })}
      </Row>}
      {point.notes ? <T small>{point.notes}</T> : null}
      {actions}
    </View>
  </View>;
}
