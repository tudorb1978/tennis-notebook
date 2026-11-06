import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { emptyObservations } from '../domain/points.ts';
import type { PointInput, PointObservations } from '../domain/points.ts';
import type { Side } from '../domain/scoring.ts';
import { playerNoteLabels, playerNotes, questionableCallSources, rallyLengthLabels, rallyLengthOf } from '../domain/pointNotes.ts';
import type { CallSource, PlayerNote } from '../domain/pointNotes.ts';
import { Button, Card, Choices, Field, Heading, Row, Stack, T, Toggle, useTheme } from './kit.tsx';

export function ServeObservations({ value, onChange }: { value: PointObservations; onChange: (value: PointObservations) => void }) {
  return <Stack>
    <Choices label="First serve" value={value.firstServe} options={[{ value: 'in', label: 'In' }, { value: 'fault', label: 'Fault' }, { value: 'unknown', label: 'Not sure' }]} onChange={firstServe => onChange({ ...value, firstServe, secondServe: firstServe === 'fault' ? value.secondServe : 'unknown' })} />
    {value.firstServe === 'fault' && <Choices label="Second serve" value={value.secondServe} options={[{ value: 'in', label: 'In' }, { value: 'fault', label: 'Fault' }, { value: 'unknown', label: 'Not sure' }]} onChange={secondServe => onChange({ ...value, secondServe })} />}
    <Choices label="Return result" value={value.returnResult} options={[{ value: 'in', label: 'In' }, { value: 'error', label: 'Missed' }, { value: 'unknown', label: 'Not sure' }]} onChange={returnResult => onChange({ ...value, returnResult })} />
    <Choices label="Return stroke" value={value.returnStroke} options={[{ value: 'forehand', label: 'Forehand' }, { value: 'backhand', label: 'Backhand' }, { value: 'other', label: 'Other' }, { value: 'unknown', label: 'Not sure' }]} onChange={returnStroke => onChange({ ...value, returnStroke })} />
  </Stack>;
}

export function PointNotesEditor({ input, names, busy, onSave }: {
  input: PointInput;
  names: readonly [string, string];
  busy: boolean;
  onSave: (input: PointInput) => void;
}) {
  const c = useTheme();
  const [observations, setObservations] = useState(() => {
    const previous = input.observations ?? emptyObservations();
    return previous.questionableCall ? { ...previous, questionableCallsBy: questionableCallSources(previous) } : previous;
  });
  const set = <K extends keyof PointObservations>(key: K, value: PointObservations[K]) =>
    setObservations(previous => ({ ...previous, [key]: value }));
  const setQuestionableCall = (side: Side, checked: boolean) => setObservations(previous => {
    const calls = questionableCallSources(previous).filter(source => typeof source === 'number' && source !== side);
    return { ...previous, questionableCallsBy: checked ? [...calls, side] : calls };
  });
  const setPlayerNote = (side: Side, note: PlayerNote, checked: boolean) => setObservations(previous => {
    const notes: [readonly PlayerNote[], readonly PlayerNote[]] = [...(previous.playerNotes ?? [[], []])];
    notes[side] = checked ? [...notes[side], note] : notes[side].filter(value => value !== note);
    return { ...previous, playerNotes: notes };
  });
  const rally = rallyLengthOf(observations);
  const calls = questionableCallSources(observations);
  const legacyCall = calls.find(source => typeof source !== 'number');
  const playerToggleStyle = { flex: 1, minWidth: 0, paddingHorizontal: 8 };
  const gridRow = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 };
  const gridCell: ViewStyle = { width: '24%', minWidth: 48, paddingHorizontal: 0, paddingVertical: 6 };
  const firstNames = names.map(name => name.trim().split(/\s+/)[0]);
  const columnNames = firstNames[0] === firstNames[1] ? names : firstNames;

  return <Stack>
    <View style={{ gap: 4 }}>
      <Heading>Point notes</Heading>
      <T small muted>Mark what you noticed during this point.</T>
    </View>
    <Card>
      <T bold>More about the point</T>
      <View style={{ gap: 7 }}>
        <T small bold>Rally length</T>
        <Row>
          {(['long', 'very-long'] as const).map(length => <Toggle key={length} label={rallyLengthLabels[length]}
            checked={rally === length} disabled={busy} onChange={checked => set('rallyLength', checked ? length : null)} />)}
        </Row>
      </View>
      {rally === 'legacy' && <T small muted>Previously marked as a long rally. Choose an estimate if you remember the length.</T>}
      <T small bold>Questionable call</T>
      <Row style={{ flexWrap: 'nowrap', alignItems: 'stretch' }}>
        {([0, 1] as const).map(side => <Toggle key={side} label={names[side]} style={playerToggleStyle} disabled={busy}
          accessibilityLabel={`Questionable call by ${names[side]}`}
          checked={calls.includes(side)} onChange={checked => setQuestionableCall(side, checked)}
        />)}
      </Row>
      {legacyCall && <T small muted>{legacyCall === 'official' ? 'An earlier note attributed the call to an official.' : 'An earlier note marked a call without naming a player.'}</T>}
      <Toggle label="Dispute about the outcome" checked={observations.disputed} disabled={busy} onChange={v => set('disputed', v)} />
      {observations.disputed && <Choices<CallSource>
        label="Call made by" value={observations.callBy ?? 'unknown'}
        options={[{ value: 0, label: names[0] }, { value: 1, label: names[1] }, { value: 'official', label: 'Official' }, { value: 'unknown', label: 'Not known' }]}
        onChange={v => set('callBy', v)}
      />}
    </Card>
    <Card style={{ gap: 8 }}>
      <T bold>Mindset, effort and resilience</T>
      <T small muted>Choose the player who showed each behaviour.</T>
      <View style={gridRow}>
        <View style={{ flex: 1 }} />
        {names.map((name, side) => <Text key={side} numberOfLines={1} accessibilityLabel={name} style={{
          width: gridCell.width, minWidth: gridCell.minWidth, textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.ink,
        }}>{columnNames[side]}</Text>)}
      </View>
      {playerNotes.map(note => <View key={note} style={{ ...gridRow, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingTop: 6 }}>
        <T small style={{ flex: 1, paddingRight: 3 }}>{playerNoteLabels[note]}</T>
        {([0, 1] as const).map(side => {
          const checked = observations.playerNotes?.[side].includes(note) ?? false;
          return <Toggle key={side} label={checked ? '✓' : '+'} style={gridCell} disabled={busy}
            accessibilityLabel={`${names[side]} · ${playerNoteLabels[note]}`}
            checked={checked} onChange={value => setPlayerNote(side, note, value)}
          />;
        })}
      </View>)}
    </Card>
    <Field label="Notes" value={observations.notes} onChange={v => set('notes', v)} multiline maxLength={2000} placeholder="What stood out?" />
    <Button primary testID="save-point-notes" disabled={busy} onPress={() => onSave({ ...input, observations })}>Save notes</Button>
  </Stack>;
}
