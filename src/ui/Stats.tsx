import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { strokes } from '../domain/points.ts';
import type { PlayerStats } from '../domain/points.ts';
import { pressurePointExplanation, pressurePointRows, strokeNames } from '../reports/report.ts';
import { Card, T, useTheme } from './kit.tsx';

const strokeColumns = ['Winners', 'Unforced errors', 'Forced errors'] as const;
const serveMetrics = [
  { label: 'First serves in', count: 'firstServesIn', total: 'firstServesObserved' },
  { label: 'Second serves in', count: 'secondServesIn', total: 'secondServesObserved' },
  { label: 'Returns in', count: 'returnsIn', total: 'returnsObserved' },
] as const;

export function StatsTable({ name, stats }: { name: string; stats: PlayerStats }) {
  const c = useTheme();
  const totals = Object.values(stats.byStroke).reduce<[number, number, number]>(
    ([winners, unforced, forced], stroke) => [winners + stroke.winners, unforced + stroke.unforcedErrors, forced + stroke.forcedErrors],
    [0, 0, 0],
  );
  const row = (label: string, values: readonly (string | number)[], kind: 'header' | 'stat' | 'total') => {
    const highlighted = kind !== 'stat';
    return <View key={label} style={{
      flexDirection: 'row', alignItems: 'center', minHeight: kind === 'header' ? 44 : 36,
      paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: kind === 'total' ? 0 : StyleSheet.hairlineWidth,
      borderColor: c.line, backgroundColor: highlighted ? c.soft : c.card,
    }}>
      <Text style={{ flex: 1.2, color: c.ink, fontSize: 13, fontWeight: highlighted ? '700' : '400' }}>{label}</Text>
      {values.map((value, i) => <Text key={i} style={{
        flex: 1, paddingHorizontal: 2, textAlign: 'center', color: kind === 'header' ? c.sub : c.ink,
        fontSize: kind === 'header' ? 11 : 14, fontWeight: highlighted ? '700' : '500', fontVariant: ['tabular-nums'],
      }}>{value}</Text>)}
    </View>;
  };

  return <Card style={{ gap: 14 }}>
    <View style={{ gap: 3 }}>
      <T bold style={{ fontSize: 20, lineHeight: 25 }}>{name}</T>
      <T small muted>Points won: {stats.pointsWon} · Aces: {stats.aces} · Double faults: {stats.doubleFaults}</T>
    </View>
    <View style={{ borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, overflow: 'hidden' }}>
      {row('Stroke', strokeColumns, 'header')}
      {strokes.filter(stroke => stroke !== 'unknown' || Object.values(stats.byStroke.unknown).some(Boolean)).map(stroke => {
        const { winners, unforcedErrors, forcedErrors } = stats.byStroke[stroke];
        return row(strokeNames[stroke], [winners, unforcedErrors, forcedErrors], 'stat');
      })}
      {row('Total', totals, 'total')}
    </View>
    <View style={{ gap: 10 }}>
      <T small bold>Serve and return</T>
      {serveMetrics.map(({ label, count, total }) => {
        const observed = stats[total];
        const rate = observed ? Math.round((stats[count] / observed) * 100) : 0;
        return <View key={label} style={{ gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 8 }}>
            <T small>{label}</T>
            <T small muted style={{ fontVariant: ['tabular-nums'] }}>{observed ? `${stats[count]}/${observed} · ${rate}%` : 'Not recorded'}</T>
          </View>
          {observed > 0 && <View style={{ height: 4, borderRadius: 2, backgroundColor: c.soft }} accessibilityElementsHidden>
            <View style={{ width: `${rate}%` as DimensionValue, height: 4, borderRadius: 2, backgroundColor: c.accent }} />
          </View>}
        </View>;
      })}
    </View>
  </Card>;
}

export function MatchComparison({ names, stats }: {
  names: readonly [string, string];
  stats: readonly [PlayerStats, PlayerStats];
}) {
  const c = useTheme();
  const metrics = [
    { label: 'Points won', values: [stats[0].pointsWon, stats[1].pointsWon] },
    { label: 'Aces', values: [stats[0].aces, stats[1].aces] },
    { label: 'Double faults', values: [stats[0].doubleFaults, stats[1].doubleFaults] },
  ];
  return <Card style={{ gap: 8, backgroundColor: c.soft }}>
    <T small bold>At a glance</T>
    <View style={comparisonRow}>
      <T small bold style={comparisonSide}>{names[0]}</T>
      <View style={comparisonLabel} />
      <T small bold style={comparisonSide}>{names[1]}</T>
    </View>
    {metrics.map(({ label, values }) => <View key={label} style={{
      ...comparisonRow, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingTop: 7,
    }}>
      <T bold style={comparisonSide}>{values[0]}</T>
      <T small muted style={comparisonLabel}>{label}</T>
      <T bold style={comparisonSide}>{values[1]}</T>
    </View>)}
  </Card>;
}

export function PressurePoints({ names, stats }: { names: readonly string[]; stats: readonly PlayerStats[] }) {
  const c = useTheme();
  const rows = pressurePointRows(stats);
  const labelStyle = { flex: 1.25, minWidth: 0 };
  return <Card style={{ gap: 8 }}>
    <T bold>Pressure points</T>
    {rows.length ? <>
      <T small muted>{pressurePointExplanation}</T>
      <View style={comparisonRow}>
        <T small bold style={labelStyle}>Opportunity</T>
        {names.map((name, i) => <T key={i} small bold style={comparisonSide}>{name}</T>)}
      </View>
      {rows.map(row => <View key={row.label} style={{ ...comparisonRow, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingTop: 7 }}>
        <T small style={labelStyle}>{row.label}</T>
        {row.values.map((value, i) => <T key={i} small style={comparisonSide}>{value}</T>)}
      </View>)}
    </> : <T small muted>No pressure points recorded.</T>}
  </Card>;
}

const comparisonRow = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 };
const comparisonSide = { flex: 1, minWidth: 0, textAlign: 'center' as const, fontVariant: ['tabular-nums'] };
const comparisonLabel = { flex: 1.35, minWidth: 0, textAlign: 'center' as const };
