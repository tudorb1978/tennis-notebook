import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { strokes } from '../domain/points.ts';
import type { PlayerStats, StrokeCounts, summarisePoints } from '../domain/points.ts';
import { pressurePointExplanation, pressurePointRows, strokeNames } from '../reports/report.ts';
import { Icon } from './Icon.tsx';
import { Card, T, useTheme } from './kit.tsx';

const sides = [0, 1] as const;
type PlayerNames = readonly [string, string];
type MetricRow = { label: string; values: readonly (string | number)[] };

function observedRate(inCount: number, observed: number) {
  return observed ? `${Math.round(100 * inCount / observed)}% (${inCount}/${observed})` : '—';
}

function PlayerHeading({ side, name }: { side: (typeof sides)[number]; name: string }) {
  const { ink, header } = useTheme().reportPlayers[side];
  return <View style={[styles.column, styles.player, { backgroundColor: header }]}>
    <Text accessibilityLabel={name} numberOfLines={2} style={[styles.playerName, { color: ink }]}>{name}</Text>
  </View>;
}

function SideBySideTable({ names, rows, label }: { names: PlayerNames; rows: readonly MetricRow[]; label: string }) {
  const c = useTheme();
  return <View style={[styles.frame, { borderColor: c.line }]}>
    <View style={[styles.row, { backgroundColor: c.court }]}>
      <T small bold style={[styles.metric, { color: c.courtInk }]}>{label}</T>
      {sides.map(side => <PlayerHeading key={side} side={side} name={names[side]} />)}
    </View>
    {rows.map(({ label: metric, values }, index) => <View key={metric} style={[styles.row, styles.separator, { borderColor: c.line, backgroundColor: index % 2 ? c.bg : c.card }]}>
      <T small style={styles.metric}>{metric}</T>
      {sides.map(side => {
        const value = values[side];
        const { tint, ink } = c.reportPlayers[side];
        return <View key={side} style={[styles.column, styles.value, { backgroundColor: tint }]}>
          <Text accessibilityLabel={`${names[side]}, ${metric}: ${value === '—' ? 'not recorded' : value}`}
            style={[styles.number, { color: ink }]}>{value}</Text>
        </View>;
      })}
    </View>)}
  </View>;
}

const strokeMetrics = [
  { key: 'winners', label: 'W', fullLabel: 'Winners' },
  { key: 'unforcedErrors', label: 'UFE', fullLabel: 'Unforced errors' },
  { key: 'forcedErrors', label: 'FE', fullLabel: 'Forced errors' },
] as const;

function ShotTable({ names, players }: { names: PlayerNames; players: readonly [PlayerStats, PlayerStats] }) {
  const c = useTheme();
  const recorded = strokes.filter(stroke => players.some(player => Object.values(player.byStroke[stroke]).some(Boolean)));
  const totals = players.map(player => Object.values(player.byStroke).reduce<StrokeCounts>((sum, row) => ({
    winners: sum.winners + row.winners,
    unforcedErrors: sum.unforcedErrors + row.unforcedErrors,
    forcedErrors: sum.forcedErrors + row.forcedErrors,
  }), { winners: 0, unforcedErrors: 0, forcedErrors: 0 }));
  const rows = [
    ...recorded.map(stroke => ({ stroke, label: strokeNames[stroke], values: players.map(player => player.byStroke[stroke]) })),
    { stroke: 'total', label: 'Total', values: totals },
  ];

  return <View style={[styles.frame, { borderColor: c.line }]}>
    <View style={[styles.row, { backgroundColor: c.court }]}>
      <T small bold style={[styles.stroke, { color: c.courtInk }]}>Stroke</T>
      {sides.map(side => <PlayerHeading key={side} side={side} name={names[side]} />)}
    </View>
    <View style={[styles.row, { backgroundColor: c.bg }]}>
      <View style={styles.stroke} />
      {sides.map(side => <View key={side} style={[styles.column, styles.shotGroup, { backgroundColor: c.reportPlayers[side].header }]}>
        {strokeMetrics.map(({ key, label, fullLabel }) => <Text key={key} accessibilityLabel={fullLabel} style={[styles.shotCell, { color: c.reportPlayers[side].ink, fontSize: 10, fontWeight: '700' }]}>{label}</Text>)}
      </View>)}
    </View>
    {rows.map(({ stroke, label, values }, index) => {
      const isTotal = index === rows.length - 1;
      return <View key={stroke} style={[styles.row, styles.separator, { borderColor: c.line, backgroundColor: isTotal || index % 2 ? c.bg : c.card }]}>
        <T small bold={isTotal} style={styles.stroke}>{label}</T>
        {sides.map(side => <View key={side} style={[styles.column, styles.shotGroup, {
          backgroundColor: isTotal ? c.reportPlayers[side].header : c.reportPlayers[side].tint,
        }]}>
          {strokeMetrics.map(({ key, fullLabel }) => <Text key={key} accessibilityLabel={`${names[side]}, ${label}, ${fullLabel}: ${values[side]![key]}`}
            testID={`shot-${stroke}-${side}-${key}`} style={[styles.shotCell, { color: c.reportPlayers[side].ink, fontWeight: isTotal ? '700' : '500' }]}>{values[side]![key]}</Text>)}
        </View>)}
      </View>;
    })}
  </View>;
}

