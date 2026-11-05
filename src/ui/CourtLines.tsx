import React from 'react';
import { View } from 'react-native';
import { useTheme } from './kit.tsx';

const width = 172;
const height = 103;

export function CourtLines({ opacity = 0.65, centered = false }: { opacity?: number; centered?: boolean }) {
  const { courtLine } = useTheme();
  return <View pointerEvents="none" accessible={false} style={[{
    position: 'absolute', width, height,
    opacity, borderWidth: 1, borderColor: courtLine, transform: [{ rotate: '-18deg' }],
  }, centered ? { left: '50%', top: '50%', marginLeft: -width / 2, marginTop: -height / 2 } : { right: -27, top: 12 }]}>
    <View style={{ position: 'absolute', left: 0, right: 0, top: 11, bottom: 11, borderTopWidth: 1, borderBottomWidth: 1, borderColor: courtLine }} />
    <View style={{ position: 'absolute', left: 49, right: 49, top: 11, bottom: 11, borderWidth: 1, borderColor: courtLine }} />
    <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeftWidth: 1, borderColor: courtLine }} />
  </View>;
}
