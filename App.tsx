import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { randomUUID } from 'expo-crypto';
import { useKeepAwake } from 'expo-keep-awake';
import { appendEvent, replayMatch, undoLast } from './src/domain/history.ts';
import type { MatchEvent } from './src/domain/history.ts';
import { hasPointNotes } from './src/domain/pointNotes.ts';
import { emptyObservations, serveWasIn, strokes } from './src/domain/points.ts';
import type { PointInput, PointObservations, Stroke } from './src/domain/points.ts';
import { presets } from './src/domain/presets.ts';
import { other } from './src/domain/scoring.ts';
import type { LifecycleAction, ScoreCorrection, Side } from './src/domain/scoring.ts';
import { openRepository } from './src/storage/database.ts';
import type { ImportPreview, MatchRepository } from './src/storage/repository.ts';
import { groupMatches, matchEventKey } from './src/storage/matchGroups.ts';
import type { MatchGroup } from './src/storage/matchGroups.ts';
import { emptyDraft } from './src/storage/model.ts';
import type { MatchRecord, PlayerProfile } from './src/storage/model.ts';
import { endingNames, reportCSV, strokeNames, timingLabels } from './src/reports/report.ts';
import { pointNoteLabels, pointNoteSummary } from './src/reports/pointNotes.ts';
import { pickBackup, sharePDF, sharePlayerPerformancePDF, shareText } from './src/reports/files.ts';
import { AppTheme, Button, Card, Choices, Eyebrow, Heading, Notice, Row, Stack, T, useLayout, useTheme } from './src/ui/kit.tsx';
import { CorrectionForm, FinishForm, matchDetailsFrom, MatchDetailsForm, modeOptions, PointEditor, SetupForm } from './src/ui/forms.tsx';
import type { SetupValues } from './src/ui/forms.tsx';
import { PointNotesEditor } from './src/ui/ObservationForm.tsx';
import { OutcomeGuide, OutcomeHelpButton } from './src/ui/OutcomeGuide.tsx';
import { Scoreboard } from './src/ui/Scoreboard.tsx';
import { MatchComparison, StatsTable } from './src/ui/Stats.tsx';
import { PlayerPerformance } from './src/ui/PlayerPerformance.tsx';
import { MatchLibrary } from './src/ui/MatchLibrary.tsx';

