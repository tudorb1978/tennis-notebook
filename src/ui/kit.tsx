import React, { createContext, useContext, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Side } from '../domain/scoring.ts';

const court = { court: '#15382b', courtInk: '#f6f9ef', courtSub: '#c4d6c7', courtLine: '#49675a', lime: '#e0f2ae', limeInk: '#183325' };
const light = { ...court, bg: '#f4f5ed', card: '#ffffff', ink: '#192f25', sub: '#506257', line: '#d2dbcf', accent: '#214a38', on: '#ffffff', soft: '#e8f0dd', error: '#a22e28' };
const dark = { ...court, bg: '#151e19', card: '#202b24', ink: '#edf4ed', sub: '#becdc1', line: '#495d50', accent: '#d5e8aa', on: '#172c1c', soft: '#2b4131', error: '#ffb4a8' };
export type Palette = typeof light;
const Theme = createContext(light);
export function AppTheme({ children }: { children: React.ReactNode }) { const scheme = useColorScheme(); return <Theme.Provider value={scheme === 'dark' ? dark : light}>{children}</Theme.Provider>; }
export function useTheme() { return useContext(Theme); }
export function T({ children, small = false, muted = false, bold = false, style }: { children: React.ReactNode; small?: boolean; muted?: boolean; bold?: boolean; style?: object }) {
  const c = useTheme(); return <Text style={[{ color: muted ? c.sub : c.ink, fontSize: small ? 13 : 16, lineHeight: small ? 19 : 23, fontWeight: bold ? '600' : '400' }, style]}>{children}</Text>;
}
export function Heading({ children }: { children: React.ReactNode }) { const c = useTheme(); return <Text accessibilityRole="header" style={{ fontSize: 27, lineHeight: 32, fontWeight: '700', color: c.ink, letterSpacing: -0.7 }}>{children}</Text>; }
export function Eyebrow({ children, style }: { children: React.ReactNode; style?: object }) { return <T small bold muted style={{ fontSize: 11, lineHeight: 16, letterSpacing: 1.1, textTransform: 'uppercase', ...style }}>{children}</T>; }
export function playerBadgeColors(c: Palette, side: Side) {
  return side === 0
    ? { backgroundColor: c.lime, borderColor: c.lime, ink: c.limeInk }
    : { backgroundColor: c.card, borderColor: c.line, ink: c.ink };
}
export function PlayerBadge({ side, children, numberOfLines, style }: { side: Side; children: string; numberOfLines?: number; style?: StyleProp<ViewStyle> }) {
  const { backgroundColor, borderColor, ink } = playerBadgeColors(useTheme(), side);
  return <View style={[{ alignSelf: 'flex-start', flexShrink: 1, maxWidth: '100%', backgroundColor, borderColor, borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }, style]}>
    <Text numberOfLines={numberOfLines} style={{ color: ink, fontSize: 14, lineHeight: 19, fontWeight: '700' }}>{children}</Text>
  </View>;
}
export function Button({ children, onPress, primary = false, quiet = false, compact = false, selected = false, toggle = false, destructive = false, disabled = false, testID, style, label }: { children: React.ReactNode; onPress: () => void; primary?: boolean; quiet?: boolean; compact?: boolean; selected?: boolean; toggle?: boolean; destructive?: boolean; disabled?: boolean; testID?: string; style?: StyleProp<ViewStyle>; label?: string }) {
  const c = useTheme(); const filled = primary || selected || destructive;
  const fillColor = destructive ? c.error : c.accent;
  const textOnly = React.Children.toArray(children).every(child => typeof child === 'string' || typeof child === 'number');
  return <Pressable accessibilityRole={toggle && Platform.OS !== 'web' ? 'togglebutton' : 'button'} accessibilityLabel={label}
    accessibilityState={toggle ? { disabled, checked: selected } : { disabled, selected }}
    aria-pressed={toggle && Platform.OS === 'web' ? selected : undefined} testID={testID} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [{ minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: compact ? 3 : 13, paddingVertical: compact ? 6 : 11, borderRadius: 11, borderWidth: 1, borderColor: filled ? fillColor : quiet ? 'transparent' : c.line, backgroundColor: filled ? fillColor : quiet ? 'transparent' : c.card, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }, style]}>
    {textOnly ? <Text style={{ textAlign: 'center', color: filled ? c.on : quiet ? c.sub : c.ink, fontSize: compact ? 13 : 15, fontWeight: '600' }}>{children}</Text> : children}
  </Pressable>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) { const c = useTheme(); return <View style={[{ backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 17, padding: 15, gap: 12 }, style]}>{children}</View>; }
export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) { return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>; }
export function Stack({ children }: { children: React.ReactNode }) { return <View style={{ gap: 14 }}>{children}</View>; }
export function Field({ label, value, onChange, multiline = false, numeric = false, maxLength = 200, placeholder, testID }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; numeric?: boolean; maxLength?: number; placeholder?: string; testID?: string }) {
  const c = useTheme();
  return <View style={{ gap: 6 }}><T small bold>{label}</T><TextInput accessibilityLabel={label} testID={testID} value={value} onChangeText={onChange} multiline={multiline} maxLength={maxLength} placeholder={placeholder} placeholderTextColor={c.sub} inputMode={numeric ? 'numeric' : 'text'} autoCorrect={!numeric} style={{ backgroundColor: c.card, color: c.ink, borderColor: c.line, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: multiline ? 95 : 48, fontSize: 16, textAlignVertical: multiline ? 'top' : 'center' }} /></View>;
}
export function Choices<T extends string | number>({ label, value, options, onChange, disabled = false, compact = false }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean; compact?: boolean }) {
  return <View style={{ gap: compact ? 3 : 7 }}><T small bold>{label}</T><Row style={compact ? { gap: 4 } : undefined}>{options.map(option => <Button key={String(option.value)} compact={compact} toggle selected={value === option.value} onPress={() => onChange(option.value)} disabled={disabled}>{option.label}</Button>)}</Row></View>;
}
export function Toggle({ label, checked, onChange, accessibilityLabel = label, style, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; accessibilityLabel?: string; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  return <Button toggle selected={checked} label={accessibilityLabel} style={style} disabled={disabled} onPress={() => onChange(!checked)}>{label}</Button>;
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) { const c = useTheme(); return <View accessibilityRole={error ? 'alert' : undefined} style={{ padding: 12, borderRadius: 10, backgroundColor: c.soft, borderLeftWidth: 3, borderLeftColor: error ? c.error : c.accent }}><T small style={{ color: error ? c.error : c.ink }}>{children}</T></View>; }
export function Divider() { const c = useTheme(); return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />; }
export function useLayout() {
  const c = useTheme(); return useMemo(() => StyleSheet.create({ root: { flex: 1, backgroundColor: c.bg }, content: { padding: 18, paddingTop: 10, gap: 16, paddingBottom: 28, width: '100%', maxWidth: 620, alignSelf: 'center' }, header: { paddingHorizontal: 18, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', maxWidth: 620, alignSelf: 'center' }, two: { flexDirection: 'row', gap: 10 }, cell: { flex: 1, minWidth: 0 }, footer: { borderTopWidth: 1, borderColor: c.line, backgroundColor: c.card }, footerContent: { paddingVertical: 8, paddingHorizontal: 18, flexDirection: 'row', gap: 7, width: '100%', maxWidth: 620, alignSelf: 'center' }, modal: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 15 }, sheet: { width: '100%', maxWidth: 600, maxHeight: '95%', alignSelf: 'center', borderRadius: 20, backgroundColor: c.bg, overflow: 'hidden' } }), [c]);
}
