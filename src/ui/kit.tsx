import React, { createContext, useContext, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Side } from '../domain/scoring.ts';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';

const court = { court: '#15382b', courtInk: '#f6f9ef', courtSub: '#c4d6c7', courtLine: '#49675a', lime: '#e0f2ae', limeInk: '#183325' };
type ReportPlayerColors = { ink: string; header: string; tint: string };
type ReportPlayers = readonly [ReportPlayerColors, ReportPlayerColors];
const light = { ...court, bg: '#f4f5ed', card: '#ffffff', ink: '#192f25', sub: '#506257', line: '#d2dbcf', accent: '#214a38', on: '#ffffff', soft: '#e8f0dd', error: '#a22e28',
  reportPlayers: [{ ink: '#235633', header: '#e1eed9', tint: '#f2f7ef' }, { ink: '#244f81', header: '#dfebf5', tint: '#f0f6fa' }] satisfies ReportPlayers };
export type Palette = typeof light;
const Theme = createContext(light);
// Keep the courtside palette consistent when the device switches to dark mode.
export function AppTheme({ children }: { children: React.ReactNode }) { return <Theme.Provider value={light}>{children}</Theme.Provider>; }
export function useTheme() { return useContext(Theme); }
export function T({ children, small = false, muted = false, bold = false, style }: { children: React.ReactNode; small?: boolean; muted?: boolean; bold?: boolean; style?: object }) {
  const c = useTheme(); return <Text style={[{ color: muted ? c.sub : c.ink, fontSize: small ? 13 : 16, lineHeight: small ? 19 : 23, fontWeight: bold ? '600' : '400' }, style]}>{children}</Text>;
}
export function Heading({ children }: { children: React.ReactNode }) { const c = useTheme(); return <Text accessibilityRole="header" style={{ fontSize: 27, lineHeight: 32, fontWeight: '700', color: c.ink, letterSpacing: -0.7 }}>{children}</Text>; }
export function Eyebrow({ children, style }: { children: React.ReactNode; style?: object }) { return <T small bold muted style={{ fontSize: 11, lineHeight: 16, letterSpacing: 1.1, textTransform: 'uppercase', ...style }}>{children}</T>; }
export function playerBadgeColors(c: Palette, side: Side) {
  return side === 0
    ? { backgroundColor: c.lime, borderColor: c.lime, ink: c.limeInk }
    : { backgroundColor: c.reportPlayers[1].header, borderColor: c.reportPlayers[1].header, ink: c.reportPlayers[1].ink };
}
export function PlayerBadge({ side, children, numberOfLines, style }: { side: Side; children: string; numberOfLines?: number; style?: StyleProp<ViewStyle> }) {
  const { backgroundColor, borderColor, ink } = playerBadgeColors(useTheme(), side);
  return <View style={[{ alignSelf: 'flex-start', flexShrink: 1, maxWidth: '100%', backgroundColor, borderColor, borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }, style]}>
    <Text numberOfLines={numberOfLines} style={{ color: ink, fontSize: 14, lineHeight: 19, fontWeight: '700' }}>{children}</Text>
  </View>;
}
export function Button({ children, onPress, primary = false, quiet = false, compact = false, selected = false, toggle = false, destructive = false, disabled = false, testID, style, label, icon }: { children: React.ReactNode; onPress: () => void; primary?: boolean; quiet?: boolean; compact?: boolean; selected?: boolean; toggle?: boolean; destructive?: boolean; disabled?: boolean; testID?: string; style?: StyleProp<ViewStyle>; label?: string; icon?: IconName }) {
  const c = useTheme(); const filled = primary || selected || destructive;
  const fillColor = destructive ? c.error : c.accent;
  const textOnly = React.Children.toArray(children).every(child => typeof child === 'string' || typeof child === 'number');
  const color = filled ? c.on : quiet ? c.sub : c.ink;
  const content = textOnly ? <Text style={{ textAlign: 'center', color, fontSize: compact ? 13 : 15, fontWeight: '600', flexShrink: 1 }}>{children}</Text> : children;
  return <Pressable accessibilityRole={toggle && Platform.OS !== 'web' ? 'togglebutton' : 'button'} accessibilityLabel={label}
    accessibilityState={toggle ? { disabled, checked: selected } : { disabled, selected }}
    aria-pressed={toggle && Platform.OS === 'web' ? selected : undefined} testID={testID} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [{ minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: compact ? 3 : 13, paddingVertical: compact ? 6 : 11, borderRadius: 12, borderWidth: 1, borderColor: filled ? fillColor : quiet ? 'transparent' : c.line, backgroundColor: filled ? fillColor : quiet ? 'transparent' : c.card, opacity: disabled ? 0.4 : pressed ? 0.78 : 1 }, style]}>
    {icon ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Icon name={icon} color={color} size={compact ? 15 : 17} />{content}
    </View> : content}
  </Pressable>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) { const c = useTheme(); return <View style={[{ backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 17, padding: 15, gap: 12 }, style]}>{children}</View>; }
