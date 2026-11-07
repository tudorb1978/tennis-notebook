import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { localDate } from '../domain/matchDates.ts';
import type { MatchGroup } from '../storage/matchGroups.ts';
import type { PresetId } from '../domain/presets.ts';
import { emptyObservations, serveEndingIssue, serveWasIn, strokes } from '../domain/points.ts';
import type { PointInput, Stroke } from '../domain/points.ts';
import { pointLabels } from '../domain/scoring.ts';
import type { MatchScore, ScoreCorrection, Side } from '../domain/scoring.ts';
import { matchNotesMaxLength } from '../storage/model.ts';
import type { MatchRecord, PlayerProfile, RecordingMode } from '../storage/model.ts';
import { endingNames, strokeNames } from '../reports/report.ts';
import { Button, Card, Choices, Divider, Eyebrow, Field, Heading, Notice, playerBadgeColors, Row, Stack, T, useTheme } from './kit.tsx';
import { CourtLines } from './CourtLines.tsx';
import { Icon } from './Icon.tsx';
import { ServeObservations } from './ObservationForm.tsx';
import { OutcomeHelpButton } from './OutcomeGuide.tsx';

export const modeOptions: { value: RecordingMode; label: string }[] = [{ value: 'score', label: 'Score' }, { value: 'endings', label: 'Score & last shot' }, { value: 'detailed', label: 'Score, serve & last shot' }];
type SavedMatchDetails = Pick<MatchRecord, 'group' | 'date' | 'round' | 'venue' | 'surface' | 'courtSetting' | 'conditions'>;
type MatchDetails = Required<SavedMatchDetails>;
const surfaces = ['Clay', 'Artificial clay', 'Grass', 'Artificial grass (astro turf)', 'Acrylic', 'Tarmac', 'Carpet', 'Other'];
export interface SetupValues extends MatchDetails {
  playerId: string;
  playerName: string;
  opponent: string;
  preset: PresetId;
  mode: RecordingMode;
}

export function matchDetailsFrom(values: SavedMatchDetails): MatchDetails {
  return {
    group: values.group.trim(),
    date: values.date.trim(),
    round: values.round.trim(),
    venue: values.venue.trim(),
    surface: values.surface.trim(),
    courtSetting: values.courtSetting ?? '',
    conditions: values.conditions.trim(),
  };
}

function MatchContextFields({ values, update }: { values: MatchDetails; update: (details: Partial<MatchDetails>) => void }) {
  return <>
    <Field label="Date (YYYY-MM-DD)" value={values.date} onChange={date => update({ date })} maxLength={10} />
    <Field label="Round" value={values.round} onChange={round => update({ round })} />
    <Field label="Venue" value={values.venue} onChange={venue => update({ venue })} />
    <Choices label="Surface" value={values.surface} options={surfaces.map(v => ({ value: v, label: v }))} onChange={v => update({ surface: values.surface === v ? '' : v })} />
    <View style={{ gap: 7 }}>
      <T small bold>Court setting</T>
      <Row>{(['Indoor', 'Outdoor'] as const).map(setting => <Button
        key={setting} toggle selected={values.courtSetting === setting}
        onPress={() => update({ courtSetting: values.courtSetting === setting ? '' : setting })}
      >{setting}</Button>)}</Row>
    </View>
    <Field label="Conditions" value={values.conditions} onChange={conditions => update({ conditions })} placeholder="Wind, sun, temperature…" />
  </>;
}

