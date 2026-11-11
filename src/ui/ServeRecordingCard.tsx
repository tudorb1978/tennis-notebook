import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { PointObservations } from '../domain/points.ts';
import { other } from '../domain/scoring.ts';
import type { Side } from '../domain/scoring.ts';
import type { ServeEntryStep } from '../domain/serveEntry.ts';
import { Button, Card, PlayerBadge, Row, T, playerBadgeColors, useTheme, useContentWidth } from './kit.tsx';
import { ServeReturnSummary } from './ServeReturnSummary.tsx';

const optionRow = { flexDirection: 'row', gap: 7 } as const;
const titles = { 'first-serve': 'First serve', 'second-serve': 'Second serve', 'return-result': 'Return result', 'return-stroke': 'Return stroke' };
const strokeOptions = [
  { value: 'forehand', label: 'Forehand' },
  { value: 'backhand', label: 'Backhand' },
] as const;

export function ServeRecordingCard({ step, names, server, observations, lets, busy, onStepBack, onSkip, onObservations, onLet, onEnding }: {
  step: Exclude<ServeEntryStep, 'point-ending'>;
  names: readonly [string, string];
  server: Side;
  observations: PointObservations;
  lets: number;
  busy: boolean;
  onStepBack?: (() => void) | undefined;
  onSkip: () => void;
  onObservations: (observations: PointObservations) => void;
  onLet: () => void;
  onEnding: (ending: 'ace' | 'double-fault') => void;
}) {
  const c = useTheme();
  const { fontScale } = useWindowDimensions();
  const width = useContentWidth();
  const serving = step === 'first-serve' || step === 'second-serve';
  const actor = serving ? server : other(server);
  const { backgroundColor, borderColor, ink } = playerBadgeColors(c, actor);
  const optionButton = { flex: fontScale > 1.15 ? undefined : 1, minWidth: 0, paddingHorizontal: 4, minHeight: 52, backgroundColor, borderColor };
  const optionText = { color: ink, textAlign: 'center' as const, fontSize: width < 350 ? 14 : 15 };
  const context = {
    'first-serve': '',
    'second-serve': 'First serve fault',
    'return-result': '',
    'return-stroke': observations.returnResult === 'error' ? 'Return missed' : 'Return in',
  }[step];
  const clearedReturn = { returnResult: 'unknown', returnStroke: 'unknown' } as const;
  let choices: React.ReactNode[];
  if (serving) {
    const first = step === 'first-serve';
    choices = [
      <Button key="in" compact style={optionButton} testID={first ? 'first-in' : 'second-in'} disabled={busy}
        onPress={() => onObservations({ ...observations, ...clearedReturn,
          firstServe: first ? 'in' : 'fault', secondServe: first ? 'unknown' : 'in' })}>
        <T bold style={optionText}>In</T>
      </Button>,
      <Button key="fault" compact style={optionButton} testID={first ? 'first-fault' : 'second-double-fault'} disabled={busy}
        onPress={() => first ? onObservations({ ...observations, ...clearedReturn, firstServe: 'fault', secondServe: 'unknown' }) : onEnding('double-fault')}>
        <T bold style={optionText}>{first ? 'Fault' : 'Double fault'}</T>
      </Button>,
      <Button key="ace" compact style={optionButton} testID="serve-ace" disabled={busy} onPress={() => onEnding('ace')}>
        <T bold style={optionText}>Ace</T>
      </Button>,
    ];
  } else if (step === 'return-result') {
    choices = ([{ value: 'in', label: 'In' }, { value: 'error', label: 'Missed' }] as const).map(({ value, label }) =>
      <Button key={value} compact style={optionButton} testID={`return-result-${value}`} disabled={busy}
        onPress={() => onObservations({ ...observations, returnResult: value, returnStroke: 'unknown' })}>
        <T bold style={optionText}>{label}</T>
      </Button>);
  } else {
    choices = strokeOptions.map(({ value, label }) => <Button key={value} compact style={optionButton} testID={`return-stroke-${value}`} disabled={busy}
      onPress={() => onObservations({ ...observations, returnStroke: value })}>
      <T bold style={optionText}>{label}</T>
    </Button>);
  }

  return <View style={{ gap: 12 }}>
    {!serving && <ServeReturnSummary observations={observations} names={names} server={server} lets={lets} showReturn={false} />}
    <View testID={`service-step-${step}`}>
      <Card style={{ padding: 12, gap: 12 }}>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <Row style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <PlayerBadge side={actor}>{names[actor]}</PlayerBadge>
            <T small muted>{serving ? 'serving' : 'returning'}</T>
          </Row>
          {onStepBack && <Button quiet compact icon="chevron-left" testID="service-back" style={{ paddingHorizontal: 5 }} disabled={busy} onPress={onStepBack}>Back</Button>}
        </Row>
        <View style={{ gap: 2 }}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <T bold style={{ fontSize: 19, lineHeight: 25, flex: 1, minWidth: 0 }}>{titles[step]}</T>
            {serving && <Button compact testID="service-let" style={{ paddingHorizontal: 12, backgroundColor: c.bg }} disabled={busy} onPress={onLet}>
              {lets ? `Let · ${lets}` : 'Let'}
            </Button>}
          </Row>
          {context ? <T small muted>{context}</T> : null}
        </View>
        <View testID="service-choices" style={fontScale > 1.15 ? { gap: 7 } : optionRow}>{choices}</View>
        <Button compact testID="skip-service-detail" style={{ backgroundColor: c.bg, paddingHorizontal: 8 }} disabled={busy} onPress={onSkip}>
          <T small bold muted style={{ textAlign: 'center' }}>I'm not sure / didn't see</T>
        </Button>
      </Card>
    </View>
  </View>;
}
