import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { replayMatch } from '../domain/history.ts';
import type { MatchEvent } from '../domain/history.ts';
import type { PointInput, PointObservations, Stroke } from '../domain/points.ts';
import { other } from '../domain/scoring.ts';
import { serveEntryStep } from '../domain/serveEntry.ts';
import type { LifecycleAction, ScoreCorrection, Side } from '../domain/scoring.ts';
import type { ImportPreview, MatchRepository } from '../storage/repository.ts';
import { groupMatches, matchEventKey } from '../storage/matchGroups.ts';
import type { MatchGroup } from '../storage/matchGroups.ts';
import type { MatchDraft, MatchRecord, PlayerProfile, RecordingMode, UnstartedMatchRecord } from '../storage/model.ts';
import { reportCSV } from '../reports/report.ts';
import type { PlayerPerformanceReport } from '../reports/playerPerformance.ts';
import type { MatchPDFVariant } from '../reports/pdf.ts';
import { pointSavedSummary } from '../reports/pointSaved.ts';
import type { PointSavedSummary } from '../reports/pointSaved.ts';
import type { NotebookDependencies, PreparedPDF } from './ports.ts';
import { appendMatchEvent, backDraftService, canRecordMatch, changeDraftObservations, createMatch, selectPointDetail as changePointDetail, selectStrokeInput, serviceEndingInput, skipDraftService, toggleDraftServer, undoMatch } from './matchCommands.ts';
import type { MatchDetailsValues, SetupValues } from './matchCommands.ts';

type Screen = 'loading' | 'home' | 'setup' | 'match' | 'player-report';
type Tab = 'record' | 'history' | 'report';
type PointPanel = 'edit-point' | 'point-notes' | 'delete-point';
type Panel = { kind: 'correct' } | { kind: 'finish' } | { kind: 'recording-mode' } | { kind: 'match-details' } | { kind: 'match-notes' } | { kind: 'export-match-pdf' } | { kind: 'pdf-ready'; pdf: PreparedPDF; title: string; description: string } | { kind: 'pick-event-for-match' } | { kind: 'pick-event-for-report' } | { kind: 'open-paused-match'; match: MatchRecord } | { kind: 'open-unstarted-match' | 'start-match'; match: UnstartedMatchRecord } | { kind: 'settings' } | { kind: 'rename-player' | 'delete-player'; player: PlayerProfile } | { kind: PointPanel; id: string } | { kind: 'import'; text: string; preview: ImportPreview } | null;

