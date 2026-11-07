import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { randomUUID } from 'expo-crypto';
import { useKeepAwake } from 'expo-keep-awake';
import { appendEvent, replayMatch, undoLast } from './src/domain/history.ts';
import type { MatchEvent } from './src/domain/history.ts';
import { hasPointNotes } from './src/domain/pointNotes.ts';
import type { PointInput, PointObservations, Stroke } from './src/domain/points.ts';
import { presets } from './src/domain/presets.ts';
import { other } from './src/domain/scoring.ts';
import { answerServeEntry, previousServeEntryStep, serveEntryStep, skipServeEntry } from './src/domain/serveEntry.ts';
import type { LifecycleAction, MatchScore, ScoreCorrection, Side } from './src/domain/scoring.ts';
import { openRepository } from './src/storage/database.ts';
import type { ImportPreview, MatchRepository } from './src/storage/repository.ts';
import { groupMatches, matchEventKey } from './src/storage/matchGroups.ts';
import type { MatchGroup } from './src/storage/matchGroups.ts';
import { emptyDraft } from './src/storage/model.ts';
import type { MatchDraft, MatchRecord, PlayerProfile, UnstartedMatchRecord } from './src/storage/model.ts';
import { endingNames, pointEndingLabel, reportCSV, strokeNames } from './src/reports/report.ts';
import { pointNoteLabels } from './src/reports/pointNotes.ts';
import { pickBackup, prepareMatchPDF, preparePlayerPerformancePDF, sharePDF, sharePlayerPerformancePDF, sharePreparedPDF, shareText, viewPreparedPDF } from './src/reports/files.ts';
import type { PreparedPDF } from './src/reports/files.ts';
import type { MatchPDFVariant } from './src/reports/pdf.ts';
import { AppTheme, Button, Card, Eyebrow, Heading, Notice, PlayerBadge, playerBadgeColors, Row, Stack, T, useLayout, useTheme } from './src/ui/kit.tsx';
import { CorrectionForm, FinishForm, matchDetailsFrom, MatchDetailsForm, MatchNotesEditor, modeOptions, PointEditor, SetupForm, StartMatchForm } from './src/ui/forms.tsx';
import type { SetupValues } from './src/ui/forms.tsx';
import { PointNotesEditor } from './src/ui/ObservationForm.tsx';
import { OutcomeGuide, OutcomeHelpButton } from './src/ui/OutcomeGuide.tsx';
import { Scoreboard } from './src/ui/Scoreboard.tsx';
import { LastShotCard, MoreShotOptions } from './src/ui/LastShotCard.tsx';
import { pointSavedSummary } from './src/ui/pointSaved.ts';
import type { PointSavedSummary } from './src/ui/pointSaved.ts';
import { ServeRecordingCard } from './src/ui/ServeRecordingCard.tsx';
import { ServeReturnSummary } from './src/ui/ServeReturnSummary.tsx';
import { MatchReport } from './src/ui/MatchReport.tsx';
import { PlayerPerformance } from './src/ui/PlayerPerformance.tsx';
import { MatchLibrary } from './src/ui/MatchLibrary.tsx';
import { DeletePlayerConfirmation, PlayerSettings, RenamePlayerForm } from './src/ui/PlayerSettings.tsx';
import { PDFReady } from './src/ui/PDFReady.tsx';
import { Icon } from './src/ui/Icon.tsx';
import type { IconName } from './src/ui/Icon.tsx';