type Screen = 'loading' | 'home' | 'setup' | 'match' | 'player-report';
type Tab = 'record' | 'history' | 'report';
type PointPanel = 'edit-point' | 'point-notes';
type Panel = { kind: 'correct' } | { kind: 'finish' } | { kind: 'recording-mode' } | { kind: 'match-details' } | { kind: 'pick-event-for-match' } | { kind: 'pick-event-for-report' } | { kind: PointPanel; id: string } | { kind: 'import'; text: string; preview: ImportPreview } | null;
function AwakeWhileRecording() { useKeepAwake('tennis-recording'); return null; }
function Main() {
  const c = useTheme(); const layout = useLayout();
  const { height, fontScale } = useWindowDimensions();
  const mainScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const repository = useRef<MatchRepository | null>(null);
  const current = useRef<MatchRecord | null>(null);
  const saving = useRef(false);
  const retry = useRef<(() => Promise<unknown>) | null>(null);
  const [screen, setScreen] = useState<Screen>('loading');
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [record, setRecord] = useState<MatchRecord | null>(null);
  const [tab, setTab] = useState<Tab>('record');
  const [panel, setPanel] = useState<Panel>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [setupEvent, setSetupEvent] = useState<MatchGroup | null>(null);
  const [reportPlayerId, setReportPlayerId] = useState('');
  const [reportEventKey, setReportEventKey] = useState<string | null>(null);
  const setCurrent = (next: MatchRecord | null) => { current.current = next; setRecord(next); };
  const updateList = (next: MatchRecord) => setMatches(rows => [next, ...rows.filter(row => row.id !== next.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));

  const load = useCallback(async () => {
    setError('');
    try {
      const repo = await openRepository(); repository.current = repo;
      const [savedPlayers, savedMatches, resumeId] = await Promise.all([repo.players(), repo.matches(), repo.resumeId()]);
      setPlayers(savedPlayers); setMatches(savedMatches);
      const active = savedMatches.find(m => m.id === resumeId);
      if (active && ['in-progress', 'suspended'].includes(replayMatch(active.format, active.firstServer, active.events).score.status)) {
        current.current = active; setRecord(active); setTab('record'); setScreen('match');
      } else setScreen('home');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open saved records.'); setScreen('home'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const external = async (operation: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(''); retry.current = null;
    try { await operation(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The operation could not be completed.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const mutate = async (transform: (previous: MatchRecord) => MatchRecord, done?: () => void): Promise<boolean> => {
    if (saving.current || !current.current || !repository.current) return false;
    saving.current = true; setBusy(true); setError('');
    const previous = current.current;
    try {
      const candidate = { ...transform(previous), updatedAt: new Date().toISOString() };
      const saved = await repository.current.saveMatch(candidate, previous.revision);
      setCurrent(saved); updateList(saved); retry.current = null; done?.(); return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the entry.');
      retry.current = () => mutate(transform, done); return false;
    } finally { saving.current = false; setBusy(false); }
  };
  const addEvent = (event: MatchEvent, done?: () => void, clearDraft = false) => mutate(m => ({ ...m, events: appendEvent(m.format, m.firstServer, m.events, event), draft: clearDraft ? emptyDraft() : m.draft }), done);
  const addLifecycle = (action: LifecycleAction, done?: () => void, clearDraft = false) =>
    addEvent({ id: randomUUID(), type: 'lifecycle', action, recordedAt: new Date().toISOString() }, done, clearDraft);
  const savePoint = (input: PointInput) => {
    const actualServer = record?.draft.actualServer;
    const event: MatchEvent = {
      id: randomUUID(),
      type: 'point',
      recordedAt: new Date().toISOString(),
      input: actualServer == null ? input : { ...input, actualServer },
    };
    return addEvent(event, () => {
      setNotice('Point saved on this phone.');
      mainScroll.current?.scrollTo({ y: 0, animated: false });
    }, true);
  };
  const saveDraft = (observations: PointObservations) => mutate(m => ({ ...m, draft: { ...m.draft, observations } }));
  const home = () => external(async () => { await repository.current!.setResumeId(null); setPanel(null); setCurrent(null); setScreen('home'); setNotice(''); });
  const openMatch = (match: MatchRecord) => external(async () => {
    const latest = await repository.current!.getMatch(match.id); if (!latest) throw new Error('This match could not be found.');
    await repository.current!.setResumeId(latest.id); setCurrent(latest); setPanel(null);
    const status = replayMatch(latest.format, latest.firstServer, latest.events).score.status;
    setTab(status === 'in-progress' || status === 'suspended' ? 'record' : 'report'); setScreen('match'); setNotice('');
  });
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (saving.current) return true;
      if (guideOpen) { setGuideOpen(false); return true; }
      if (panel) { setPanel(null); setError(''); return true; }
      if (screen === 'match' || screen === 'setup' || screen === 'player-report') { void home(); return true; }
      return false;
    });
    return () => listener.remove();
  });
  const projection = useMemo(() => record ? replayMatch(record.format, record.firstServer, record.events, record.timingStartedAt) : null, [record]);
  const scheduledServer = projection?.score.current?.server;
  const pointServer = record?.draft.actualServer ?? scheduledServer;
  const togglePointServer = () => {
    if (scheduledServer === undefined) return;
    void mutate(match => ({
      ...match,
      draft: { ...match.draft, actualServer: match.draft.actualServer == null ? other(scheduledServer) : null },
    }));
  };
  const selectedEntry = panel && 'id' in panel ? projection?.pointEntries.find(p => p.id === panel.id) : undefined;
  const groups = useMemo(() => groupMatches(matches), [matches]);
  const events = groups.filter(group => group.named);
  const reportEvent = events.find(event => event.key === reportEventKey) ?? null;

  const showSetup = (event: MatchGroup | null) => {
    setNotice(''); setError(''); setPanel(null); setSetupEvent(event); setScreen('setup');
  };
  const showPlayerReport = (event: MatchGroup | null) => {
    setNotice(''); setError('');
    setReportPlayerId(filter === 'all' ? event?.latest.players[0].id ?? players[0]?.id ?? '' : filter);
    setReportEventKey(event?.key ?? null);
    setScreen('player-report');
  };

  const start = (values: SetupValues) => external(async () => {
    const name = values.playerId ? players.find(p => p.id === values.playerId)?.name : values.playerName.trim();
    if (!name || !values.opponent.trim()) throw new Error('Enter a name for each player.');
    const now = new Date().toISOString();
    const newPlayer = values.playerId ? null : { id: randomUUID(), name, createdAt: now };
    const ownerId = values.playerId || newPlayer!.id;
    const details = matchDetailsFrom(values);
    const eventId = setupEvent?.key ?? (details.group ? `event:${randomUUID()}` : undefined);
    const next: MatchRecord = { schemaVersion: 1, id: randomUUID(), revision: 0, createdAt: now, updatedAt: now, timingStartedAt: now,
      players: [{ id: ownerId, name }, { id: null, name: values.opponent.trim() }], ...details, ...(eventId ? { eventId } : {}),
      format: presets[values.preset], firstServer: values.firstServer, mode: values.mode, events: [], draft: emptyDraft() };
    const saved = await repository.current!.createMatch(next, newPlayer);
    setPlayers(await repository.current!.players()); updateList(saved); setCurrent(saved); setScreen('match'); setTab('record'); setNotice('Ready for the first point.');
  });
  const exportBackup = () => external(async () => {
    const data = await repository.current!.backup();
    await shareText(`tennis-backup-${new Date().toISOString().slice(0, 10)}.json`, data, 'application/json');
    setNotice('Backup prepared. Keep a copy outside this app.');
  });
  const restore = () => external(async () => { const text = await pickBackup(); if (text) setPanel({ kind: 'import', text, preview: await repository.current!.previewImport(text) }); });

  const openPointPanel = (kind: PointPanel, id: string) => { setError(''); setPanel({ kind, id }); };
  const pointActions = (id: string, observations?: PointObservations) => <Row style={{ gap: 4 }}>
    <Button quiet disabled={busy} onPress={() => openPointPanel('edit-point', id)}>Edit point</Button>
    <Button quiet disabled={busy} onPress={() => openPointPanel('point-notes', id)}>{hasPointNotes(observations) ? 'Edit notes' : 'Add notes'}</Button>
  </Row>;
  const saveSelectedPoint = (input: PointInput) => {
    if (!selectedEntry) return;
    void addEvent({ id: randomUUID(), type: 'edit-point', targetId: selectedEntry.id, input }, () => {
      setPanel(null);
      setNotice(panel?.kind === 'point-notes' ? 'Point notes saved.' : 'Point updated.');
    });
  };
  const outcome = (actor: Side, ending: 'winner' | 'unforced-error' | 'forced-error') =>
    mutate(m => ({ ...m, draft: { ...m.draft, pending: { actor, ending } } }), () => mainScroll.current?.scrollTo({ y: 0, animated: false }));
  const stroke = (value: Stroke) => {
    if (!record?.draft.pending) return;
    const pending = record.draft.pending;
    return savePoint({ type: 'ending', ...pending, stroke: value, observations: record.draft.observations });
  };
  const saveServiceEnding = (type: 'ace' | 'double-fault') => {
    if (pointServer === undefined || !record) return;
    const obs = record.draft.observations;
    const observations = type === 'ace' && record.mode === 'detailed' && obs.firstServe === 'unknown'
      ? { ...obs, firstServe: 'in' as const }
      : obs;
    return savePoint({ type, actor: pointServer, observations });
  };

  function live() {
    if (!record || !projection) return null;
    const score = projection.score; const ongoing = score.status === 'in-progress'; const paused = score.status === 'suspended';
    const obs = record.draft.observations; const pending = record.draft.pending;
    if (!ongoing && !paused) return <Stack><Notice>{score.status === 'abandoned' ? 'Match ended without a winner.' : `${record.players[score.winner!].name} wins${score.status === 'retired' ? ' by retirement' : ''}.`}</Notice><Button primary onPress={() => setTab('report')}>View match report</Button><Button disabled={busy} onPress={() => void mutate(m => ({ ...m, events: undoLast(m.format, m.firstServer, m.events, randomUUID()), draft: emptyDraft() }))}>Undo last action</Button></Stack>;
    if (paused) return <Card><Heading>Match paused</Heading><T muted>{record.timingStartedAt ? 'The match clock is paused. Your score and observations are saved.' : 'Your score and observations are saved.'}</T><Button primary disabled={busy} onPress={() => void addLifecycle({ type: 'resume' })}>Resume recording</Button><Button quiet disabled={busy} onPress={() => setPanel({ kind: 'finish' })}>Finish early</Button></Card>;
    if (pending) {
      const canPickServe = pending.actor === pointServer && (pending.ending === 'winner' || !serveWasIn(obs));
      const available = strokes.filter(stroke => stroke !== 'unknown' && (stroke !== 'serve' || canPickServe));
      return <Card style={{ gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Eyebrow>{endingNames[pending.ending]}</Eyebrow>
            <T bold>{record.players[pending.actor].name}</T>
          </View>
          <Button quiet disabled={busy} onPress={() => void mutate(m => ({ ...m, draft: { ...m.draft, pending: null } }))}>Back</Button>
        </Row>
        <Heading>Which stroke?</Heading>
        {available.filter((_, index) => index % 2 === 0).map((first, index) => {
          const second = available[index * 2 + 1];
          return <View key={first} style={layout.two}>
            {[first, second].map((value, column) => value
              ? <Button key={value} testID={`stroke-${value}`} disabled={busy} style={layout.cell} onPress={() => void stroke(value)}>{strokeNames[value]}</Button>
              : <View key={column} style={layout.cell} />)}
          </View>;
        })}
        <Button quiet testID="stroke-unknown" disabled={busy} onPress={() => void stroke('unknown')}>Shot not seen</Button>
      </Card>;
    }
    const last = projection.pointEntries.at(-1);
    const firstServePending = obs.firstServe === 'unknown';
    const secondServePending = obs.firstServe === 'fault' && obs.secondServe === 'unknown';
    const canRecordAce = obs.returnStroke === 'unknown' && obs.returnResult === 'unknown';
    const missedReturner = record.mode === 'detailed' && obs.returnResult === 'error' && pointServer !== undefined
      ? other(pointServer)
      : null;
    const aceButton = <Button style={layout.cell} disabled={busy} onPress={() => void saveServiceEnding('ace')}>Ace</Button>;
    return <Stack>
      {record.mode === 'detailed' && <Card style={{ paddingHorizontal: 8, paddingVertical: 8, gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          {firstServePending || secondServePending
            ? <T bold>{firstServePending ? 'First serve' : 'Second serve'}</T>
            : <View style={{ flex: 1, minWidth: 90 }}>
              <T bold>Serve recorded</T>
              <T small muted>{obs.secondServe === 'in' ? 'Second serve in' : 'First serve in'}</T>
            </View>}
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(firstServePending || secondServePending) && <Button quiet compact disabled={busy} onPress={() => void mutate(m => ({ ...m, draft: { ...m.draft, lets: m.draft.lets + 1 } }))}>Let{record.draft.lets ? ` · ${record.draft.lets}` : ''}</Button>}
            {!firstServePending && <Button quiet compact disabled={busy} onPress={() => void saveDraft({ ...obs, firstServe: 'unknown', secondServe: 'unknown', returnStroke: 'unknown', returnResult: 'unknown' })}>Clear serve</Button>}
            {!firstServePending && !secondServePending && canRecordAce && <Button compact disabled={busy} onPress={() => void saveServiceEnding('ace')}>Ace</Button>}
          </View>
        </Row>
        {firstServePending || secondServePending ? <View style={layout.two}>
          <Button style={layout.cell} testID={firstServePending ? 'first-in' : 'second-in'} disabled={busy} onPress={() => void saveDraft(firstServePending ? { ...obs, firstServe: 'in' } : { ...obs, secondServe: 'in' })}>In</Button>
          {firstServePending
            ? <Button style={layout.cell} testID="first-fault" disabled={busy} onPress={() => void saveDraft({ ...obs, firstServe: 'fault' })}>Fault</Button>
            : <Button style={layout.cell} disabled={busy} onPress={() => void saveServiceEnding('double-fault')}>Double fault</Button>}
          {aceButton}
        </View> : <>
          <Choices compact label="Return result" value={obs.returnResult} options={[{ value: 'in', label: 'In' }, { value: 'error', label: 'Missed' }, { value: 'unknown', label: 'Not seen' }]} disabled={busy} onChange={returnResult => void saveDraft({ ...obs, returnResult })} />
          <Choices compact label="Return stroke" value={obs.returnStroke} options={[{ value: 'forehand', label: 'Forehand' }, { value: 'backhand', label: 'Backhand' }, { value: 'other', label: 'Other' }, { value: 'unknown', label: 'Not seen' }]} disabled={busy} onChange={returnStroke => void saveDraft({ ...obs, returnStroke })} />
        </>}
      </Card>}
      {missedReturner !== null ? <Stack>
        <Row style={{ justifyContent: 'space-between' }}>
          <T bold style={{ flexShrink: 1 }}>{record.players[missedReturner].name} missed the return</T>
          <OutcomeHelpButton onPress={() => setGuideOpen(true)} disabled={busy} />
        </Row>
        <View style={layout.two}>
          {(['forced-error', 'unforced-error'] as const).map(ending => <Button
            key={ending}
            style={layout.cell}
            disabled={busy}
            onPress={() => void savePoint({ type: 'ending', actor: missedReturner, ending, stroke: obs.returnStroke, observations: obs })}
          >{endingNames[ending]}</Button>)}
        </View>
      </Stack> : record.mode === 'score' ? <Stack>
        <T bold style={{ fontSize: 19 }}>Who won the point?</T>
        <View style={layout.two}>
          {([0, 1] as const).map(side => <Button
            key={side} primary style={[layout.cell, { minHeight: 80 }]} disabled={busy}
            onPress={() => void savePoint({ type: 'winner-only', winner: side, observations: obs })}
          >{`${record.players[side].name}\nwins point`}</Button>)}
        </View>
      </Stack> : <Card style={{ padding: 10, gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T bold style={{ fontSize: 19, flexShrink: 1 }}>Last shot of the rally</T>
          <OutcomeHelpButton onPress={() => setGuideOpen(true)} disabled={busy} />
        </Row>
        <View style={{ gap: 6 }}>
          <View style={layout.two}>
            {record.players.map((player, i) => <View key={i} style={layout.cell}><T small bold>Played by {player.name}</T></View>)}
          </View>
          {(['winner', 'unforced-error', 'forced-error'] as const).map(ending => <View key={ending} style={layout.two}>
            {([0, 1] as const).map(side => <Button
              key={side} testID={`ending-${side}-${ending}`} label={`${record.players[side].name} ${endingNames[ending]}`}
              disabled={busy} style={[layout.cell, { minHeight: 50, paddingVertical: 6, backgroundColor: ending === 'winner' ? c.soft : c.card }]}
              onPress={() => void outcome(side, ending)}
            >
              <T bold style={{ fontSize: 15 }}>{endingNames[ending]}</T>
            </Button>)}
          </View>)}
          {record.mode === 'endings' && <View style={layout.two}>
            {aceButton}
            {!serveWasIn(obs) && <Button style={layout.cell} disabled={busy} onPress={() => void saveServiceEnding('double-fault')}>Double fault</Button>}
          </View>}
        </View>
      </Card>}
      {record.mode !== 'score' && missedReturner === null && <Card style={{ paddingVertical: 10, gap: 5 }}>
        <T small bold>Point winner only</T>
        <T small muted>Use when you missed how the point ended.</T>
        <View style={layout.two}>
          {([0, 1] as const).map(side => <Button
            key={side} compact label={`${record.players[side].name} won the point`} style={layout.cell} disabled={busy}
            onPress={() => void savePoint({ type: 'winner-only', winner: side, observations: obs })}
          >
            <T small bold style={{ textAlign: 'center' }}>{record.players[side].name}</T>
            <T small muted style={{ textAlign: 'center' }}>won the point</T>
          </Button>)}
        </View>
      </Card>}
      {last && <Card style={{ backgroundColor: c.soft, paddingVertical: 8, gap: 4 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flexGrow: 1, flexBasis: 120 }}>
            <T small bold>Previous point · {record.players[last.point.winner].name}</T>
            <T small muted>{endingNames[last.point.ending]}{last.point.stroke ? ` · ${strokeNames[last.point.stroke]}` : ''}</T>
          </View>
          {pointActions(last.id, last.point.observations)}
        </Row>
      </Card>}
      <Row style={{ justifyContent: 'space-between', gap: 0 }}>
        <Button quiet disabled={busy} onPress={() => void addLifecycle({ type: 'suspend' })}>Pause</Button>
        <Button quiet disabled={busy} onPress={() => { setError(''); setPanel({ kind: 'finish' }); }}>Finish early</Button>
        <Button quiet testID="recording-mode" disabled={busy} onPress={() => { setError(''); setPanel({ kind: 'recording-mode' }); }}>
          {`Recording mode · ${modeOptions.find(option => option.value === record.mode)?.label}`}
        </Button>
      </Row>
    </Stack>;
  }
  function history() {
    if (!projection || !record) return null;
    const names = [record.players[0].name, record.players[1].name] as const;
    const actions = record.events.filter(event => event.type !== 'point');
    return <Stack>
      <View style={{ gap: 4 }}>
        <Eyebrow>Point log</Eyebrow>
        <Heading>Point history</Heading>
        <T small muted>{projection.points.length} points recorded · Newest first</T>
      </View>
      {projection.hasScoreCorrections && <Notice>The score includes manual corrections. These do not create shot statistics.</Notice>}
      {[...projection.pointEntries].reverse().map(({ id, point }, index) => <Card key={id} style={{ gap: 5 }}>
        <Eyebrow>Point {projection.points.length - index} · Stage {point.context.stage + 1}</Eyebrow>
        <T bold>{names[point.winner]} won</T>
        <T small>{point.actor === null ? 'Ending not recorded' : `${names[point.actor]} · ${endingNames[point.ending]}`}{point.stroke ? ` · ${strokeNames[point.stroke]}` : ''}</T>
        <T small muted>{names[point.server]} served{point.servedOutOfTurn ? ' · out of turn' : ''}</T>
        <T small muted>Games before {point.context.games.join('–')}</T>
        {pointNoteLabels(point.observations, names).map((label, i) => <T key={i} small muted>{label}</T>)}
        {point.observations?.notes ? <T small>{point.observations.notes}</T> : null}
        {pointActions(id, point.observations)}
      </Card>)}
      {!projection.points.length && <Card><T muted>Recorded points will appear here.</T></Card>}
      {actions.length > 0 && <Card style={{ gap: 7 }}>
        <T bold>Score and match actions</T>
        {actions.map(event => <T small muted key={event.id}>{event.type === 'correction' ? `Score correction · ${event.reason}` : event.type === 'lifecycle'
          ? { suspend: 'Match paused', resume: 'Match resumed', retire: 'Match ended by retirement', abandon: 'Match abandoned' }[event.action.type]
          : event.type === 'edit-point' ? 'Point details edited' : 'Action undone'}</T>)}
      </Card>}
    </Stack>;
  }
  function report() {
    if (!record || !projection) return null;
    const times = timingLabels(projection.timing);
    const context = [record.group, record.round, record.venue, record.surface, record.courtSetting, record.conditions].filter(Boolean).join(' · ');
    const names = [record.players[0].name, record.players[1].name] as const;
    const noteSummary = pointNoteSummary(projection.points, names);
    const notablePoints = projection.pointEntries.filter(entry => hasPointNotes(entry.point.observations));
    const { stats } = projection;

    return <Stack>
      <View style={{ gap: 4 }}>
        <Heading>Match report</Heading>
        <T small muted>{record.date} · {record.format.name}</T>
        {context ? <T small muted>{context}</T> : null}
      </View>
      <Row style={{ alignItems: 'stretch' }}>
        <Button primary disabled={busy} onPress={() => void external(async () => { await sharePDF(record); })}>PDF report</Button>
        <Button disabled={busy} onPress={() => void external(async () => { await shareText(`tennis-match-${record.id}.csv`, reportCSV(record), 'text/csv'); })}>Export points CSV</Button>
      </Row>
      <MatchComparison names={names} stats={stats.players} />
      {times.length > 0 && <Card style={{ gap: 6 }}>
        <T bold>Match timing</T>
        {times.map(time => <T key={time} small muted>{time}</T>)}
      </Card>}
      <View style={{ gap: 4 }}>
        <T bold style={{ fontSize: 19, lineHeight: 24 }}>Winners and errors by stroke</T>
        <T small muted>Aces count as serve winners. Double faults are separate.</T>
      </View>
      {([0, 1] as const).map(side => <StatsTable key={side} name={names[side]} stats={stats.players[side]} />)}
      <T small muted>Recorded endings {stats.coverage.endings}/{stats.coverage.points} · Recorded strokes {stats.coverage.strokes}/{stats.coverage.endings}</T>
      {projection.hasScoreCorrections && <Notice>Manual score corrections leave gaps in point-based statistics.</Notice>}
      {noteSummary.length > 0 && <Stack>
        <View style={{ gap: 4 }}>
          <T bold style={{ fontSize: 19, lineHeight: 24 }}>Point notes summary</T>
          <T small muted>Counts are based on observations recorded during the match.</T>
        </View>
        {noteSummary.map(section => <Card key={section.title} style={{ gap: 7 }}>
          <T bold>{section.title}</T>
          {section.lines.map(line => <T key={line} small>{line}</T>)}
        </Card>)}
      </Stack>}
      <View style={{ gap: 4 }}>
        <T bold style={{ fontSize: 19, lineHeight: 24 }}>Notes and notable points</T>
        {notablePoints.length === 0 && <T small muted>Point notes will appear here as you add them.</T>}
      </View>
      {notablePoints.map(entry => {
        const obs = entry.point.observations!;
        return <Card key={entry.id} style={{ gap: 7 }}>
          <T bold>{names[entry.point.winner]} won · {endingNames[entry.point.ending]}</T>
          {pointNoteLabels(obs, names).map(label => <T key={label} small>{label}</T>)}
          {obs.notes ? <T small>{obs.notes}</T> : null}
          {pointActions(entry.id, obs)}
        </Card>;
      })}
    </Stack>;
  }

  function homeContent() {
    return <MatchLibrary
      groups={groups} players={players} filter={filter} busy={busy} available={repository.current !== null}
      onFilter={setFilter}
      onNewMatch={() => showSetup(null)}
      onAddToEvent={() => { setError(''); setPanel({ kind: 'pick-event-for-match' }); }}
      onPerformance={showPlayerReport}
      onOpenMatch={match => void openMatch(match)}
      onBackup={() => void exportBackup()}
      onRestore={() => void restore()}
    />;
  }
  const errorBlock = error ? <Stack><Notice error>{error}</Notice><Row>{retry.current && <Button disabled={busy} onPress={() => void retry.current?.()}>Retry saving</Button>}<Button disabled={busy} onPress={() => void external(async () => {
    if (current.current) { const saved = await repository.current!.getMatch(current.current.id); if (saved) { setCurrent(saved); updateList(saved); } }
    else await load();
    setError(''); retry.current = null;
  })}>{current.current ? 'Reload saved match' : 'Retry loading'}</Button></Row></Stack> : null;

  const pinScore = screen === 'match' && tab === 'record' && projection?.score.status === 'in-progress'
    && height >= 720 && fontScale <= 1.3;
  const scoreboard = record && projection && <Scoreboard
    record={record} score={projection.score} timing={projection.timing} busy={busy}
    toggleServer={tab === 'record' ? togglePointServer : undefined}
    correctScore={tab === 'record' && !record.draft.pending ? () => { setError(''); setPanel({ kind: 'correct' }); } : undefined}
  />;

  return <SafeAreaView style={layout.root}>
    <StatusBar style="auto" />
    {screen === 'match' && tab === 'record' && projection?.score.status === 'in-progress' && <AwakeWhileRecording />}
    <View style={layout.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Image source={require('./assets/tennis-notebook.png')} style={{ width: 34, height: 34, borderRadius: 8 }} accessible={false} />
        {screen === 'home' || screen === 'loading'
          ? <T bold>Tennis Notebook</T>
          : <Button quiet testID="back-to-matches" disabled={busy} onPress={() => void home()}>‹ Matches</Button>}
      </View>
      {busy ? <View accessibilityLiveRegion="polite"><T small muted>Saving…</T></View>
        : screen === 'match' && record && <Button quiet onPress={() => { setError(''); setPanel({ kind: 'match-details' }); }}>Match details</Button>}
    </View>
    {pinScore && <View style={{ width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 18, paddingBottom: 5 }}>{scoreboard}</View>}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={mainScroll} key={`${screen}-${tab}-${screen === 'match' && tab === 'record' ? record?.mode : ''}`} keyboardShouldPersistTaps="handled" contentContainerStyle={layout.content}>
        {!panel && errorBlock}
        {screen === 'loading' ? <ActivityIndicator accessibilityLabel="Opening saved matches" color={c.accent} size="large" />
          : screen === 'home' ? homeContent()
          : screen === 'setup' ? <SetupForm players={players} event={setupEvent} preferredPlayerId={filter === 'all' ? null : filter} busy={busy} onStart={start} />
          : screen === 'player-report' ? <PlayerPerformance
            players={players} matches={matches} playerId={reportPlayerId} event={reportEvent} hasEvents={events.length > 0} busy={busy}
            onPlayer={setReportPlayerId} onChooseEvent={() => { setError(''); setPanel({ kind: 'pick-event-for-report' }); }}
            onExport={report => void external(() => sharePlayerPerformancePDF(report))}
          />
          : record && projection ? <Stack>
            {!pinScore && scoreboard}
            {tab === 'record' ? live() : tab === 'history' ? history() : report()}
          </Stack> : null}
        {notice ? <View accessibilityLiveRegion="polite"><T small muted>{notice}</T></View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
    {screen === 'match' && <View style={layout.footer}><View style={layout.footerContent}>
      <Button testID="undo" label="Undo last action" quiet style={{ paddingHorizontal: 9 }} disabled={busy || !projection?.lastActionId} onPress={() => void mutate(m => ({ ...m, events: undoLast(m.format, m.firstServer, m.events, randomUUID()), draft: emptyDraft() }))}>Undo</Button>
      {(['record', 'history', 'report'] as const).map(value => <Button key={value} testID={`tab-${value}`} toggle compact style={{ flex: 1, paddingHorizontal: 6 }} quiet={tab !== value} selected={tab === value} disabled={busy} onPress={() => { setTab(value); setNotice(''); }}>{value === 'record' ? 'Record' : value === 'history' ? 'History' : 'Report'}</Button>)}
    </View></View>}

    <Modal visible={panel !== null || guideOpen} transparent animationType="none" onRequestClose={() => {
      if (guideOpen) setGuideOpen(false);
      else if (!busy) { setPanel(null); setError(''); }
    }}><SafeAreaView style={layout.modal}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={layout.sheet}>
      {guideOpen && <ScrollView contentContainerStyle={layout.content}>
        <OutcomeGuide onClose={() => setGuideOpen(false)} />
      </ScrollView>}
      {!guideOpen && <Row style={{ paddingHorizontal: 12, justifyContent: 'flex-end' }}><Button quiet disabled={busy} onPress={() => { setPanel(null); setError(''); }}>Cancel</Button></Row>}
      <ScrollView style={guideOpen ? { display: 'none' } : undefined} key={selectedEntry ? `${panel?.kind}-${selectedEntry.id}` : panel?.kind ?? 'closed'} keyboardShouldPersistTaps="handled" contentContainerStyle={layout.content}>{errorBlock}
      {(panel?.kind === 'pick-event-for-match' || panel?.kind === 'pick-event-for-report') && <Stack>
        <Heading>{panel.kind === 'pick-event-for-match' ? 'Add match to event' : 'Choose report event'}</Heading>
        {panel.kind === 'pick-event-for-report' && <Button selected={reportEventKey === null} onPress={() => { setReportEventKey(null); setPanel(null); }}>All events</Button>}
        {events.map(event => <Button
          key={event.key} selected={panel.kind === 'pick-event-for-report' && reportEventKey === event.key}
          onPress={() => {
            if (panel.kind === 'pick-event-for-match') showSetup(event);
            else { setReportEventKey(event.key); setPanel(null); }
          }}
        >{`${event.name} · ${event.dateLabel}`}</Button>)}
      </Stack>}
      {panel?.kind === 'match-details' && record && <MatchDetailsForm
        record={record} busy={busy}
        onSave={details => void mutate(m => {
          const eventId = matchEventKey(m) ?? (details.group ? `event:${randomUUID()}` : undefined);
          return { ...m, ...details, ...(eventId ? { eventId } : {}) };
        }, () => { setPanel(null); setNotice('Match details saved.'); })}
        onDelete={() => void external(async () => {
          await repository.current!.deleteMatch(record.id, record.revision);
          setMatches(rows => rows.filter(match => match.id !== record.id));
          setPanel(null); setCurrent(null); setScreen('home'); setNotice('Match deleted.');
        })}
      />}
      {panel?.kind === 'recording-mode' && record && <Stack>
        <Heading>Recording mode</Heading>
        {modeOptions.map(({ value, label }) => <Button
          key={value} selected={record.mode === value} disabled={busy}
          onPress={() => {
            if (record.mode === value) {
              setPanel(null);
              return;
            }
            void mutate(m => ({ ...m, mode: value }), () => {
              setPanel(null);
            });
          }}
        >{label}</Button>)}
      </Stack>}
      {panel?.kind === 'correct' && record && projection && <CorrectionForm record={record} score={projection.score} busy={busy} onSave={(correction: ScoreCorrection, reason: string) => void addEvent({ id: randomUUID(), type: 'correction', correction, reason }, () => setPanel(null), true)} />}{panel?.kind === 'finish' && record && <FinishForm record={record} busy={busy} onSave={(kind, player) => void addLifecycle(kind === 'retire' ? { type: 'retire', player } : { type: 'abandon' }, () => { setPanel(null); setTab('report'); }, true)} />}
      {panel?.kind === 'edit-point' && selectedEntry && record && <PointEditor
        record={record} input={selectedEntry.input} server={selectedEntry.point.server} busy={busy} onSave={saveSelectedPoint}
        onOutcomeHelp={() => setGuideOpen(true)}
      />}
      {panel?.kind === 'point-notes' && selectedEntry && record && <PointNotesEditor
        input={selectedEntry.input} names={[record.players[0].name, record.players[1].name]} busy={busy} onSave={saveSelectedPoint}
      />}
      {panel?.kind === 'import' && <Stack><Heading>Restore backup</Heading><T>{panel.preview.newPlayers} new players and {panel.preview.newMatches} new matches.</T><Notice>{panel.preview.identical} identical matches will be skipped. {panel.preview.conflicts} conflicts will be left unchanged.</Notice><T small muted>Existing records will not be overwritten.</T><Button primary disabled={busy || (panel.preview.newMatches === 0 && panel.preview.newPlayers === 0)} onPress={() => {
      const text = panel.text;
      void external(async () => { const result = await repository.current!.importNew(text); setPlayers(await repository.current!.players()); setMatches(await repository.current!.matches()); setPanel(null); setScreen('home'); setNotice(`Restored ${result.newMatches} matches. Existing records were kept.`); });
    }}>Import new records</Button></Stack>}</ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
  </SafeAreaView>;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <SafeAreaView style={{ flex: 1, padding: 24, justifyContent: 'center' }}><Heading>Let’s reopen your notebook</Heading><T>Your saved records have not been deleted.</T><Button onPress={() => this.setState(s => ({ failed: false, attempt: s.attempt + 1 }))}>Reopen saved records</Button></SafeAreaView> : <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>; }
}
export default function App() { return <SafeAreaProvider><AppTheme><AppErrorBoundary><Main /></AppErrorBoundary></AppTheme></SafeAreaProvider>; }