export function useNotebook(dependencies: NotebookDependencies) {
  const repository = useRef<MatchRepository | null>(null);
  const current = useRef<MatchRecord | null>(null);
  const saving = useRef(false);
  const retry = useRef<(() => Promise<unknown>) | null>(null);
  // Views can react to a successful entry save without participating in it.
  const [entrySavedVersion, setEntrySavedVersion] = useState(0);
  const notifyEntrySaved = () => setEntrySavedVersion(version => version + 1);
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
      const repo = await dependencies.openRepository(); repository.current = repo;
      const [savedPlayers, savedMatches, resumeId] = await Promise.all([repo.players(), repo.matches(), repo.resumeId()]);
      setPlayers(savedPlayers); setMatches(savedMatches);
      const active = savedMatches.find(m => m.id === resumeId);
      if (active && active.firstServer !== null && canRecordMatch(replayMatch(active.format, active.firstServer, active.events).score.status)) {
        current.current = active; setRecord(active); setTab('record'); setScreen('match');
      } else setScreen('home');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open saved records.'); setScreen('home'); }
  }, [dependencies]);
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
      const candidate = { ...transform(previous), updatedAt: dependencies.now() };
      const saved = await repository.current.saveMatch(candidate, previous.revision);
      setCurrent(saved); updateList(saved); retry.current = null; done?.(saved); return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the entry.');
      retry.current = () => mutate(transform, done); return false;
    } finally { saving.current = false; setBusy(false); }
  };
  const addEvent = (event: MatchEvent, done?: (saved: MatchRecord) => void, clearDraft = false) =>
    mutate(m => appendMatchEvent(m, event, clearDraft), done);
  const undo = () => mutate(m => undoMatch(m, dependencies.createId()));
  const addLifecycle = (action: LifecycleAction, done?: () => void, clearDraft = false) =>
    addEvent({ id: dependencies.createId(), type: 'lifecycle', action, recordedAt: dependencies.now() }, done, clearDraft);
  const savePoint = (input: PointInput) => {
    const actualServer = record?.draft.actualServer;
    const event: MatchEvent = {
      id: dependencies.createId(),
      type: 'point',
      recordedAt: dependencies.now(),
      input: actualServer == null ? input : { ...input, actualServer },
    };
    return addEvent(event, saved => {
      if (saved.firstServer !== null) {
        const next = replayMatch(saved.format, saved.firstServer, saved.events);
        setSavedPoint({ id: event.id, matchId: saved.id,
          summary: pointSavedSummary(next, [saved.players[0].name, saved.players[1].name]) });
      }
      setNotice('');
      notifyEntrySaved();
    }, true);
  };
  const saveDraft = (observations: PointObservations) => mutate(m => changeDraftObservations(m, observations), notifyEntrySaved);
  const skipServiceDetail = () => mutate(skipDraftService, notifyEntrySaved);
  const backServiceDetail = () => mutate(backDraftService, notifyEntrySaved);
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
  const handleBack = () => {
    if (saving.current) return true;
    if (guideOpen) { setGuideOpen(false); return true; }
    if (panel || strokeMenuOpen) { closePanel(); return true; }
    if (screen === 'match' && tab === 'record' && record?.mode === 'detailed' && projection?.score.status === 'in-progress') {
      if (record.draft.pending) { void selectPointDetail(null); return true; }
      if (serveEntryStep(record.draft) !== 'first-serve') { void backServiceDetail(); return true; }
    }
    if (screen === 'match' || screen === 'setup' || screen === 'player-report') { void home(); return true; }
    return false;
  };
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
    void mutate(match => toggleDraftServer(match, scheduledServer));
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
    const { match: next, newPlayer } = createMatch(values, players, setupEvent, { id: dependencies.createId, now: dependencies.now });
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
    await dependencies.files.shareText(`tennis-backup-${dependencies.now().slice(0, 10)}.json`, data, 'application/json');
    setPanel(null);
    setNotice('Backup prepared. Keep a copy outside this app.');
  });
  const restore = () => external(async () => { const text = await dependencies.files.pickBackup(); if (text) setPanel({ kind: 'import', text, preview: await repository.current!.previewImport(text) }); });
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
  const saveSelectedPoint = (input: PointInput) => {
    if (!selectedEntry || (!canRecord && panel?.kind !== 'point-notes')) return;
    void addEvent({ id: dependencies.createId(), type: 'edit-point', targetId: selectedEntry.id, input }, () => {
      setPanel(null);
      setNotice(panel?.kind === 'point-notes' ? 'Point notes saved.' : 'Point updated.');
    });
  };
  const selectPointDetail = (pending: MatchDraft['pending']) => mutate(m => changePointDetail(m, pending), notifyEntrySaved);
  const stroke = (value: Stroke) => {
    if (!record) return;
    const input = selectStrokeInput(record, value, allowServeStroke);
    if (input) return savePoint(input);
  };
  const saveServiceEnding = (type: 'ace' | 'double-fault') => {
    if (pointServer === undefined || !record) return;
    return savePoint(serviceEndingInput(record, type, pointServer));
  };

  const reloadSavedRecords = () => external(async () => {
    if (current.current) {
      const saved = await repository.current!.getMatch(current.current.id);
      if (saved) { setCurrent(saved); updateList(saved); }
    } else await load();
    setError(''); retry.current = null;
  });
  const retrySave = () => retry.current?.();
  const showMatchDetails = (match: MatchRecord) => { setCurrent(match); setPanel({ kind: 'match-details' }); };
  const saveMatchDetails = ({ opponent, ...details }: MatchDetailsValues) => mutate(m => {
    const eventId = matchEventKey(m) ?? (details.group ? `event:${dependencies.createId()}` : undefined);
    return { ...m, ...details, players: [m.players[0], { ...m.players[1], name: opponent }], ...(eventId ? { eventId } : {}) };
  }, () => { closePanel(); setNotice('Match details saved.'); });
  const deleteMatch = () => external(async () => {
    if (!record) return;
    await repository.current!.deleteMatch(record.id, record.revision);
    setMatches(rows => rows.filter(match => match.id !== record.id));
    setPanel(null); setCurrent(null); setScreen('home'); setNotice('Match deleted.');
  });
  const saveMatchNotes = (matchNotes: string) => mutate(m => ({ ...m, matchNotes }), () => {
    setPanel(null); setNotice('Match notes saved.');
  });
  const changeRecordingMode = (mode: RecordingMode) => {
    if (record?.mode === mode) { setPanel(null); return; }
    return mutate(m => ({ ...m, mode }), () => setPanel(null));
  };
  const correctScore = (correction: ScoreCorrection, reason: string) => addEvent(
    { id: dependencies.createId(), type: 'correction', correction, reason }, () => setPanel(null), true,
  );
  const finishMatch = (kind: 'retire' | 'abandon', player: Side) => addLifecycle(
    kind === 'retire' ? { type: 'retire', player } : { type: 'abandon' },
    () => { setPanel(null); setTab('report'); }, true,
  );
  const deleteSelectedPoint = () => {
    if (!selectedEntry) return;
    return addEvent({ id: dependencies.createId(), type: 'delete-point', targetId: selectedEntry.id },
      () => { setPanel(null); setNotice('Point deleted. Tap Undo to restore it.'); }, true);
  };
  const importBackup = () => {
    if (panel?.kind !== 'import') return;
    const text = panel.text;
    return external(async () => {
      const result = await repository.current!.importNew(text);
      setPlayers(await repository.current!.players()); setMatches(await repository.current!.matches());
      setPanel(null); setScreen('home'); setNotice(`Restored ${result.newMatches} matches. Existing records were kept.`);
    });
  };
  const exportMatchPDF = (variant: MatchPDFVariant, title: string) => external(async () => {
    if (!record) return;
    const pdf = await dependencies.files.exportMatchPDF(record, variant);
    setPanel(pdf ? { kind: 'pdf-ready', pdf, title, description: `${record.players[0].name} vs ${record.players[1].name}` } : null);
  });
  const exportPlayerPDF = (report: PlayerPerformanceReport) => external(async () => {
    const pdf = await dependencies.files.exportPlayerPDF(report);
    if (pdf) setPanel({ kind: 'pdf-ready', pdf, title: 'Player performance', description: `${report.name} · ${report.scope}` });
  });
  const exportMatchCSV = () => external(async () => {
    if (record) await dependencies.files.shareText(`tennis-match-${record.id}.csv`, reportCSV(record), 'text/csv');
  });
  const viewPDF = (pdf: PreparedPDF) => external(() => dependencies.files.viewPDF(pdf));
  const sharePDF = (pdf: PreparedPDF) => external(() => dependencies.files.sharePDF(pdf));
  const addLet = () => mutate(m => ({ ...m, draft: { ...m.draft, lets: m.draft.lets + 1 } }));
  const choosePointWinner = (winner: Side) => {
    if (!record) return;
    return record.mode === 'score' ? savePoint({ type: 'winner-only', winner, observations: record.draft.observations }) : selectPointDetail({ winner });
  };
  const recordShot = (actor: Side, ending: 'winner' | 'unforced-error' | 'forced-error', stroke: Stroke) => {
    if (record) return savePoint({ type: 'ending', actor, ending, stroke, observations: record.draft.observations });
  };
  const recordUnknownEnding = (winner: Side) => {
    if (record) return savePoint({ type: 'winner-only', winner, observations: record.draft.observations });
  };

  return {
    screen, players, matches, record, panel, guideOpen, busy, error, notice, savedPoint, entrySavedVersion,
    filter, setupEvent, reportPlayerId, reportEventKey, projection, canRecord, tab,
    pointServer, endingDraft, strokeMenuOpen, allowServeStroke, selectedEntry, groups, events, reportEvent,
    available: repository.current !== null, canRetrySave: retry.current !== null,
    setFilter, setReportPlayerId, setReportEventKey, setTab, setPanel, setGuideOpen, setError, setNotice, setSavedPoint,
    dismissSavedPoint, home, openMatch, closePanel, handleBack, togglePointServer,
    showSetup, showPlayerReport, saveSetup, startMatch, exportBackup, restore, renamePlayer, deletePlayer,
    openPointPanel, openMatchNotes, saveSelectedPoint, selectPointDetail, stroke, saveServiceEnding,
    saveDraft, skipServiceDetail, backServiceDetail, undo,
    pauseMatch: () => addLifecycle({ type: 'suspend' }), resumeMatch: () => addLifecycle({ type: 'resume' }),
    reloadSavedRecords, retrySave, showMatchDetails, saveMatchDetails, deleteMatch, saveMatchNotes,
    changeRecordingMode, correctScore, finishMatch, deleteSelectedPoint, importBackup,
    exportMatchPDF, exportPlayerPDF, exportMatchCSV, viewPDF, sharePDF, addLet, choosePointWinner, recordShot, recordUnknownEnding,
  };
}

export type NotebookController = ReturnType<typeof useNotebook>;