type Screen = 'loading' | 'home' | 'setup' | 'match' | 'player-report';
type Tab = 'record' | 'history' | 'report';
const matchTabs = [
  { value: 'record', label: 'Record', icon: 'record' },
  { value: 'history', label: 'History', icon: 'history' },
  { value: 'report', label: 'Report', icon: 'report' },
] as const;
const matchPDFOptions: readonly { variant: MatchPDFVariant; title: string; description: string; icon: IconName }[] = [
  { variant: 'summary', title: 'Stats summary', description: 'A short report with match stats and match notes.', icon: 'chart' },
  { variant: 'point-by-point', title: 'Point-by-point', description: 'The score, shots and observations for each point, with stats after each set.', icon: 'history' },
  { variant: 'combined', title: 'Combined report', description: 'The stats summary and full point-by-point report in one PDF.', icon: 'report' },
];
type PointPanel = 'edit-point' | 'point-notes' | 'delete-point';
type Panel = { kind: 'correct' } | { kind: 'finish' } | { kind: 'recording-mode' } | { kind: 'match-details' } | { kind: 'match-notes' } | { kind: 'export-match-pdf' } | { kind: 'pdf-ready'; pdf: PreparedPDF; title: string; description: string } | { kind: 'pick-event-for-match' } | { kind: 'pick-event-for-report' } | { kind: 'open-paused-match'; match: MatchRecord } | { kind: 'open-unstarted-match' | 'start-match'; match: UnstartedMatchRecord } | { kind: 'settings' } | { kind: 'rename-player' | 'delete-player'; player: PlayerProfile } | { kind: PointPanel; id: string } | { kind: 'import'; text: string; preview: ImportPreview } | null;
function canRecordMatch(status: MatchScore['status'] | undefined): boolean {
  return status === 'in-progress' || status === 'suspended';
}
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
  const [selectedTab, setTab] = useState<Tab>('record');
  const [panel, setPanel] = useState<Panel>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [savedPoint, setSavedPoint] = useState<{ id: string; matchId: string; summary: PointSavedSummary } | null>(null);
  const dismissSavedPoint = useCallback((id: string) => {
    setSavedPoint(previous => previous?.id === id ? null : previous);
  }, []);
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
      if (active && active.firstServer !== null && canRecordMatch(replayMatch(active.format, active.firstServer, active.events).score.status)) {
        current.current = active; setRecord(active); setTab('record'); setScreen('match');
      } else setScreen('home');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open saved records.'); setScreen('home'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const external = async (operation: () => Promise<void>) => {
    if (saving.current) return;
    setSavedPoint(null);
    saving.current = true; setBusy(true); setError(''); retry.current = null;
    try { await operation(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The operation could not be completed.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const mutate = async (transform: (previous: MatchRecord) => MatchRecord, done?: (saved: MatchRecord) => void): Promise<boolean> => {
    if (saving.current || !current.current || !repository.current) return false;
    setSavedPoint(null);
    saving.current = true; setBusy(true); setError('');
    const previous = current.current;
    try {
      const candidate = { ...transform(previous), updatedAt: new Date().toISOString() };
      const saved = await repository.current.saveMatch(candidate, previous.revision);
      setCurrent(saved); updateList(saved); retry.current = null; done?.(saved); return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the entry.');
      retry.current = () => mutate(transform, done); return false;
    } finally { saving.current = false; setBusy(false); }
  };
  const addEvent = (event: MatchEvent, done?: (saved: MatchRecord) => void, clearDraft = false) => mutate(m => {
    if (m.firstServer === null) throw new Error('Start the match before recording play.');
    return { ...m, events: appendEvent(m.format, m.firstServer, m.events, event), draft: clearDraft ? emptyDraft() : m.draft };
  }, done);
  const undo = () => mutate(m => {
    if (m.firstServer === null) throw new Error('Start the match before recording play.');
    if (!canRecordMatch(replayMatch(m.format, m.firstServer, m.events).score.status)) {
      throw new Error('Finished matches cannot be undone.');
    }
    return { ...m, events: undoLast(m.format, m.firstServer, m.events, randomUUID()), draft: emptyDraft() };
  });
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
    return addEvent(event, saved => {
      if (saved.firstServer !== null) {
        const next = replayMatch(saved.format, saved.firstServer, saved.events);
        setSavedPoint({ id: event.id, matchId: saved.id,
          summary: pointSavedSummary(next, [saved.players[0].name, saved.players[1].name]) });
      }
      setNotice('');
      mainScroll.current?.scrollTo({ y: 0, animated: false });
    }, true);
  };
  const saveDraft = (observations: PointObservations) => mutate(m => ({
    ...m, draft: { ...m.draft, ...answerServeEntry(m.draft, observations), pending: null },
  }), () => mainScroll.current?.scrollTo({ y: 0, animated: false }));
  const skipServiceDetail = () => mutate(m => ({
    ...m, draft: { ...m.draft, ...skipServeEntry(m.draft), pending: null },
  }), () => mainScroll.current?.scrollTo({ y: 0, animated: false }));
  const backServiceDetail = () => mutate(m => ({
    ...m, draft: { ...m.draft, serveStep: previousServeEntryStep(m.draft), pending: null },
  }), () => mainScroll.current?.scrollTo({ y: 0, animated: false }));
  const home = () => external(async () => { await repository.current!.setResumeId(null); setPanel(null); setCurrent(null); setScreen('home'); setNotice(''); });
  const openMatch = async (id: string, choice?: 'resume' | 'report') => {
    let resume = false;
    await external(async () => {
      const latest = await repository.current!.getMatch(id);
      if (!latest) throw new Error('This match could not be found.');
      if (latest.firstServer === null) {
        setPanel({ kind: 'open-unstarted-match', match: latest });
        return;
      }
      const status = replayMatch(latest.format, latest.firstServer, latest.events).score.status;
      if (status === 'suspended' && choice === undefined) {
        setPanel({ kind: 'open-paused-match', match: latest });
        return;
      }
      await repository.current!.setResumeId(latest.id);
      setCurrent(latest); setPanel(null); setScreen('match'); setNotice('');
      setTab(choice !== 'report' && canRecordMatch(status) ? 'record' : 'report');
      resume = status === 'suspended' && choice === 'resume';
    });
    if (resume) await addLifecycle({ type: 'resume' });
  };
  const closePanel = () => {
    if (strokeMenuOpen && endingDraft) {
      const winner = endingDraft.ending === 'winner' ? endingDraft.actor : other(endingDraft.actor);
      void selectPointDetail({ winner });
      return;
    }
    if (screen === 'home') setCurrent(null);
    setPanel(panel?.kind === 'rename-player' || panel?.kind === 'delete-player' ? { kind: 'settings' } : null);
    setError(''); retry.current = null;
  };
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (saving.current) return true;
      if (guideOpen) { setGuideOpen(false); return true; }
      if (panel || strokeMenuOpen) { closePanel(); return true; }
      if (screen === 'match' && tab === 'record' && record?.mode === 'detailed' && projection?.score.status === 'in-progress') {
        if (record.draft.pending) { void selectPointDetail(null); return true; }
        if (serveEntryStep(record.draft) !== 'first-serve') { void backServiceDetail(); return true; }
      }
      if (screen === 'match' || screen === 'setup' || screen === 'player-report') { void home(); return true; }
      return false;
    });
    return () => listener.remove();
  });
  const projection = useMemo(() => record && record.firstServer !== null
    ? replayMatch(record.format, record.firstServer, record.events, record.timingStartedAt) : null, [record]);
  const canRecord = canRecordMatch(projection?.score.status);
  const tab = selectedTab === 'record' && !canRecord ? 'report' : selectedTab;
  const scheduledServer = projection?.score.current?.server;
  const pointServer = record?.draft.actualServer ?? scheduledServer;
  const endingDraft = record?.draft.pending && !('winner' in record.draft.pending) ? record.draft.pending : null;
  const strokeMenuOpen = screen === 'match' && tab === 'record' && projection?.score.status === 'in-progress'
    && endingDraft !== null && panel === null && !guideOpen;
  const serveUnrecorded = record?.draft.observations.firstServe === 'unknown' && record.draft.observations.secondServe === 'unknown'
    && record.draft.observations.returnResult === 'unknown' && record.draft.observations.returnStroke === 'unknown';
  const allowServeStroke = endingDraft !== null && endingDraft.actor === pointServer
    && endingDraft.ending !== 'forced-error' && serveUnrecorded;
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

  const saveSetup = (values: SetupValues) => external(async () => {
    const name = values.playerId ? players.find(p => p.id === values.playerId)?.name : values.playerName.trim();
    if (!name || !values.opponent.trim()) throw new Error('Enter a name for each player.');
    const now = new Date().toISOString();
    const newPlayer = values.playerId ? null : { id: randomUUID(), name, createdAt: now };
    const ownerId = values.playerId || newPlayer!.id;
    const details = matchDetailsFrom(values);
    const eventId = setupEvent?.key ?? (details.group ? `event:${randomUUID()}` : undefined);
    const next: UnstartedMatchRecord = { schemaVersion: 1, id: randomUUID(), revision: 0, createdAt: now, updatedAt: now, timingStartedAt: null,
      players: [{ id: ownerId, name }, { id: null, name: values.opponent.trim() }], ...details, ...(eventId ? { eventId } : {}),
      format: presets[values.preset], firstServer: null, mode: values.mode, events: [], draft: emptyDraft() };
    const saved = await repository.current!.createMatch(next, newPlayer);
    if (newPlayer) setPlayers(await repository.current!.players());
    updateList(saved); setScreen('home'); setNotice('Match saved. Open it when you’re ready to start.');
  });
  const startMatch = (match: UnstartedMatchRecord, firstServer: Side) => external(async () => {
    const saved = await repository.current!.startMatch(match, firstServer);
    updateList(saved); setCurrent(saved); setPanel(null); setTab('record'); setScreen('match');
    setNotice('Ready for the first point.');
  });
  const exportBackup = () => external(async () => {
    const data = await repository.current!.backup();
    await shareText(`tennis-backup-${new Date().toISOString().slice(0, 10)}.json`, data, 'application/json');
    setPanel(null);
    setNotice('Backup prepared. Keep a copy outside this app.');
  });
  const restore = () => external(async () => { const text = await pickBackup(); if (text) setPanel({ kind: 'import', text, preview: await repository.current!.previewImport(text) }); });
  const refreshPlayerRecords = async () => {
    const [nextPlayers, nextMatches] = await Promise.all([repository.current!.players(), repository.current!.matches()]);
    const nextGroups = groupMatches(nextMatches);
    setPlayers(nextPlayers); setMatches(nextMatches);
    setFilter(id => id === 'all' || nextPlayers.some(player => player.id === id) ? id : 'all');
    setReportPlayerId(id => nextPlayers.some(player => player.id === id) ? id : nextPlayers[0]?.id ?? '');
    setReportEventKey(key => nextGroups.some(group => group.key === key) ? key : null);
    setSetupEvent(event => event ? nextGroups.find(group => group.key === event.key) ?? null : null);
    if (current.current) setCurrent(nextMatches.find(match => match.id === current.current?.id) ?? null);
  };
  const renamePlayer = (player: PlayerProfile, name: string) => external(async () => {
    await repository.current!.renamePlayer(player.id, name);
    await refreshPlayerRecords();
    setPanel({ kind: 'settings' }); setNotice(`Player renamed to ${name.trim()}.`);
  });
  const deletePlayer = (player: PlayerProfile) => external(async () => {
    await repository.current!.deletePlayer(player.id);
    await refreshPlayerRecords();
    setPanel({ kind: 'settings' }); setScreen('home');
    setNotice(`${player.name} and their match data were deleted.`);
  });

  const openPointPanel = (kind: PointPanel, id: string) => {
    if (!canRecord && kind !== 'point-notes') return;
    setSavedPoint(null);
    setError(''); setPanel({ kind, id });
  };
  const openMatchNotes = () => { setSavedPoint(null); setError(''); setPanel({ kind: 'match-notes' }); };
  const pointActions = (id: string, observations?: PointObservations) => <Row style={{ gap: 6 }}>
    {canRecord && <Button quiet disabled={busy} onPress={() => openPointPanel('edit-point', id)}>Edit point</Button>}
    <Button quiet disabled={busy} onPress={() => openPointPanel('point-notes', id)}>{hasPointNotes(observations) ? 'Edit notes' : 'Add notes'}</Button>
  </Row>;
  const saveSelectedPoint = (input: PointInput) => {
    if (!selectedEntry || (!canRecord && panel?.kind !== 'point-notes')) return;
    void addEvent({ id: randomUUID(), type: 'edit-point', targetId: selectedEntry.id, input }, () => {
      setPanel(null);
      setNotice(panel?.kind === 'point-notes' ? 'Point notes saved.' : 'Point updated.');
    });
  };
  const selectPointDetail = (pending: MatchDraft['pending']) =>
    mutate(m => ({ ...m, draft: { ...m.draft, pending } }), () => mainScroll.current?.scrollTo({ y: 0, animated: false }));
  const stroke = (value: Stroke) => {
    const pending = record?.draft.pending;
    if (!record || !pending || 'winner' in pending) return;
    if (value === 'serve') {
      if (!allowServeStroke) return;
      return savePoint({ type: pending.ending === 'winner' ? 'ace' : 'double-fault',
        actor: pending.actor, observations: record.draft.observations });
    }
    return savePoint({ type: 'ending', actor: pending.actor, ending: pending.ending, stroke: value, observations: record.draft.observations });
  };
  const saveServiceEnding = (type: 'ace' | 'double-fault') => {
    if (pointServer === undefined || !record) return;
    const obs = record.draft.observations;
    const step = serveEntryStep(record.draft);
    const observations: PointObservations = type === 'ace' && record.mode === 'detailed'
      ? { ...obs, firstServe: step === 'second-serve' ? 'fault' : 'in', secondServe: step === 'second-serve' ? 'in' : 'unknown',
        returnResult: 'unknown', returnStroke: 'unknown' }
      : obs;
    return savePoint({ type, actor: pointServer, observations });
  };

  const recordingSectionDivider = { marginTop: 8, borderTopWidth: 2, borderTopColor: c.line, paddingTop: 14 };

  function previousPoint() {
    const last = projection?.pointEntries.at(-1);
    if (!record || !last) return null;
    return <View style={recordingSectionDivider}>
      <Card style={{ backgroundColor: c.soft, padding: 12, gap: 8 }}>
        <Row style={{ columnGap: 12, rowGap: 9 }}>
          <View style={{ flexGrow: 1, flexBasis: 144, minWidth: 0 }}>
            <T small bold>Previous point · {record.players[last.point.winner].name}</T>
            <T small muted>{endingNames[last.point.ending]}{last.point.stroke ? ` · ${strokeNames[last.point.stroke]}` : ''}</T>
          </View>
          <Row style={{ flexShrink: 0, marginLeft: 'auto', gap: 12, flexWrap: 'nowrap' }}>
            <Button compact icon="note" label={hasPointNotes(last.point.observations) ? 'Edit notes' : 'Add notes'}
              style={{ minWidth: 76, paddingHorizontal: 10 }} disabled={busy}
              onPress={() => openPointPanel('point-notes', last.id)}>Notes</Button>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderLeftWidth: 1, borderColor: c.line, paddingLeft: 8 }}>
              <Button quiet compact label="Edit point" style={{ width: 48, paddingHorizontal: 0, alignItems: 'center' }} disabled={busy}
                onPress={() => openPointPanel('edit-point', last.id)}><Icon name="edit" color={c.sub} size={17} /></Button>
              <Button quiet compact label="Delete last point" style={{ width: 48, paddingHorizontal: 0, alignItems: 'center' }} disabled={busy || !projection?.canDeleteLastPoint}
                onPress={() => openPointPanel('delete-point', last.id)}>
                <Icon name="trash" color={c.sub} size={17} />
              </Button>
            </View>
          </Row>
        </Row>
        {!projection?.canDeleteLastPoint && <T small muted>Undo the later score correction to delete this point.</T>}
      </Card>
    </View>;
  }

  function live() {
    if (!record || !projection || !canRecord) return null;
    const score = projection.score; const paused = score.status === 'suspended';
    const obs = record.draft.observations; const pending = record.draft.pending;
    const serviceStep = serveEntryStep(record.draft);
    if (paused) return <Stack><Card><Heading>Match paused</Heading><T muted>{record.timingStartedAt ? 'The match clock is paused. Your score and observations are saved.' : 'Your score and observations are saved.'}</T><Button primary disabled={busy} onPress={() => void addLifecycle({ type: 'resume' })}>Resume recording</Button><Button quiet disabled={busy} onPress={() => setPanel({ kind: 'finish' })}>Finish early</Button></Card>{previousPoint()}</Stack>;
    const serviceReference = record.mode === 'detailed' && serviceStep === 'point-ending' && pointServer !== undefined
      ? <ServeReturnSummary observations={obs} names={[record.players[0].name, record.players[1].name]} server={pointServer} lets={record.draft.lets} />
      : null;
    if (pending) {
      const winner = 'winner' in pending ? pending.winner : pending.ending === 'winner' ? pending.actor : other(pending.actor);
      return <Stack>
        {serviceReference}
        <Card style={{ padding: 10 }}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <PlayerBadge side={winner}>{`${record.players[winner].name} won the point`}</PlayerBadge>
            </View>
            <Button quiet compact disabled={busy} onPress={() => void selectPointDetail(null)}>Change winner</Button>
          </Row>
        </Card>
        <LastShotCard names={[record.players[0].name, record.players[1].name]} winner={winner} busy={busy}
          onShot={(actor, ending, value) => void savePoint({ type: 'ending', actor, ending, stroke: value, observations: obs })}
          onMore={(actor, ending) => void selectPointDetail({ actor, ending })}
          onUnknown={() => void savePoint({ type: 'winner-only', winner, observations: obs })}
          onHelp={() => setGuideOpen(true)}
        />
      </Stack>;
    }
    const missedReturner = record.mode === 'detailed' && obs.returnResult === 'error' && pointServer !== undefined
      ? other(pointServer)
      : null;
    const serviceQuestion = record.mode === 'detailed' && serviceStep !== 'point-ending';
    const serviceBack = record.mode === 'detailed' ? <Button quiet compact icon="chevron-left" testID="service-back"
      disabled={busy} onPress={() => void backServiceDetail()}>Back</Button> : null;
    return <Stack>
      {serviceReference}
      {serviceQuestion && pointServer !== undefined && <ServeRecordingCard
        step={serviceStep} names={[record.players[0].name, record.players[1].name]} server={pointServer}
        observations={obs} lets={record.draft.lets} busy={busy}
        onObservations={saveDraft} onEnding={saveServiceEnding} onSkip={() => void skipServiceDetail()}
        onStepBack={serviceStep === 'first-serve' ? undefined : () => void backServiceDetail()}
        onLet={() => void mutate(m => ({ ...m, draft: { ...m.draft, lets: m.draft.lets + 1 } }))}
      />}
      {!serviceQuestion && (missedReturner !== null ? <Card style={{ padding: 12, gap: 8 }}>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <PlayerBadge side={missedReturner} style={{ alignSelf: 'center' }}>{`${record.players[missedReturner].name} missed the return`}</PlayerBadge>
          <Row style={{ gap: 3, flexWrap: 'nowrap' }}>
            <OutcomeHelpButton onPress={() => setGuideOpen(true)} disabled={busy} />
            {serviceBack}
          </Row>
        </Row>
        <View style={layout.two}>
          {(['forced-error', 'unforced-error'] as const).map(ending => <Button
            key={ending}
            compact
            style={layout.cell}
            disabled={busy}
            onPress={() => void savePoint({ type: 'ending', actor: missedReturner, ending, stroke: obs.returnStroke, observations: obs })}
          >{endingNames[ending]}</Button>)}
        </View>
        <Button compact label="Not sure which error" style={{ backgroundColor: c.bg }} disabled={busy}
          onPress={() => void savePoint({ type: 'winner-only', winner: other(missedReturner), observations: obs })}>Not sure</Button>
      </Card> : <Card style={{ padding: 10, gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row style={{ flex: 1, flexWrap: 'nowrap' }}>
            <Icon name="record" color={c.accent} size={19} />
            <T bold style={{ fontSize: 19, flex: 1, minWidth: 0 }}>Who won the point?</T>
          </Row>
          {serviceBack}
        </Row>
        <View style={layout.two}>
          {([0, 1] as const).map(side => {
            const name = record.players[side].name;
            const { backgroundColor, borderColor, ink } = playerBadgeColors(c, side);
            return <Button
              key={side} testID={`point-winner-${side}`} label={name} style={[layout.cell, { backgroundColor, borderColor }]} disabled={busy}
              onPress={() => void (record.mode === 'score'
                ? savePoint({ type: 'winner-only', winner: side, observations: obs })
                : selectPointDetail({ winner: side }))}
            ><T bold style={{ color: ink, fontSize: 15, textAlign: 'center' }}>{name}</T></Button>;
          })}
        </View>
      </Card>)}
      {previousPoint()}
      <Row style={{ ...recordingSectionDivider, justifyContent: 'space-between', gap: 0 }}>
        <Button quiet disabled={busy} onPress={() => void addLifecycle({ type: 'suspend' })}>Pause</Button>
        <Button quiet disabled={busy} onPress={() => { setError(''); setPanel({ kind: 'finish' }); }}>Finish early</Button>
        <Button quiet testID="recording-mode" style={{ maxWidth: '100%' }} disabled={busy} onPress={() => { setError(''); setPanel({ kind: 'recording-mode' }); }}>
          {`Recording · ${modeOptions.find(option => option.value === record.mode)?.label}`}
        </Button>
      </Row>
    </Stack>;
  }
  function history() {
    if (!projection || !record) return null;
    const names = [record.players[0].name, record.players[1].name] as const;
    const actions = record.events.filter(event => event.type !== 'point');
    return <Stack>
      <Card style={{ gap: 5 }}>
        <Row><Icon name="history" color={c.accent} /><Eyebrow>Point log</Eyebrow></Row>
        <Heading>Point history</Heading>
        <T small muted>{projection.points.length} points recorded · Newest first</T>
      </Card>
      {projection.hasScoreCorrections && <Notice>The score includes manual corrections. These do not create shot statistics.</Notice>}
      {[...projection.pointEntries].reverse().map(({ id, point }, index) => <Card key={id} style={{ gap: 5 }}>
        <Eyebrow>Point {projection.points.length - index} · Stage {point.context.stage + 1}</Eyebrow>
        <T bold>{names[point.winner]} won</T>
        <T small>{pointEndingLabel(point, names)}</T>
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
          : event.type === 'edit-point' ? 'Point details edited' : event.type === 'delete-point' ? 'Point deleted' : 'Action undone'}</T>)}
      </Card>}
    </Stack>;
  }
  function homeContent() {
    return <MatchLibrary
      groups={groups} players={players} filter={filter} busy={busy} available={repository.current !== null}
      onFilter={setFilter}
      onNewMatch={() => showSetup(null)}
      onAddToEvent={() => { setError(''); setPanel({ kind: 'pick-event-for-match' }); }}
      onPerformance={showPlayerReport}
      onOpenMatch={id => void openMatch(id)}
    />;
  }
  const errorBlock = error ? <Stack><Notice error>{error}</Notice><Row>{retry.current && <Button disabled={busy} onPress={() => void retry.current?.()}>Retry saving</Button>}<Button disabled={busy} onPress={() => void external(async () => {
    if (current.current) { const saved = await repository.current!.getMatch(current.current.id); if (saved) { setCurrent(saved); updateList(saved); } }
    else await load();
    setError(''); retry.current = null;
  })}>{current.current ? 'Reload saved match' : 'Retry loading'}</Button></Row></Stack> : null;

  const pinScore = screen === 'match' && tab === 'record' && projection?.score.status === 'in-progress'
    && height >= 720 && fontScale <= 1.3;
  const showRecordingNotes = tab === 'record' && canRecord;
  const scoreboard = record && projection && <Scoreboard
    record={record} score={projection.score} timing={projection.timing} showPointStakes={tab === 'record'} reportView={tab === 'report'} busy={busy}
    toggleServer={tab === 'record' ? togglePointServer : undefined}
    correctScore={tab === 'record' && !record.draft.pending ? () => { setError(''); setPanel({ kind: 'correct' }); } : undefined}
    savedPoint={savedPoint?.matchId === record.id ? savedPoint : null}
    onSavedPointDone={dismissSavedPoint}
  />;

  return <SafeAreaView style={layout.root}>
    <StatusBar style="dark" />
    {screen === 'match' && tab === 'record' && projection?.score.status === 'in-progress' && <AwakeWhileRecording />}
    <View style={layout.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Image source={require('./assets/tennis-notebook-mark.png')} resizeMode="contain" style={{ width: 36, height: 36 }} accessible={false} />
        {screen === 'home' || screen === 'loading'
          ? <Image source={require('./assets/tennis-notebook-wordmark.png')} accessible accessibilityLabel="Tennis Notebook"
            resizeMode="contain" style={{ width: 114, height: 36, tintColor: c.ink }} />
          : <Button quiet compact={showRecordingNotes} icon="chevron-left" testID="back-to-matches" disabled={busy} onPress={() => void home()}>Matches</Button>}
      </View>
      {busy ? <View accessibilityLiveRegion="polite"><T small muted>Saving…</T></View>
        : screen === 'home' ? <Button icon="settings" compact style={{ paddingHorizontal: 10 }} disabled={repository.current === null} onPress={() => { setError(''); setNotice(''); setPanel({ kind: 'settings' }); }}>Settings</Button>
        : screen === 'match' && record && <Row style={{ flex: 1, minWidth: 0, justifyContent: 'flex-end', gap: 4 }}>
          {showRecordingNotes && <Button quiet compact onPress={openMatchNotes}>Match notes</Button>}
          <Button quiet compact={showRecordingNotes} onPress={() => { setError(''); setPanel({ kind: 'match-details' }); }}>Match details</Button>
        </Row>}
    </View>
    {pinScore && <View style={{ width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 18, paddingBottom: 5 }}>{scoreboard}</View>}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={mainScroll} key={`${screen}-${tab}-${screen === 'match' && tab === 'record' ? record?.mode : ''}`} keyboardShouldPersistTaps="handled" contentContainerStyle={layout.content}>
        {!panel && errorBlock}
        {screen === 'loading' ? <ActivityIndicator accessibilityLabel="Opening saved matches" color={c.accent} size="large" />
          : screen === 'home' ? homeContent()
          : screen === 'setup' ? <SetupForm players={players} event={setupEvent} preferredPlayerId={filter === 'all' ? null : filter} busy={busy} onSave={saveSetup} />
          : screen === 'player-report' ? <PlayerPerformance
            players={players} matches={matches} playerId={reportPlayerId} event={reportEvent} hasEvents={events.length > 0} busy={busy}
            onPlayer={setReportPlayerId} onChooseEvent={() => { setError(''); setPanel({ kind: 'pick-event-for-report' }); }}
            onExport={report => void external(async () => {
              if (Platform.OS === 'web') await sharePlayerPerformancePDF(report);
              else {
                const pdf = await preparePlayerPerformancePDF(report);
                setPanel({ kind: 'pdf-ready', pdf, title: 'Player performance', description: `${report.name} · ${report.scope}` });
              }
            })}
          />
          : record && projection ? tab === 'report'
            ? <MatchReport key={record.id} record={record} projection={projection} scoreboard={scoreboard} busy={busy}
              onExportPDF={() => { setError(''); setPanel({ kind: 'export-match-pdf' }); }}
              onExportCSV={() => void external(() => shareText(`tennis-match-${record.id}.csv`, reportCSV(record), 'text/csv'))}
              onEditNotes={openMatchNotes}
              renderPointActions={({ id, point }) => pointActions(id, point.observations)}
              scrollToTop={() => mainScroll.current?.scrollTo({ y: 0, animated: false })}
            />
            : <Stack>{!pinScore && scoreboard}{tab === 'record' ? live() : history()}</Stack>
          : null}
        {notice && !panel ? <View accessibilityLiveRegion="polite"><T small muted>{notice}</T></View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
    {screen === 'match' && <View style={layout.footer}><View style={layout.footerContent}>
      {canRecord && <Button testID="undo" label="Undo last action" quiet compact style={{ paddingHorizontal: 6 }} disabled={busy || !projection?.lastActionId} onPress={() => void undo()}>
        <View style={{ alignItems: 'center', gap: 3 }}><Icon name="undo" color={c.sub} size={17} /><T small muted style={{ fontSize: 11, lineHeight: 15 }}>Undo</T></View>
      </Button>}
      {matchTabs.filter(({ value }) => canRecord || value !== 'record').map(({ value, label, icon }) => {
        const selected = tab === value;
        const color = selected ? c.accent : c.sub;
        return <Button key={value} testID={`tab-${value}`} label={label} toggle compact quiet selected={selected} disabled={busy}
          style={{ flex: 1, paddingHorizontal: 6, backgroundColor: selected ? c.soft : 'transparent', borderColor: 'transparent' }}
          onPress={() => { setSavedPoint(null); setTab(value); setNotice(''); }}>
          <View style={{ alignItems: 'center', gap: 3 }}>
            <Icon name={icon} color={color} size={17} />
            <T small bold style={{ color, fontSize: 11, lineHeight: 15 }}>{label}</T>
          </View>
        </Button>;
      })}
    </View></View>}

    <Modal visible={panel !== null || guideOpen || strokeMenuOpen} transparent animationType="none" onRequestClose={() => {
      if (guideOpen) setGuideOpen(false);
      else if (!busy) closePanel();
    }}><SafeAreaView style={layout.modal}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={layout.sheet}>
      {guideOpen && <ScrollView contentContainerStyle={layout.content}>
        <OutcomeGuide onClose={() => setGuideOpen(false)} />
      </ScrollView>}
      {!guideOpen && <Row style={{ paddingHorizontal: 12, justifyContent: 'flex-end', borderBottomWidth: 1, borderColor: c.line, backgroundColor: c.card }}><Button quiet compact icon="close" disabled={busy} onPress={closePanel}>{strokeMenuOpen ? 'Close' : panel?.kind === 'settings' || panel?.kind === 'pdf-ready' ? 'Done' : 'Cancel'}</Button></Row>}
      {panel?.kind === 'point-notes' && selectedEntry && record && !guideOpen ? <PointNotesEditor
        key={selectedEntry.id} input={selectedEntry.input} names={[record.players[0].name, record.players[1].name]}
        busy={busy} errorBlock={errorBlock} onSave={saveSelectedPoint}
      /> : <ScrollView style={guideOpen ? { display: 'none' } : undefined} key={selectedEntry ? `${panel?.kind}-${selectedEntry.id}` : panel?.kind ?? (strokeMenuOpen ? 'more-strokes' : 'closed')} keyboardShouldPersistTaps="handled" contentContainerStyle={layout.content}>
      {panel?.kind === 'pdf-ready' || panel?.kind === 'export-match-pdf' ? error ? <Notice error>{error}</Notice> : null : errorBlock}
      {strokeMenuOpen && endingDraft && record && <MoreShotOptions
        name={record.players[endingDraft.actor].name} side={endingDraft.actor} ending={endingDraft.ending}
        busy={busy} allowServe={allowServeStroke} onStroke={value => void stroke(value)}
      />}
      {panel?.kind === 'settings' && <Stack>
        <Heading>Settings</Heading>
        {notice ? <Notice>{notice}</Notice> : null}
        <PlayerSettings players={players} matches={matches} busy={busy}
          onRename={player => { setError(''); setNotice(''); setPanel({ kind: 'rename-player', player }); }}
          onDelete={player => { setError(''); setNotice(''); setPanel({ kind: 'delete-player', player }); }}
        />
        <Card>
          <Row><Icon name="settings" color={c.accent} /><T bold>Backup and restore</T></Row>
          <T small muted>Save a copy of your records before moving phones or uninstalling.</T>
          <Button icon="download" disabled={busy} onPress={() => void exportBackup()}>Back up all records</Button>
          <Button icon="upload" disabled={busy} onPress={() => void restore()}>Restore backup</Button>
        </Card>
      </Stack>}
      {panel?.kind === 'rename-player' && <RenamePlayerForm player={panel.player} busy={busy}
        onCancel={closePanel} onSave={name => void renamePlayer(panel.player, name)} />}
      {panel?.kind === 'delete-player' && <DeletePlayerConfirmation player={panel.player} matches={matches} busy={busy}
        onCancel={closePanel} onConfirm={() => void deletePlayer(panel.player)} />}
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
      {panel?.kind === 'open-paused-match' && <Stack>
        <Heading>Match paused</Heading>
        <T>{panel.match.players[0].name} vs {panel.match.players[1].name}</T>
        <Button primary disabled={busy} onPress={() => void openMatch(panel.match.id, 'resume')}>Resume match</Button>
        <Button disabled={busy} onPress={() => void openMatch(panel.match.id, 'report')}>Open report</Button>
      </Stack>}
      {panel?.kind === 'open-unstarted-match' && <Stack>
        <Heading>Match not started</Heading>
        <T>{panel.match.players[0].name} vs {panel.match.players[1].name}</T>
        <Button primary icon="record" disabled={busy} onPress={() => setPanel({ kind: 'start-match', match: panel.match })}>Start match</Button>
        <Button disabled={busy} onPress={() => { setCurrent(panel.match); setPanel({ kind: 'match-details' }); }}>Match details</Button>
      </Stack>}
      {panel?.kind === 'start-match' && <StartMatchForm record={panel.match} busy={busy}
        onStart={firstServer => void startMatch(panel.match, firstServer)} />}
      {panel?.kind === 'match-details' && record && <MatchDetailsForm
        record={record} busy={busy}
        onSave={details => void mutate(m => {
          const eventId = matchEventKey(m) ?? (details.group ? `event:${randomUUID()}` : undefined);
          return { ...m, ...details, ...(eventId ? { eventId } : {}) };
        }, () => { closePanel(); setNotice('Match details saved.'); })}
        onDelete={() => void external(async () => {
          await repository.current!.deleteMatch(record.id, record.revision);
          setMatches(rows => rows.filter(match => match.id !== record.id));
          setPanel(null); setCurrent(null); setScreen('home'); setNotice('Match deleted.');
        })}
      />}
      {panel?.kind === 'match-notes' && record && <MatchNotesEditor notes={record.matchNotes ?? ''} busy={busy}
        onSave={matchNotes => void mutate(m => ({ ...m, matchNotes }), () => { setPanel(null); setNotice('Match notes saved.'); })}
      />}
      {panel?.kind === 'export-match-pdf' && record && <Stack>
        <View style={{ gap: 4 }}>
          <Heading>Export match PDF</Heading>
          <T small muted>{Platform.OS === 'web' ? 'Choose a report to download.' : 'Choose a report, then view or share the PDF.'}</T>
        </View>
        <View style={{ gap: 8 }}>
          {matchPDFOptions.map(({ variant, title, description, icon }) => <Button
            key={variant} testID={`match-pdf-${variant}`} label={`${title}. ${description}`} disabled={busy}
            onPress={() => void external(async () => {
              if (Platform.OS === 'web') {
                await sharePDF(record, variant);
                setPanel(null);
              } else {
                const pdf = await prepareMatchPDF(record, variant);
                setPanel({ kind: 'pdf-ready', pdf, title, description: `${record.players[0].name} vs ${record.players[1].name}` });
              }
            })}>
            <Row style={{ flexWrap: 'nowrap', gap: 12 }}>
              <View style={{ padding: 9, borderRadius: 9, backgroundColor: c.soft }}><Icon name={icon} color={c.accent} /></View>
              <View style={{ flex: 1, minWidth: 0 }}><T bold>{title}</T><T small muted>{description}</T></View>
              <Icon name={Platform.OS === 'web' ? 'download' : 'chevron-right'} color={c.sub} size={16} />
            </Row>
          </Button>)}
        </View>
        {busy && <Row style={{ justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent} />
          <View accessibilityLiveRegion="polite"><T small muted>Preparing PDF…</T></View>
        </Row>}
      </Stack>}
      {panel?.kind === 'pdf-ready' && <PDFReady title={panel.title} description={panel.description}
        canView={panel.pdf.canView} busy={busy}
        onView={() => void external(() => viewPreparedPDF(panel.pdf))}
        onShare={() => void external(() => sharePreparedPDF(panel.pdf))}
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
      {panel?.kind === 'delete-point' && selectedEntry && record && <Stack>
        <Heading>Delete the last point?</Heading>
        <T>{record.players[selectedEntry.point.winner].name} won this point. Deleting it removes its notes and recalculates the score and report.</T>
        {(record.draft.observations.firstServe !== 'unknown' || record.draft.lets > 0 || record.draft.actualServer != null) &&
          <T small muted>Any serve details entered for the next point will also be cleared.</T>}
        <Button destructive icon="trash" disabled={busy} onPress={() => void addEvent(
          { id: randomUUID(), type: 'delete-point', targetId: selectedEntry.id },
          () => { setPanel(null); setNotice('Point deleted. Tap Undo to restore it.'); },
          true,
        )}>Delete point</Button>
      </Stack>}
      {panel?.kind === 'import' && <Stack><Heading>Restore backup</Heading><T>{panel.preview.newPlayers} new players and {panel.preview.newMatches} new matches.</T><Notice>{panel.preview.identical} identical matches will be skipped. {panel.preview.conflicts} conflicts will be left unchanged.</Notice><T small muted>Existing records will not be overwritten.</T><Button primary disabled={busy || (panel.preview.newMatches === 0 && panel.preview.newPlayers === 0)} onPress={() => {
      const text = panel.text;
      void external(async () => { const result = await repository.current!.importNew(text); setPlayers(await repository.current!.players()); setMatches(await repository.current!.matches()); setPanel(null); setScreen('home'); setNotice(`Restored ${result.newMatches} matches. Existing records were kept.`); });
    }}>Import new records</Button></Stack>}</ScrollView>}</KeyboardAvoidingView></SafeAreaView></Modal>
  </SafeAreaView>;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <SafeAreaView style={{ flex: 1, padding: 24, justifyContent: 'center' }}><Heading>Let’s reopen your notebook</Heading><T>Your saved records have not been deleted.</T><Button onPress={() => this.setState(s => ({ failed: false, attempt: s.attempt + 1 }))}>Reopen saved records</Button></SafeAreaView> : <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>; }
}
export default function App() { return <SafeAreaProvider><AppTheme><AppErrorBoundary><Main /></AppErrorBoundary></AppTheme></SafeAreaProvider>; }
