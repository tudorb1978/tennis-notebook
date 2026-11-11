import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { PointObservations } from '../domain/points.ts';
import { other } from '../domain/scoring.ts';
import type { Side } from '../domain/scoring.ts';
import { strokeNames } from '../reports/report.ts';
import { Card, PlayerBadge, Row, T, useTheme, useContentWidth } from './kit.tsx';

export function ServeReturnSummary({ observations, names, server, lets = 0, showReturn = true }: {
  observations: PointObservations;
  names: readonly [string, string];
  server: Side;
  lets?: number | undefined;
  showReturn?: boolean | undefined;
}) {
  const c = useTheme();
  const { fontScale } = useWindowDimensions();
  const width = useContentWidth();
  const sideBySide = showReturn && width >= 380 && fontScale <= 1.15;
  const secondServe = observations.secondServe === 'unknown' ? 'not recorded' : observations.secondServe;
  const serve = observations.firstServe === 'in' ? 'First serve in'
    : observations.firstServe === 'fault' ? `First serve fault · Second serve ${secondServe}` : 'Serve details not recorded';
  const returnStroke = observations.returnStroke === 'unknown' ? 'Stroke not recorded' : strokeNames[observations.returnStroke];
  const returned = observations.returnResult === 'unknown'
    ? observations.returnStroke === 'unknown' ? 'Return details not recorded' : `Result not recorded · ${returnStroke}`
    : `${observations.returnResult === 'in' ? 'In' : 'Missed'} · ${returnStroke}`;
  const references = [
    { title: 'Serve', side: server, details: lets > 0 ? `${serve} · ${lets} ${lets === 1 ? 'let' : 'lets'}` : serve },
    ...(showReturn ? [{ title: 'Return', side: other(server), details: returned }] : []),
  ];

  return <View style={{ flexDirection: sideBySide ? 'row' : 'column', gap: 10, alignItems: 'stretch' }}>
    {references.map(({ title, side, details }) => <View key={title} testID={`reference-${title.toLowerCase()}`} style={{ flex: sideBySide ? 1 : undefined, minWidth: 0 }}>
      <Card style={{ padding: 10, gap: 5, backgroundColor: c.bg, flex: sideBySide ? 1 : undefined }}>
        <Row style={{ gap: 5 }}><T small bold>{title}</T><PlayerBadge side={side}>{names[side]}</PlayerBadge></Row>
        <T small muted>{details}</T>
      </Card>
    </View>)}
  </View>;
}