export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) { return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>; }
export function Stack({ children }: { children: React.ReactNode }) { return <View style={{ gap: 14 }}>{children}</View>; }
export function Field({ label, value, onChange, multiline = false, numeric = false, maxLength = 200, placeholder, testID }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; numeric?: boolean; maxLength?: number; placeholder?: string; testID?: string }) {
  const c = useTheme();
  return <View style={{ gap: 6 }}><T small bold>{label}</T><TextInput accessibilityLabel={label} testID={testID} value={value} onChangeText={onChange} multiline={multiline} maxLength={maxLength} placeholder={placeholder} placeholderTextColor={c.sub} inputMode={numeric ? 'numeric' : 'text'} autoCorrect={!numeric} style={{ backgroundColor: c.card, color: c.ink, borderColor: c.line, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: multiline ? 95 : 48, fontSize: 16, textAlignVertical: multiline ? 'top' : 'center' }} /></View>;
}
export function Choices<T extends string | number>({ label, value, options, onChange, disabled = false, compact = false, labelIcon }: { label?: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean; compact?: boolean; labelIcon?: IconName }) {
  const c = useTheme();
  const caption = <T small bold>{label}</T>;
  return <View style={{ gap: compact ? 3 : 7 }}>
    {label ? (labelIcon ? <Row><Icon name={labelIcon} color={c.accent} />{caption}</Row> : caption) : null}
    <Row style={compact ? { gap: 4 } : undefined}>{options.map(option => <Button key={String(option.value)} compact={compact} toggle selected={value === option.value} onPress={() => onChange(option.value)} disabled={disabled}>{option.label}</Button>)}</Row>
  </View>;
}
export function Toggle({ label, checked, onChange, accessibilityLabel = label, style, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; accessibilityLabel?: string; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  return <Button toggle selected={checked} label={accessibilityLabel} style={style} disabled={disabled} onPress={() => onChange(!checked)}>{label}</Button>;
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) { const c = useTheme(); return <View accessibilityRole={error ? 'alert' : undefined} style={{ padding: 12, borderRadius: 10, backgroundColor: c.soft, borderLeftWidth: 3, borderLeftColor: error ? c.error : c.accent }}><T small style={{ color: error ? c.error : c.ink }}>{children}</T></View>; }
export function Divider() { const c = useTheme(); return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />; }
// Responsive children use their allocated content width, including in dialogs
// and split-screen windows, rather than the physical device's dimensions.
const ContentWidth = createContext<number | null>(null);
export function Content({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const [width, setWidth] = useState<number | null>(null);
  const inherited = useContentWidth();
  return <View testID={testID} style={[{ width: '100%', minWidth: 0, gap: 16 }, style]}
    onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <ContentWidth.Provider value={width ?? inherited}>{children}</ContentWidth.Provider>
  </View>;
}
export function useContentWidth() {
  const measured = useContext(ContentWidth);
  const { width } = useWindowDimensions();
  return measured ?? Math.max(0, Math.min(width, 620) - 36);
}
export function useLayout({ wide = false }: { wide?: boolean } = {}) {
  const c = useTheme();
  const { width, height } = useWindowDimensions();
  const padding = width >= 768 ? 24 : 18;
  const maxWidth = wide ? 1120 : 620;
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding, paddingTop: 10, gap: 16, paddingBottom: 28, width: '100%', maxWidth, alignSelf: 'center' },
    dialogContent: { padding: 18, paddingTop: 10, gap: 16, paddingBottom: 24, width: '100%', alignSelf: 'center' },
    header: { paddingHorizontal: padding, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', maxWidth, alignSelf: 'center' },
    two: { flexDirection: 'row', gap: 10 }, cell: { flex: 1, minWidth: 0 },
    footer: { borderTopWidth: 1, borderColor: c.line, backgroundColor: c.card },
    footerContent: { paddingVertical: 8, paddingHorizontal: padding, flexDirection: 'row', gap: 7, width: '100%', maxWidth, alignSelf: 'center' },
    modal: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: height < 500 ? 8 : 15 },
    sheet: { width: '100%', maxWidth: 680, maxHeight: '100%', minHeight: 0, flexShrink: 1, alignSelf: 'center', borderRadius: 20, backgroundColor: c.bg, overflow: 'hidden' },
  }), [c, padding, maxWidth, height]);
}