export function MatchDetailsForm({ record, busy, onSave, onDelete }: { record: MatchRecord; busy: boolean; onSave: (details: MatchDetails) => void; onDelete: () => void }) {
  const c = useTheme();
  const [values, setValues] = useState(() => matchDetailsFrom(record));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (details: Partial<MatchDetails>) => setValues(previous => ({ ...previous, ...details }));
  if (confirmDelete) return <Stack>
    <Heading>Delete this match?</Heading>
    <T bold>{record.players[0].name} vs {record.players[1].name}</T>
    <T small muted>{[record.date, record.group].filter(Boolean).join(' · ')}</T>
    <Notice error>This permanently deletes this match and all its recorded points, notes, and statistics from this device. This cannot be undone.</Notice>
    <Button disabled={busy} onPress={() => setConfirmDelete(false)}>Keep match</Button>
    <Button destructive disabled={busy} onPress={onDelete}>Delete permanently</Button>
  </Stack>;
  return <Stack>
    <Heading>Match details</Heading>
    <Field label="Tournament or group" value={values.group} onChange={group => update({ group })} placeholder="Optional" />
    <MatchContextFields values={values} update={update} />
    <Button primary disabled={busy} onPress={() => onSave(matchDetailsFrom(values))}>Save match details</Button>
    <Divider />
    <Button quiet label="Delete match" disabled={busy} onPress={() => setConfirmDelete(true)}>
      <T small bold style={{ color: c.error, textAlign: 'center' }}>Delete match</T>
    </Button>
  </Stack>;
}

export function MatchNotesEditor({ notes, busy, onSave }: { notes: string; busy: boolean; onSave: (notes: string) => void }) {
  const [draft, setDraft] = useState(notes);
  return <Stack>
    <Heading>Match notes</Heading>
    <Field label="Notes about the match" value={draft} onChange={setDraft} multiline maxLength={matchNotesMaxLength}
      placeholder="Overall observations, patterns or things to work on…" />
    <Button primary disabled={busy} onPress={() => onSave(draft.trim())}>Save match notes</Button>
  </Stack>;
}

const setupFormats: { id: PresetId; title: string; detail: string }[] = [
  { id: 'fast4-single', title: 'One FAST4 set', detail: 'One set to 4 games' },
  { id: 'fast4-match-tiebreak', title: 'FAST4 sets + match tie-break', detail: 'Sets to 4 games · deciding tie-break to 10' },
  { id: 'normal-match-tiebreak', title: 'Normal sets + match tie-break', detail: 'Sets to 6 games · deciding tie-break to 10' },
];

const modeDetails: Record<RecordingMode, string> = {
  score: 'Record who won each point.',
  endings: 'Record the winning shot or error on each point.',
  detailed: 'Record serves, returns and how each point ended.',
};

function SetupSectionTitle({ icon, children }: { icon: 'players' | 'court' | 'sliders'; children: string }) {
  const c = useTheme();
  return <Row>
    <Icon name={icon} color={c.accent} size={18} />
    <T bold>{children}</T>
  </Row>;
}

