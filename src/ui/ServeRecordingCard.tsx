import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { PointObservations } from '../domain/points.ts';
import { Button, Card, Divider, Eyebrow, Row, T, useTheme } from './kit.tsx';

const optionRow = { flexDirection: 'row', gap: 7 } as const;
const optionButton = { flex: 1, minWidth: 0, paddingHorizontal: 6 };
const resultOptions = [
  { value: 'in', label: 'In' },
  { value: 'error', label: 'Missed' },
  { value: 'unknown', label: 'Not sure' },
] as const;
const strokeOptions = [
  { value: 'forehand', label: 'Forehand' },
  { value: 'backhand', label: 'Backhand' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'Not sure' },
] as const;

function ReturnChoices<T extends string>({ label, value, options, onChange, busy, split = false }: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  busy: boolean;
  split?: boolean;
}) {
  const buttons = options.map(option => <Button key={option.value} compact toggle selected={value === option.value}
    style={optionButton} disabled={busy} onPress={() => onChange(option.value)}>{option.label}</Button>);
  return <View style={{ gap: 6 }}>
    <T small bold>{label}</T>
    <View style={optionRow}>{split ? buttons.slice(0, 2) : buttons}</View>
    {split && <View style={optionRow}>{buttons.slice(2)}</View>}
  </View>;
}

export function ServeRecordingCard({ observations, lets, busy, canRecordAce, onObservations, onLet, onEnding }: {
  observations: PointObservations;
  lets: number;
  busy: boolean;
  canRecordAce: boolean;
  onObservations: (observations: PointObservations) => void;
  onLet: () => void;
  onEnding: (ending: 'ace' | 'double-fault') => void;
}) {
  const c = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const firstServe = observations.firstServe === 'unknown';
  const secondServe = observations.firstServe === 'fault' && observations.secondServe === 'unknown';
  const awaitingServe = firstServe || secondServe;
  const serveLabel = firstServe ? 'First serve' : secondServe ? 'Second serve'
    : observations.secondServe === 'in' ? 'Second serve in' : 'First serve in';
  const utilityButton = { paddingHorizontal: 8, backgroundColor: c.bg };

  return <Card style={{ padding: 12, gap: 10 }}>
    <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Eyebrow style={{ color: c.accent }}>{awaitingServe ? 'Serve' : 'Serve recorded'}</Eyebrow>
        <T bold style={{ fontSize: 18, lineHeight: 24 }}>{serveLabel}</T>
      </View>
      <Row style={{ justifyContent: 'flex-end', gap: 6, maxWidth: '62%' }}>
        {awaitingServe && <Button compact style={utilityButton} disabled={busy} onPress={onLet}>
          {lets ? `Let · ${lets}` : 'Let'}
        </Button>}
        {!firstServe && <Button compact label="Clear serve" style={utilityButton} disabled={busy} onPress={() => onObservations({
          ...observations, firstServe: 'unknown', secondServe: 'unknown', returnStroke: 'unknown', returnResult: 'unknown',
        })}>Clear</Button>}
        {!awaitingServe && canRecordAce && <Button compact style={utilityButton} disabled={busy} onPress={() => onEnding('ace')}>Ace</Button>}
      </Row>
    </Row>
    {awaitingServe ? <View style={optionRow}>
      <Button compact style={optionButton} testID={firstServe ? 'first-in' : 'second-in'} disabled={busy}
        onPress={() => onObservations(firstServe ? { ...observations, firstServe: 'in' } : { ...observations, secondServe: 'in' })}>In</Button>
      {firstServe
        ? <Button compact style={optionButton} testID="first-fault" disabled={busy}
          onPress={() => onObservations({ ...observations, firstServe: 'fault' })}>Fault</Button>
        : <Button compact style={optionButton} disabled={busy} onPress={() => onEnding('double-fault')}>Double fault</Button>}
      <Button compact style={optionButton} disabled={busy} onPress={() => onEnding('ace')}>Ace</Button>
    </View> : <>
      <Divider />
      <ReturnChoices label="Return result" value={observations.returnResult} options={resultOptions}
        busy={busy} onChange={returnResult => onObservations({
          ...observations, returnResult, returnStroke: returnResult === 'unknown' ? 'unknown' : observations.returnStroke,
        })} />
      {observations.returnResult !== 'unknown' && <ReturnChoices label="Return stroke" value={observations.returnStroke} options={strokeOptions}
        busy={busy} split={width < 390 || fontScale > 1.15} onChange={returnStroke => onObservations({ ...observations, returnStroke })} />}
    </>}
  </Card>;
}
