import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { Side } from '../domain/scoring.ts';
import { endingNames, strokeNames } from '../reports/report.ts';
import { Icon } from './Icon.tsx';
import { OutcomeHelpButton } from './OutcomeGuide.tsx';
import { Button, Card, Heading, PlayerBadge, Row, Stack, T, playerBadgeColors, useTheme } from './kit.tsx';

export type LastShotEnding = 'winner' | 'unforced-error' | 'forced-error';
export type QuickShotStroke = 'forehand' | 'backhand' | 'volley';
export type MoreShotStroke = 'overhead' | 'other' | 'unknown' | 'serve';

const quickStrokes: readonly QuickShotStroke[] = ['forehand', 'backhand', 'volley'];
const descriptions = { winner: 'hit a winner', 'unforced-error': 'made an unforced error', 'forced-error': 'made a forced error' };

export function LastShotCard({ names, winner, busy, onShot, onMore, onUnknown, onHelp }: {
  names: readonly [string, string];
  winner: Side;
  busy: boolean;
  onShot: (actor: Side, ending: LastShotEnding, stroke: QuickShotStroke) => void;
  onMore: (actor: Side, ending: LastShotEnding) => void;
  onUnknown: () => void;
  onHelp: () => void;
}) {
  const c = useTheme();
  const { fontScale } = useWindowDimensions();
  const split = fontScale > 1.15;
  return <Card style={{ padding: 10, gap: 14 }}>
    <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
      <T bold style={{ fontSize: 19, flex: 1, minWidth: 0 }}>Last shot of the rally</T>
      <OutcomeHelpButton onPress={onHelp} disabled={busy} />
    </Row>
    {([0, 1] as const).flatMap(side => {
      const endings: readonly LastShotEnding[] = side === winner ? ['winner'] : ['unforced-error', 'forced-error'];
      const name = names[side];
      const { backgroundColor, borderColor, ink } = playerBadgeColors(c, side);
      const buttonStyle = { flex: 1, minWidth: 0, paddingHorizontal: 2, minHeight: 48, backgroundColor, borderColor };
      return endings.map(ending => {
        const buttons = [
          ...quickStrokes.map(stroke => <Button key={stroke} compact style={buttonStyle} disabled={busy}
            testID={`shot-${side}-${ending}-${stroke}`} label={`${name} ${endingNames[ending]} ${strokeNames[stroke]}`}
            onPress={() => onShot(side, ending, stroke)}>
            <T small bold style={{ color: ink, fontSize: split ? 14 : 12, textAlign: 'center' }}>{strokeNames[stroke]}</T>
          </Button>),
          <Button key="more" compact style={[buttonStyle, !split && { flex: 0, width: 48, minWidth: 48 }]} disabled={busy} testID={`more-shots-${side}-${ending}`}
            label={`${name} ${endingNames[ending]}, more shot types`} onPress={() => onMore(side, ending)}>
            <View style={{ alignItems: 'center' }}><Icon name="racket" color={ink} size={24} /></View>
          </Button>,
        ];
        return <View key={`${side}-${ending}`} testID={`ending-section-${side}-${ending}`} style={{ gap: 7 }}>
          <Row style={{ gap: 6 }}>
            <PlayerBadge side={side}>{name}</PlayerBadge>
            <T small bold>{descriptions[ending]}</T>
          </Row>
          <View style={{ flexDirection: 'row', gap: 5 }}>{split ? buttons.slice(0, 2) : buttons}</View>
          {split && <View style={{ flexDirection: 'row', gap: 5 }}>{buttons.slice(2)}</View>}
        </View>;
      });
    })}
    <View style={{ marginTop: 4, borderTopWidth: 2, borderTopColor: '#8c8c8c', paddingTop: 14 }}>
      <Button style={{ backgroundColor: c.bg, borderWidth: StyleSheet.hairlineWidth }} disabled={busy} onPress={onUnknown}>I'm not sure how it ended</Button>
    </View>
  </Card>;
}

export function MoreShotOptions({ name, side, ending, busy, allowServe, onStroke }: {
  name: string;
  side: Side;
  ending: LastShotEnding;
  busy: boolean;
  allowServe: boolean;
  onStroke: (stroke: MoreShotStroke) => void;
}) {
  const { backgroundColor, borderColor, ink } = playerBadgeColors(useTheme(), side);
  const options: readonly MoreShotStroke[] = allowServe ? ['overhead', 'other', 'serve', 'unknown'] : ['overhead', 'other', 'unknown'];
  return <Stack>
    <Heading>More shot types</Heading>
    <Row><PlayerBadge side={side}>{name}</PlayerBadge><T small bold>{endingNames[ending]}</T></Row>
    <View style={{ gap: 8 }}>
      {options.map(stroke => <Button key={stroke} testID={`stroke-${stroke}`} disabled={busy}
        style={{ minHeight: 48, backgroundColor, borderColor }} onPress={() => onStroke(stroke)}>
        <T bold style={{ color: ink, textAlign: 'center' }}>{stroke === 'unknown' ? "I'm not sure" : strokeNames[stroke]}</T>
      </Button>)}
    </View>
  </Stack>;
}