function SetupOption({ testID, title, detail, selected, disabled, onPress }: {
  testID: string; title: string; detail: string; selected: boolean; disabled: boolean; onPress: () => void;
}) {
  const c = useTheme();
  return <Button testID={testID} label={title} selected={selected} toggle disabled={disabled} onPress={onPress}
    style={{ backgroundColor: selected ? c.soft : c.bg, borderColor: selected ? c.accent : c.line, paddingVertical: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: selected ? c.accent : c.sub, alignItems: 'center', justifyContent: 'center' }}>
        {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T bold style={{ fontSize: 14, lineHeight: 19 }}>{title}</T>
        <T small muted>{detail}</T>
      </View>
    </View>
  </Button>;
}

export function SetupForm({ players, event, preferredPlayerId, busy, onSave }: {
  players: PlayerProfile[];
  event: MatchGroup | null;
  preferredPlayerId: string | null;
  busy: boolean;
  onSave: (values: SetupValues) => void;
}) {
  const c = useTheme();
  const [values, setValues] = useState<SetupValues>(() => ({
    playerId: preferredPlayerId ?? event?.latest.players[0].id ?? players[0]?.id ?? '',
    playerName: '', opponent: '', preset: 'fast4-single', mode: 'endings',
    date: localDate(), group: event?.name ?? '', round: '', venue: event?.latest.venue ?? '',
    surface: event?.latest.surface ?? '', courtSetting: event?.latest.courtSetting ?? '', conditions: event?.latest.conditions ?? '',
  }));
  const [extra, setExtra] = useState(Boolean(event));
  const update = <K extends keyof SetupValues>(key: K, value: SetupValues[K]) => setValues(v => ({ ...v, [key]: value }));

  return <Stack>
    <Card style={{ backgroundColor: c.court, borderColor: c.courtLine, overflow: 'hidden', padding: 18, gap: 5 }}>
      <CourtLines opacity={0.45} />
      <Eyebrow style={{ color: c.lime }}>Match setup</Eyebrow>
      <Text accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.7, color: c.courtInk }}>Ready for play</Text>
      <T small style={{ color: c.courtSub }}>Choose the players, format and how much to record.</T>
    </Card>
    {event && <Notice>Adding to {event.name}</Notice>}
    <Card>
      <SetupSectionTitle icon="players">Players</SetupSectionTitle>
      {players.length > 0 && <Choices label="Your player" value={values.playerId} options={[...players.map(p => ({ value: p.id, label: p.name })), { value: '', label: '+ New player' }]} onChange={v => update('playerId', v)} disabled={busy} />}
      {!values.playerId && <Field label="Your player’s name" testID="new-player-name" value={values.playerName} onChange={v => update('playerName', v)} maxLength={80} />}
      <Field label="Opponent’s name" testID="opponent-name" value={values.opponent} onChange={v => update('opponent', v)} maxLength={80} />
    </Card>
    <Card>
      <SetupSectionTitle icon="court">Match format</SetupSectionTitle>
      <View style={{ gap: 7 }}>
        {setupFormats.map(({ id, title, detail }) => <SetupOption key={id} testID={id} title={title} detail={detail}
          selected={values.preset === id} disabled={busy} onPress={() => update('preset', id)} />)}
      </View>
      <View style={{ backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 }}>
        <T small muted>{values.preset.startsWith('fast4') ? 'Deciding point at deuce. Set tie-break at 3–3 to 7, two clear.' : 'Advantage games. Sets by two games. Set tie-break at 6–6 to 7, two clear.'}{values.preset !== 'fast4-single' ? ' At one set each, a match tie-break to 10, two clear.' : ''}</T>
      </View>
    </Card>
    <Card>
      <SetupSectionTitle icon="sliders">Recording depth</SetupSectionTitle>
      <View style={{ gap: 7 }}>
        {modeOptions.map(({ value, label }) => <SetupOption key={value} testID={`recording-depth-${value}`} title={label} detail={modeDetails[value]}
          selected={values.mode === value} disabled={busy} onPress={() => update('mode', value)} />)}
      </View>
    </Card>
    <Card style={{ gap: 8 }}>
      {!event && <Field label="Tournament or group" value={values.group} onChange={v => update('group', v)} placeholder="Optional" />}
      <Button quiet label={extra ? 'Hide event and conditions' : 'Date, event and conditions'} onPress={() => setExtra(v => !v)} disabled={busy}
        style={{ paddingHorizontal: 0 }}>
        <Row style={{ flexWrap: 'nowrap' }}>
          <Icon name="calendar" color={c.accent} size={18} />
          <T small bold style={{ flex: 1 }}>{extra ? 'Hide event and conditions' : 'Date, event and conditions'}</T>
          <View style={{ transform: [{ rotate: extra ? '-90deg' : '90deg' }] }}>
            <Icon name="chevron-right" color={c.sub} size={16} />
          </View>
        </Row>
      </Button>
      {extra && <MatchContextFields values={values} update={details => setValues(previous => ({ ...previous, ...details }))} />}
    </Card>
    <Button primary testID="save-match" disabled={busy} onPress={() => onSave(values)}>{busy ? 'Saving…' : 'Save match'}</Button>
  </Stack>;
}

