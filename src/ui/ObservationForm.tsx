import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { emptyObservations } from '../domain/points.ts';
import type { PointInput, PointObservations } from '../domain/points.ts';
import type { Side } from '../domain/scoring.ts';
import { playerNoteGroups, playerNoteLabels, questionableCallSources, rallyLengthLabels, rallyLengthOf } from '../domain/pointNotes.ts';
import type { PlayerNote } from '../domain/pointNotes.ts';
import { Button, Card, Choices, Divider, Heading, Row, Stack, T, Toggle, useLayout, useTheme } from './kit.tsx';
import { Icon } from './Icon.tsx';

function NoteSectionTitle({ icon, title, detail }: { icon: 'court' | 'note' | 'players'; title: string; detail?: string }) {
  const c = useTheme();
  return <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
    <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} color={c.accent} size={17} />
    </View>
    <View style={{ flex: 1 }}>
      <T bold>{title}</T>
      {detail && <T small muted>{detail}</T>}
    </View>
  </View>;
}

function PointNotesField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const c = useTheme();
  const [expanded, setExpanded] = useState(false);
  const textStyle = { fontSize: 16, lineHeight: 22, padding: 12, borderWidth: 1, includeFontPadding: false };
  return <View style={{ gap: 6 }}>
    <T small bold>Notes</T>
    <View>
      {/* Match the input's wrapping to size it without remounting or moving its caret. */}
      <Text aria-hidden importantForAccessibility="no-hide-descendants"
        style={{ ...textStyle, opacity: 0, minHeight: expanded ? 86 : 48, maxHeight: 180 }}>{value + '\u200b'}</Text>
      <TextInput accessibilityLabel="Notes" value={value} onChangeText={onChange} multiline maxLength={2000}
        placeholder="What stood out?" placeholderTextColor={c.sub}
        onFocus={() => setExpanded(true)}
        style={[StyleSheet.absoluteFill, textStyle, {
          width: '100%', height: '100%', textAlignVertical: 'top',
          backgroundColor: c.card, borderColor: c.line, color: c.ink, borderRadius: 10,
        }]} />
    </View>
  </View>;
}

export function ServeObservations({ value, onChange }: { value: PointObservations; onChange: (value: PointObservations) => void }) {
  return <Stack>
    <Choices label="First serve" value={value.firstServe} options={[{ value: 'in', label: 'In' }, { value: 'fault', label: 'Fault' }, { value: 'unknown', label: 'Not sure' }]} onChange={firstServe => onChange({ ...value, firstServe, secondServe: firstServe === 'fault' ? value.secondServe : 'unknown' })} />
    {value.firstServe === 'fault' && <Choices label="Second serve" value={value.secondServe} options={[{ value: 'in', label: 'In' }, { value: 'fault', label: 'Fault' }, { value: 'unknown', label: 'Not sure' }]} onChange={secondServe => onChange({ ...value, secondServe })} />}
    <Choices label="Return result" value={value.returnResult} options={[{ value: 'in', label: 'In' }, { value: 'error', label: 'Missed' }, { value: 'unknown', label: 'Not sure' }]} onChange={returnResult => onChange({ ...value, returnResult })} />
    <Choices label="Return stroke" value={value.returnStroke} options={[{ value: 'forehand', label: 'Forehand' }, { value: 'backhand', label: 'Backhand' }, { value: 'other', label: 'Other' }, { value: 'unknown', label: 'Not sure' }]} onChange={returnStroke => onChange({ ...value, returnStroke })} />
  </Stack>;
}