export function MatchReportStats({ names, stats, title, showPressure = false }: {
  names: PlayerNames;
  stats: ReturnType<typeof summarisePoints>;
  title: string;
  showPressure?: boolean;
}) {
  const c = useTheme();
  const { players, coverage } = stats;
  const rows: MetricRow[] = [
    { label: 'Points won', values: players.map(player => player.pointsWon) },
    { label: 'Aces', values: players.map(player => player.aces) },
    { label: 'Double faults', values: players.map(player => player.doubleFaults) },
    { label: 'First serves in', values: players.map(player => observedRate(player.firstServesIn, player.firstServesObserved)) },
    { label: 'Second serves in', values: players.map(player => observedRate(player.secondServesIn, player.secondServesObserved)) },
    { label: 'Returns in', values: players.map(player => observedRate(player.returnsIn, player.returnsObserved)) },
  ];
  const pressure = showPressure ? pressurePointRows(players) : [];

  return <Card style={{ gap: 14, padding: 12 }}>
    <View style={styles.heading}>
      <View style={[styles.icon, { backgroundColor: c.soft }]}><Icon name="chart" size={17} color={c.accent} /></View>
      <T bold style={styles.title}>{title}</T>
    </View>
    <SideBySideTable names={names} rows={rows} label="Metric" />
    {coverage.endings > 0 && <View style={styles.section}>
      <T bold>Shot breakdown</T>
      <ShotTable names={names} players={players} />
      <T small muted>W = winners · UFE = unforced errors · FE = forced errors</T>
    </View>}
    {coverage.points > 0 && <T small muted>
      Recorded endings {coverage.endings}/{coverage.points} · Recorded strokes {coverage.strokes}/{coverage.endings}
    </T>}
    {coverage.endings > 0 && <T small muted>Aces count as serve winners. Double faults count as unforced serve errors.</T>}
    {pressure.length > 0 && <View style={styles.section}>
      <T bold>Pressure points</T>
      <SideBySideTable names={names} rows={pressure} label="Opportunity" />
      <T small muted>{pressurePointExplanation}</T>
    </View>}
  </Card>;
}

const styles = StyleSheet.create({
  frame: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 33, height: 33, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, lineHeight: 24, flex: 1, minWidth: 0 },
  section: { gap: 7 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  separator: { borderTopWidth: StyleSheet.hairlineWidth },
  metric: { flex: 1.3, minWidth: 0, paddingVertical: 8, paddingHorizontal: 7, alignSelf: 'center' },
  column: { flex: 1, minWidth: 0 },
  player: { alignItems: 'center', justifyContent: 'center', padding: 4 },
  playerName: { fontSize: 13, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  value: { justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  number: { fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'] },
  stroke: { flex: 0.82, minWidth: 0, paddingVertical: 6, paddingHorizontal: 6, alignSelf: 'center' },
  shotGroup: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  shotCell: { flex: 1, minWidth: 0, paddingVertical: 7, paddingHorizontal: 1, fontSize: 13, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