export function StartMatchForm({ record, busy, onStart }: { record: MatchRecord; busy: boolean; onStart: (firstServer: Side) => void }) {
  const [firstServer, setFirstServer] = useState<Side | null>(null);
  const c = useTheme();
  return <Stack>
    <Heading>Who serves first?</Heading>
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8 }}>
      {([0, 1] as const).map(side => {
        const selected = firstServer === side;
        const player = record.players[side];
        const { backgroundColor, borderColor, ink } = playerBadgeColors(c, side);
        return <Button key={side} toggle selected={selected} disabled={busy} testID={`first-server-${side}`} label={player.name}
          style={{ flex: 1, minWidth: 0, backgroundColor, borderWidth: 2, borderColor: selected ? ink : borderColor }}
          onPress={() => setFirstServer(side)}>
          <View style={{ alignItems: 'center', gap: 3 }}>
            <T bold style={{ color: ink, textAlign: 'center' }}>{player.name}</T>
            <T small style={{ color: ink }}>{side === 0 ? 'Your player' : 'Opponent'}</T>
          </View>
        </Button>;
      })}
    </View>
    <Button primary icon="record" testID="start-match" disabled={busy || firstServer === null}
      onPress={() => { if (firstServer !== null) onStart(firstServer); }}>Start match</Button>
  </Stack>;
}

export function CorrectionForm({ record, score, busy, onSave }: { record: MatchRecord; score: MatchScore; busy: boolean; onSave: (correction: ScoreCorrection, reason: string) => void }) {
  const current = score.current!; const rules = record.format.stages[current.index]!;
  const [games, setGames] = useState<[string, string]>(current.games.map(String) as [string, string]);
  const [points, setPoints] = useState<[string, string]>(current.phase === 'game' ? pointLabels(score).map(v => String(['0', '15', '30', '40', 'Ad'].indexOf(v))) as [string, string] : current.points.map(String) as [string, string]);
  const [server, setServer] = useState(current.server); const [reason, setReason] = useState('Scoreboard correction');
  const tie = rules.kind === 'match-tie-break' || (rules.tieBreakAt !== null && Number(games[0]) === rules.tieBreakAt && Number(games[1]) === rules.tieBreakAt);
  return <Stack><Heading>Correct the score</Heading><T muted>Set the active score and next server. Missing points will not create shot statistics.</T>{record.players.map((p, i) => <Card key={i}><T bold>{p.name}</T>{rules.kind === 'set' && <Field label={`${p.name} games`} value={games[i]!} numeric maxLength={3} onChange={value => { setGames(g => { const n: [string, string] = [...g]; n[i] = value; return n; }); setPoints(['0', '0']); }} />}{tie ? <Field label={`${p.name} points`} value={points[i]!} numeric maxLength={5} onChange={value => setPoints(pv => { const n: [string, string] = [...pv]; n[i] = value; return n; })} /> : <Choices label="Points" value={points[i]!} options={['0', '15', '30', '40', 'Ad'].map((label, j) => ({ value: String(j), label }))} onChange={value => setPoints(pv => { const n: [string, string] = [...pv]; n[i] = value; return n; })} />}</Card>)}<Choices<Side> label="Next server" value={server} options={record.players.map((p, i) => ({ value: i as Side, label: p.name }))} onChange={setServer} /><Field label="Reason" value={reason} onChange={setReason} /><Button primary disabled={busy} testID="apply-correction" onPress={() => onSave({ games: games.map(v => v.trim() ? Number(v) : NaN) as [number, number], points: points.map(v => v.trim() ? Number(v) : NaN) as [number, number], nextServer: server }, reason)}>Apply correction</Button></Stack>;
}