export function PointNotesEditor({ input, names, busy, errorBlock, onSave }: {
  input: PointInput;
  names: readonly [string, string];
  busy: boolean;
  errorBlock: React.ReactNode;
  onSave: (input: PointInput) => void;
}) {
  const c = useTheme();
  const layout = useLayout();
  const [mindsetExpanded, setMindsetExpanded] = useState(false);
  const [observations, setObservations] = useState(() => input.observations ?? emptyObservations());
  const set = <K extends keyof PointObservations>(key: K, value: PointObservations[K]) =>
    setObservations(previous => ({ ...previous, [key]: value }));
  const setPlayerNote = (side: Side, note: PlayerNote, checked: boolean) => setObservations(previous => {
    const notes: [readonly PlayerNote[], readonly PlayerNote[]] = [...(previous.playerNotes ?? [[], []])];
    notes[side] = checked ? [...notes[side], note] : notes[side].filter(value => value !== note);
    return { ...previous, playerNotes: notes };
  });
  const rally = rallyLengthOf(observations);
  const legacyCalls = observations.callIncorrect === undefined ? questionableCallSources(observations) : [];
  const source = observations.callIncorrect !== undefined || observations.disputed
    ? observations.callBy : legacyCalls.length === 1 ? legacyCalls[0] : null;
  const callBy = source === 'unknown' ? null : source ?? null;
  const updateCall = (changes: Partial<Pick<PointObservations, 'callBy' | 'disputed' | 'callIncorrect'>>) =>
    setObservations(previous => ({
      ...previous, questionableCall: false, questionableCallsBy: [],
      callBy, callIncorrect: previous.callIncorrect ?? false, ...changes,
    }));
  const playerToggleStyle = { flex: 1, minWidth: 0, paddingHorizontal: 8 };
  const gridRow = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 };
  const gridCell: ViewStyle = { width: '24%', minWidth: 48, paddingHorizontal: 0, paddingVertical: 6 };
  const firstNames = names.map(name => name.trim().split(/\s+/)[0]);
  const columnNames = firstNames[0] === firstNames[1] ? names : firstNames;
  const mindsetTitle = 'Mindset, effort and resilience';
  const marked = observations.playerNotes?.reduce((count, notes) => count + notes.length, 0) ?? 0;
  const mindsetSummary = marked ? `${marked} ${marked === 1 ? 'observation' : 'observations'} marked` : 'Optional player observations';

  return <>
    <ScrollView testID="point-notes-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={layout.content}><Stack>
    {errorBlock}
    <View style={{ gap: 4 }}>
      <Heading>Point notes</Heading>
      <T small muted>Mark what you noticed during this point.</T>
    </View>
    <PointNotesField value={observations.notes} onChange={notes => set('notes', notes)} />
    <Card style={{ padding: 12, gap: 9 }}>
      <NoteSectionTitle icon="court" title="Rally length" />
      <Row style={{ alignItems: 'stretch' }}>
        {(['long', 'very-long'] as const).map(length => <Toggle key={length} label={rallyLengthLabels[length]}
          style={{ flexGrow: 1, flexBasis: 136, maxWidth: '100%', paddingHorizontal: 8 }}
          checked={rally === length} disabled={busy} onChange={checked => set('rallyLength', checked ? length : null)} />)}
      </Row>
      {rally === 'legacy' && <T small muted>Previously marked as a long rally. Choose an estimate if you remember the length.</T>}
    </Card>
    <Card style={{ padding: 12, gap: 9 }}>
      <NoteSectionTitle icon="note" title="Questionable or disputed call" />
      <View style={{ gap: 6 }}>
        <T small bold>Call made by</T>
        <Row style={{ flexWrap: 'nowrap', alignItems: 'stretch' }}>
          {([0, 1, 'official'] as const).map(maker => <Toggle key={maker}
            label={maker === 'official' ? 'Official' : names[maker]} style={playerToggleStyle} disabled={busy}
            checked={callBy === maker} onChange={checked => updateCall({ callBy: checked ? maker : null })} />)}
        </Row>
      </View>
      {legacyCalls.some(maker => maker !== callBy) && <T small muted>Earlier call tags are kept until you edit this section.</T>}
      <Row style={{ flexWrap: 'nowrap', alignItems: 'stretch' }}>
        <Toggle label="Call was disputed" style={playerToggleStyle} checked={observations.disputed} disabled={busy}
          onChange={disputed => updateCall({ disputed })} />
        <Toggle label="Call was incorrect" style={playerToggleStyle} checked={observations.callIncorrect ?? false} disabled={busy}
          onChange={callIncorrect => updateCall({ callIncorrect })} />
      </Row>
    </Card>
    <Card style={{ padding: 12, gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={marked ? `${mindsetTitle}, ${mindsetSummary}` : mindsetTitle}
        accessibilityState={{ expanded: mindsetExpanded, disabled: busy }} aria-expanded={mindsetExpanded} disabled={busy}
        onPress={() => setMindsetExpanded(expanded => !expanded)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, opacity: pressed ? 0.7 : 1 })}>
        <NoteSectionTitle icon="players" title={mindsetTitle} detail={mindsetSummary} />
        <View style={{ transform: [{ rotate: mindsetExpanded ? '-90deg' : '90deg' }] }}>
          <Icon name="chevron-right" color={c.sub} size={17} />
        </View>
      </Pressable>
      {mindsetExpanded && <>
        <Divider />
        <T small muted>Choose the player who showed each behaviour.</T>
        {playerNoteGroups.map(({ title, notes }) => <View key={title} style={{ gap: 6, marginTop: 4 }}>
          <View style={{ ...gridRow, borderRadius: 8, paddingVertical: 6, backgroundColor: title === 'Positive' ? c.soft : c.bg }}>
            <T small bold style={{ flex: 1, paddingLeft: 8 }}>{title}</T>
            {names.map((name, side) => <Text key={side} numberOfLines={1} accessibilityLabel={name} style={{
              width: gridCell.width, minWidth: gridCell.minWidth, textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.ink,
            }}>{columnNames[side]}</Text>)}
          </View>
          {notes.map(note => <View key={note} style={{ ...gridRow, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingBottom: 6 }}>
            <T small style={{ flex: 1, paddingRight: 3 }}>{playerNoteLabels[note]}</T>
            {([0, 1] as const).map(side => {
              const checked = observations.playerNotes?.[side].includes(note) ?? false;
              return <Toggle key={side} label={checked ? '✓' : '+'} style={gridCell} disabled={busy}
                accessibilityLabel={`${names[side]} · ${playerNoteLabels[note]}`}
                checked={checked} onChange={value => setPlayerNote(side, note, value)}
              />;
            })}
          </View>)}
        </View>)}
      </>}
    </Card>
    </Stack></ScrollView>
    <View style={layout.footer}>
      <View style={layout.footerContent}>
        <Button primary style={{ flex: 1 }} testID="save-point-notes" disabled={busy}
          onPress={() => onSave({ ...input, observations })}>Save notes</Button>
      </View>
    </View>
  </>;
}
