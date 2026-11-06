import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { MatchProjection } from '../domain/history.ts';
import { buildPointByPoint } from '../reports/pointByPoint.ts';
import { pointNoteSummary } from '../reports/pointNotes.ts';
import { timingLabels } from '../reports/report.ts';
import type { MatchRecord } from '../storage/model.ts';
import { Icon } from './Icon.tsx';
import { Button, Card, Divider, Eyebrow, Heading, Notice, Row, Stack, T, useTheme } from './kit.tsx';
import { MatchReportPoints } from './MatchReportPoints.tsx';
import { MatchReportStats } from './MatchReportStats.tsx';

type Section = 'overview' | 'points';

export function MatchReport({ record, projection, scoreboard, busy, onExportPDF, onExportCSV, onEditNotes, renderPointActions, scrollToTop }: {
  record: MatchRecord;
  projection: MatchProjection;
  scoreboard: React.ReactNode;
  busy: boolean;
  onExportPDF: () => void;
  onExportCSV: () => void;
  onEditNotes: () => void;
  renderPointActions: (entry: MatchProjection['pointEntries'][number]) => React.ReactNode;
  scrollToTop: () => void;
}) {
  const c = useTheme();
  const [section, setSection] = useState<Section>('overview');
  const [initialFilter, setInitialFilter] = useState<'all' | 'notable'>('all');
  const [yourPlayer, opponent] = record.players;
  const yourName = yourPlayer.name;
  const opponentName = opponent.name;
  const names = useMemo(() => [yourName, opponentName] as const, [yourName, opponentName]);
  const stages = useMemo(() => buildPointByPoint(projection, names), [projection, names]);
  const noteSummary = useMemo(() => pointNoteSummary(projection.points, names), [projection.points, names]);
  const notableCount = stages.reduce((sum, stage) => sum + stage.points.filter(p => p.notes || p.labels.length).length, 0);
  const matchNotes = record.matchNotes?.trim();
  const times = timingLabels(projection.timing);
  const details = [record.group, record.round, record.venue, record.surface, record.courtSetting, record.conditions].filter(Boolean).join(' · ');
  const switchSection = (next: Section, filter: 'all' | 'notable' = 'all') => {
    if (next === section) return;
    setInitialFilter(filter);
    setSection(next);
    scrollToTop();
  };

  return <Stack>
    <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-end' }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Eyebrow>Match analysis</Eyebrow>
        <Heading>Match report</Heading>
      </View>
      <Button compact icon="report" style={{ paddingHorizontal: 10 }} testID="match-pdf-export" disabled={busy} onPress={onExportPDF}>PDF report</Button>
    </Row>
    <View accessibilityRole="toolbar" accessibilityLabel="Match report sections" style={{
      flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.card,
    }}>
      {([{ value: 'overview', label: 'Overview', icon: 'chart' }, { value: 'points', label: 'Point by point', icon: 'history' }] as const)
        .map(({ value, label, icon }) => <Button key={value} toggle compact icon={icon} selected={section === value}
          testID={`match-report-${value}`} style={{ flex: 1, minWidth: 0, borderRadius: 10, borderColor: section === value ? c.accent : 'transparent' }}
          onPress={() => switchSection(value)}>{label}</Button>)}
    </View>
    {section === 'overview' && scoreboard}
    {projection.hasScoreCorrections && <Notice>Manual score corrections leave gaps in point-based statistics.</Notice>}
    {section === 'points' ? <MatchReportPoints stages={stages} names={names} initialFilter={initialFilter}
      renderActions={number => {
        const entry = projection.pointEntries[number - 1];
        return entry ? renderPointActions(entry) : null;
      }}
      renderStats={(stats, title) => <MatchReportStats names={names} stats={stats} title={`${title} stats`} />}
    /> : <>
      <MatchReportStats title="Match stats" names={names} stats={projection.stats} showPressure />
      <Card style={{ gap: 9 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row><Icon name="note" color={c.accent} /><T bold>Match notes</T></Row>
          <Button compact icon={matchNotes ? 'edit' : 'plus'} style={{ paddingHorizontal: 8 }} disabled={busy} onPress={onEditNotes}>
            {matchNotes ? 'Edit match notes' : 'Add match notes'}
          </Button>
        </Row>
        {matchNotes ? <T>{matchNotes}</T> : <T small muted>Add observations about the match as a whole.</T>}
      </Card>
      <Card style={{ gap: 12 }}>
        <Row>
          <View style={{ padding: 7, backgroundColor: c.soft, borderRadius: 8 }}>
            <Icon name="record" color={c.accent} size={16} />
          </View>
          <T bold>Point notes summary</T>
        </Row>
        {noteSummary.length ? noteSummary.map(({ title, lines }, i) => <React.Fragment key={title}>
          {i > 0 && <Divider />}
          <View style={{ gap: 4 }}>
            <T small bold>{title}</T>
            {lines.map(line => <T key={line} small muted>{line}</T>)}
          </View>
        </React.Fragment>) : <T small muted>Rally, call and player observations will appear here as you add them.</T>}
        {notableCount > 0 && <Button compact icon="chevron-right" onPress={() => switchSection('points', 'notable')}>
          {`View notable points (${notableCount})`}
        </Button>}
      </Card>
      <Card style={{ gap: 9 }}>
        <Row><Icon name="calendar" color={c.accent} /><T bold>Match details</T></Row>
        <T small bold>{record.date} · {record.format.name}</T>
        {details ? <T small muted>{details}</T> : null}
        {times.length > 0 && <>
          <Divider />
          <Eyebrow>Match timing</Eyebrow>
          <Row style={{ columnGap: 14, rowGap: 2 }}>
            {times.map(time => <Text key={time} style={{ color: c.sub, fontSize: 13, lineHeight: 19, fontVariant: ['tabular-nums'] }}>{time}</Text>)}
          </Row>
        </>}
        <Button compact icon="download" style={{ alignSelf: 'flex-start', paddingHorizontal: 10 }} disabled={busy} onPress={onExportCSV}>Export points CSV</Button>
      </Card>
    </>}
  </Stack>;
}