export function PointEditor({ record, input, server, busy, onSave, onOutcomeHelp }: { record: MatchRecord; input: PointInput; server: Side; busy: boolean; onSave: (input: PointInput) => void; onOutcomeHelp: () => void }) {
  const [type, setType] = useState<PointInput['type']>(input.type);
  const [actualServer, setActualServer] = useState(server);
  const [actor, setActor] = useState<Side>(input.type === 'winner-only' ? input.winner : input.actor);
  const [ending, setEnding] = useState<'winner' | 'unforced-error' | 'forced-error'>(input.type === 'ending' ? input.ending : 'winner');
  const [stroke, setStroke] = useState<Stroke | ''>(input.type === 'ending' ? input.stroke : '');
  const [observations, setObservations] = useState(input.observations ?? emptyObservations());
  const [error, setError] = useState('');
  const canPickServe = actor === actualServer && (ending === 'winner' || !serveWasIn(observations));
  const save = () => {
    if (type === 'ending' && !stroke) { setError('Choose the stroke, or explicitly choose Not sure.'); return; }
    const next: PointInput = type === 'winner-only' ? { type, winner: actor, observations } : type === 'ending' ? { type, actor, ending, stroke: stroke as Stroke, observations } : { type, actor, observations };
    const issue = serveEndingIssue(next);
    if (issue) { setError(issue); return; }
    onSave(input.actualServer === undefined && actualServer === server ? next : { ...next, actualServer });
  };
  const players = record.players.map((player, i) => ({ value: i as Side, label: player.name }));
  return <Stack>
    <View style={{ gap: 4 }}>
      <Heading>Edit point</Heading>
      <T small muted>Changes to the outcome can update the score.</T>
    </View>
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T bold>Outcome and stroke</T>
        <OutcomeHelpButton onPress={onOutcomeHelp} disabled={busy} />
      </Row>
      <Choices label="Recorded outcome" value={type} options={[
        { value: 'ending', label: 'Winner / error' }, { value: 'ace', label: 'Ace' },
        { value: 'double-fault', label: 'Double fault' }, { value: 'winner-only', label: 'Point winner only' },
      ]} onChange={setType} disabled={busy} />
      <Choices<Side> label={type === 'winner-only' ? 'Awarded point to' : 'Player playing the final shot'}
        value={actor} options={players} onChange={setActor} disabled={busy}
      />
      {type === 'ending' && <>
        <Choices label="Ending" value={ending}
          options={(['winner', 'unforced-error', 'forced-error'] as const).map(v => ({ value: v, label: endingNames[v] }))}
          onChange={setEnding} disabled={busy}
        />
        <Choices<Stroke | ''> label="Stroke" value={stroke} options={strokes.filter(v => v !== 'serve' || canPickServe).map(v => ({ value: v, label: strokeNames[v] }))}
          onChange={setStroke} disabled={busy}
        />
        {stroke === 'serve' && !canPickServe && <T small muted>Choose a different stroke or correct the serve details.</T>}
      </>}
      {(type === 'ace' || type === 'double-fault') && <T small muted>Stroke recorded as a serve.</T>}
    </Card>
    <Card>
      <T bold>Serve and return</T>
      <Choices<Side> label="Server for this point" value={actualServer} options={players} disabled={busy} onChange={side => {
        setActualServer(side);
        if (type === 'ace' || type === 'double-fault' || (type === 'ending' && stroke === 'serve')) setActor(side);
      }} />
      <ServeObservations value={observations} onChange={setObservations} />
    </Card>
    {error ? <Notice error>{error}</Notice> : null}
    <Button primary testID="save-point-details" disabled={busy} onPress={save}>Save changes</Button>
  </Stack>;
}

export function FinishForm({ record, busy, onSave }: { record: MatchRecord; busy: boolean; onSave: (kind: 'retire' | 'abandon', player: Side) => void }) {
  const [kind, setKind] = useState<'retire' | 'abandon'>('retire'); const [player, setPlayer] = useState<Side>(0);
  return <Stack><Heading>Finish early</Heading><Choices label="Reason" value={kind} options={[{ value: 'retire', label: 'Player retirement' }, { value: 'abandon', label: 'Abandoned' }]} onChange={setKind} />{kind === 'retire' ? <Choices<Side> label="Retiring player" value={player} options={record.players.map((p, i) => ({ value: i as Side, label: p.name }))} onChange={setPlayer} /> : <Notice>The score will be kept without assigning a winner. Use Pause for a match that may resume.</Notice>}<Button primary disabled={busy} onPress={() => onSave(kind, player)}>Finish match</Button></Stack>;
}
