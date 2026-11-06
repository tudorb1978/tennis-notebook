import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { strokes } from '../domain/points.ts';
import type { PlayerStats } from '../domain/points.ts';
import { pressurePointExplanation, pressurePointRows, strokeNames } from '../reports/report.ts';
import { Icon } from './Icon.tsx';
import { Card, T, useTheme } from './kit.tsx';

const strokeColumns = ['Winners', 'Unforced errors', 'Forced errors'] as const;
const serveMetrics = [
  { label: 'First serves in', count: 'firstServesIn', total: 'firstServesObserved' },
  { label: 'Second serves in', count: 'secondServesIn', total: 'secondServesObserved' },
  { label: 'Returns in', count: 'returnsIn', total: 'returnsObserved' },
] as const;

function ReportCardHeading({ title, icon }: { title: string; icon: 'chart' | 'court' | 'record' }) {
  const c = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} color={c.accent} size={18} />
    </View>
    <T bold style={{ fontSize: 18, lineHeight: 24, flex: 1, minWidth: 0 }}>{title}</T>
  </View>;
}

export function StatsTable({ name, stats }: { name: string; stats: PlayerStats }) {
  const c = useTheme();
  const totals = Object.values(stats.byStroke).reduce<[number, number, number]>(
    ([winners, unforced, forced], stroke) => [winners + stroke.winners, unforced + stroke.unforcedErrors, forced + stroke.forcedErrors],
    [0, 0, 0],
  );
  const row = (label: string, values: readonly (string | number)[], kind: 'header' | 'stat' | 'total', stripe = false) => {
    const highlighted = kind !== 'stat';
    const color = kind === 'header' ? c.courtInk : c.ink;
    return <View key={label} style={{
      flexDirection: 'row', alignItems: 'center', minHeight: kind === 'header' ? 44 : 37,
      paddingHorizontal: 8, paddingVertical: 6,
      borderTopWidth: kind === 'total' ? StyleSheet.hairlineWidth : 0,
      borderColor: c.line, backgroundColor: kind === 'header' ? c.court : kind === 'total' ? c.soft : stripe ? c.bg : c.card,
    }}>
      <Text style={{ flex: 1.2, minWidth: 0, color, fontSize: 13, fontWeight: highlighted ? '700' : '500' }}>{label}</Text>
      {values.map((value, i) => <Text key={i} style={{
        flex: 1, minWidth: 0, paddingHorizontal: 2, textAlign: 'center', color,
        fontSize: kind === 'header' ? 11 : 14, fontWeight: highlighted ? '700' : '500', fontVariant: ['tabular-nums'],
      }}>{value}</Text>)}
    </View>;
  };

  return <Card style={{ gap: 14 }}>
    <View style={{ gap: 8 }}>
      <ReportCardHeading title={name} icon="court" />
      <T small muted>Points won: {stats.pointsWon} · Aces: {stats.aces} · Double faults: {stats.doubleFaults}</T>
    </View>
    <View style={[tableFrame, { borderColor: c.line }]}>
      {row('Stroke', strokeColumns, 'header')}
      {strokes.filter(stroke => stroke !== 'unknown' || Object.values(stats.byStroke.unknown).some(Boolean)).map((stroke, i) => {
        const { winners, unforcedErrors, forcedErrors } = stats.byStroke[stroke];
        return row(strokeNames[stroke], [winners, unforcedErrors, forcedErrors], 'stat', i % 2 === 1);
      })}
      {row('Total', totals, 'total')}
    </View>
    <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.bg }}>
      <T small bold>Serve and return</T>
      {serveMetrics.map(({ label, count, total }) => {
        const observed = stats[total];
        const rate = observed ? Math.round((stats[count] / observed) * 100) : 0;
        return <View key={label} style={{ gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 8 }}>
            <T small>{label}</T>
            <T small bold={observed > 0} muted={observed === 0} style={{ fontVariant: ['tabular-nums'] }}>{observed ? `${stats[count]}/${observed} · ${rate}%` : 'Not recorded'}</T>
          </View>
          {observed > 0 && <View style={{ height: 5, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden' }} accessibilityElementsHidden>
            <View style={{ width: `${rate}%` as DimensionValue, height: '100%', borderRadius: 3, backgroundColor: c.accent }} />
          </View>}
        </View>;
      })}
    </View>
  </Card>;
}

export function PressurePoints({ names, stats }: { names: readonly string[]; stats: readonly PlayerStats[] }) {
  const c = useTheme();
  const rows = pressurePointRows(stats);
  const labelStyle = { flex: 1.35, minWidth: 0 };
  return <Card style={{ gap: 10 }}>
    <ReportCardHeading title="Pressure points" icon="record" />
    {rows.length ? <>
      <T small muted>{pressurePointExplanation}</T>
      <View style={[tableFrame, { borderColor: c.line }]}>
        <View style={{ ...comparisonRow, minHeight: 38, padding: 8, backgroundColor: c.court }}>
          <T small bold style={{ ...labelStyle, color: c.courtInk }}>Opportunity</T>
          {names.map((name, i) => <T key={i} small bold style={{ ...comparisonSide, color: c.courtInk }}>{name}</T>)}
        </View>
        {rows.map((row, i) => <View key={row.label} style={{
          ...comparisonRow, minHeight: 38, paddingHorizontal: 8, paddingVertical: 7,
          backgroundColor: Math.floor(i / 2) % 2 === 1 ? c.bg : c.card,
        }}>
          <T small bold={i % 2 === 0} style={labelStyle}>{row.label}</T>
          {row.values.map((value, index) => <T key={index} small style={comparisonSide}>{value}</T>)}
        </View>)}
      </View>
    </> : <T small muted>No pressure points recorded.</T>}
  </Card>;
}

const comparisonRow = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 };
const comparisonName = { flex: 1, minWidth: 0 };
const comparisonSide = { ...comparisonName, textAlign: 'center' as const, fontVariant: ['tabular-nums'] };
const tableFrame = { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' as const };
