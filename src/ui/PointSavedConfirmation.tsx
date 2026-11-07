import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import type { PointSavedSummary } from './pointSaved.ts';
import { useTheme } from './kit.tsx';

export function PointSavedConfirmation({ summary, names, onDone }: {
  summary: PointSavedSummary;
  names: readonly [string, string];
  onDone: () => void;
}) {
  const c = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const done = useRef(onDone);
  done.current = onDone;
  const announcement = useRef(`Point saved. ${summary.context}. Score ${summary.score}, with ${names[0]} first and ${names[1]} second. ${summary.next}.`).current;
  const [webAnnouncement, setWebAnnouncement] = useState('');

  useEffect(() => {
    let active = true;
    let changedPreference: boolean | undefined;
    let entrance: Animated.CompositeAnimation | undefined;
    let lifetime: Animated.CompositeAnimation | undefined;
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      changedPreference = reduced;
      if (reduced) {
        entrance?.stop();
        scale.setValue(1);
      }
    });

    const start = (reduced: boolean) => {
      if (!active) return;
      if (!reduced) {
        scale.setValue(0.975);
        entrance = Animated.timing(scale, { toValue: 1, duration: 190, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' });
        entrance.start();
      }
      lifetime = Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.delay(1150),
        Animated.timing(opacity, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]);
      lifetime.start(({ finished }) => { if (finished && active) done.current(); });
    };

    void AccessibilityInfo.isReduceMotionEnabled().then(
      reduced => start(changedPreference ?? reduced),
      () => start(true),
    );
    if (Platform.OS === 'web') setWebAnnouncement(announcement);
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions(announcement, { queue: true });
    return () => {
      active = false;
      preference?.remove();
      entrance?.stop();
      lifetime?.stop();
    };
  }, [announcement, opacity, scale]);

  const scoreSize = summary.score.length > 18 ? 21 : summary.score.length > 12 ? 30 : summary.score.length > 8 ? 36 : 46;
  return <Animated.View testID="point-saved-confirmation" pointerEvents="none" accessible={Platform.OS !== 'web'} role="status"
    accessibilityLabel={Platform.OS === 'web' ? undefined : announcement} accessibilityLiveRegion="polite"
    style={[StyleSheet.absoluteFill, { backgroundColor: c.court, opacity, alignItems: 'center', justifyContent: 'center', zIndex: 2 }]}>
    {Platform.OS === 'web' && <Text style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>{webAnnouncement}</Text>}
    <Animated.View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: '100%', maxWidth: 480, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', gap: 4, transform: [{ scale }] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 23, height: 23, borderRadius: 12, backgroundColor: c.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.limeInk, fontSize: 16, lineHeight: 21, fontWeight: '700' }}>✓</Text>
        </View>
        <Text style={{ color: c.lime, fontSize: 12, lineHeight: 18, fontWeight: '700', letterSpacing: 1 }}>Point saved</Text>
      </View>
      <Text testID="point-saved-score" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
        style={{ alignSelf: 'stretch', textAlign: 'center', color: c.courtInk, fontSize: scoreSize, lineHeight: Math.round(scoreSize * 1.17), fontWeight: '700', letterSpacing: 0.3, fontVariant: ['tabular-nums'] }}>
        {summary.score}
      </Text>
      <Text testID="point-saved-context" style={{ color: c.courtInk, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>{summary.context}</Text>
      <Text style={{ color: c.courtSub, fontSize: 12, lineHeight: 17, textAlign: 'center' }}>{summary.next}</Text>
    </Animated.View>
  </Animated.View>;
}
