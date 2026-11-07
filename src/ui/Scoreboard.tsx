import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { MatchTiming } from '../domain/history.ts';
import { pointLabels, pointStakes } from '../domain/scoring.ts';
import type { MatchScore, PointStake, Side } from '../domain/scoring.ts';
import { setTieBreakLabel } from '../reports/report.ts';
import type { MatchRecord } from '../storage/model.ts';
import { CourtLines } from './CourtLines.tsx';
import { Button, Card, PlayerBadge, T, useTheme } from './kit.tsx';
import { PointSavedConfirmation } from './PointSavedConfirmation.tsx';
import type { PointSavedSummary } from './pointSaved.ts';

const stakeLabels: Record<PointStake, string> = { match: 'Match point', set: 'Set point', break: 'Break point' };

function MatchClock({ playingMs, runningSinceMs }: { playingMs: number; runningSinceMs: number | null }) {
  const c = useTheme();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (runningSinceMs === null) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [runningSinceMs]);

  const elapsedMs = playingMs + (runningSinceMs === null ? 0 : Math.max(0, now - runningSinceMs));
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return <Text testID="match-clock" style={{ color: c.courtSub, flexShrink: 0, textAlign: 'right', fontSize: 12, lineHeight: 19, fontVariant: ['tabular-nums'] }}>
    {`Playing time · ${hours ? `${hours}:` : ''}${minutes}:${seconds}`}
  </Text>;
}

export function Scoreboard({ record, score, timing, toggleServer, correctScore, showPointStakes, reportView, busy, savedPoint, onSavedPointDone }: {
  record: MatchRecord;
  score: MatchScore;
  timing: MatchTiming | null;
  toggleServer: (() => void) | undefined;
  correctScore: (() => void) | undefined;
  showPointStakes: boolean;
  reportView: boolean;
  busy: boolean;
  savedPoint: { id: string; summary: PointSavedSummary } | null;
  onSavedPointDone: (id: string) => void;
}) {
  type Column = { label: string; values: readonly [string, string]; large: boolean; tieBreak?: { label: string; winner: Side } };
  const c = useTheme(); const columns: Column[] = [];
  for (const [i, result] of score.completedStages.entries()) {
    const label = reportView ? setTieBreakLabel(result) : '';
    columns.push({
      label: result.kind === 'set' ? `Set ${i + 1}` : 'MTB',
      values: (result.kind === 'set' ? result.games : result.points).map(String) as [string, string],
      large: false,
      ...(label ? { tieBreak: { label, winner: result.winner } } : {}),
    });
  }
  if (score.current) {
    if (score.current.phase === 'match-tie-break') columns.push({ label: 'MTB', values: pointLabels(score), large: true });
    else { columns.push({ label: `Set ${score.current.index + 1}`, values: score.current.games.map(String) as [string, string], large: false }); columns.push({ label: 'Points', values: pointLabels(score), large: true }); }
  }
  const overridden = record.draft.actualServer != null;
  const serving = score.status === 'in-progress' && !reportView ? record.draft.actualServer ?? score.current!.server : null;
  const stakes = showPointStakes ? pointStakes(score, serving ?? undefined) : null;
  const status = serving !== null
    ? `${record.players[serving].name} serving${overridden ? ' · this point only' : score.current!.phase !== 'game' ? ' · tie-break' : ''}`
    : score.winner !== null
      ? `${record.players[score.winner].name} wins${score.status === 'retired' ? ' by retirement' : ''}`
      : score.status === 'abandoned' ? 'Abandoned · no winner' : score.status === 'suspended' ? 'Match paused' : 'In progress';
  const scoreWidth = (col: Column) => col.large ? 50 : col.tieBreak ? Math.max(35, 14 + col.tieBreak.label.length * 6) : 35;
  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 };

  return <Card style={{ backgroundColor: c.court, borderColor: c.courtLine, paddingHorizontal: 13, paddingVertical: 8, gap: 3, overflow: 'hidden' }}>
    <CourtLines centered opacity={0.46} />
    <View style={{ ...row, alignItems: reportView ? 'flex-start' : 'center', gap: 12 }}>
      <Text numberOfLines={reportView ? 3 : 1} style={{ color: c.courtInk, flex: 1, minWidth: 0, fontSize: 13, fontWeight: '600', lineHeight: 19 }}>
        {record.group || 'Singles'}
      </Text>
      {timing && timing.playingMs !== null && <MatchClock playingMs={timing.playingMs} runningSinceMs={timing.runningSinceMs} />}
    </View>
    <View style={{ ...row, justifyContent: 'flex-end' }}>
      {columns.map((col, i) => <Text key={i} style={{
        width: scoreWidth(col), textAlign: 'center', color: col.large ? c.lime : c.courtSub, fontSize: 11,
        fontWeight: col.large ? '700' : '500',
      }}>{col.label}</Text>)}
    </View>
    {([0, 1] as const).map(side => <View key={side} style={row}>
      <View style={{ ...row, flex: 1, minWidth: 0, paddingRight: 4 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: serving === side ? c.lime : 'transparent' }} />
        <PlayerBadge side={side} numberOfLines={2} style={{ alignSelf: 'center' }}>{record.players[side].name}</PlayerBadge>
      </View>
      {columns.map((col, i) => {
        const tieBreak = col.tieBreak && col.tieBreak.winner !== side ? col.tieBreak.label : '';
        return <View key={i} style={{
          width: scoreWidth(col), minHeight: 34, justifyContent: 'center', borderRadius: 8,
          backgroundColor: col.large ? c.lime : 'transparent',
        }}>
          <Text testID={`score-${side}-${i}`} accessibilityLabel={`${record.players[side].name}, ${col.label}, ${col.values[side]}${tieBreak}`} style={{
            textAlign: 'center', color: col.large ? c.limeInk : c.courtInk, fontSize: col.large ? 26 : 19,
            fontWeight: col.large ? '700' : '500', fontVariant: ['tabular-nums'],
          }}>{col.values[side]}{tieBreak && <Text style={{ fontSize: 11 }}>{tieBreak}</Text>}</Text>
        </View>;
      })}
    </View>)}
    {stakes?.some(labels => labels.length > 0) && <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
      {([0, 1] as const).map(side => stakes[side].length > 0 && <View key={side} style={{ maxWidth: '100%', backgroundColor: c.lime, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text testID={`point-stakes-${side}`} style={{ color: c.limeInk, fontSize: 12, lineHeight: 18, fontWeight: '700' }}>
          {[record.players[side].name, ...stakes[side].filter(stake => stake !== 'set' || !stakes[side].includes('match')).map(stake => stakeLabels[stake])].join(' · ')}
        </Text>
      </View>)}
    </View>}
    <View style={{ ...row, marginTop: 3, borderTopWidth: 1, borderColor: c.courtLine, minHeight: 34 }}>
      <T small style={{ color: c.courtSub, flex: 1, minWidth: 0 }}>{status}</T>
      {serving !== null && (toggleServer || correctScore) && <View style={{ ...row, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '75%' }}>
        {toggleServer && <Button
          quiet testID="toggle-point-server" disabled={busy} onPress={toggleServer}
          label={overridden ? 'Reset server, use scheduled server' : 'Switch server for this point'}
          style={{ paddingHorizontal: 6, paddingVertical: 4 }}
        >
          <T small muted style={{ color: c.courtInk, textAlign: 'center', textDecorationLine: 'underline' }}>
            {overridden ? 'Reset server' : 'Switch server'}
          </T>
        </Button>}
        {correctScore && <Button quiet label="Correct score" disabled={busy} onPress={correctScore} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
          <T small muted style={{ color: c.courtInk, textAlign: 'center', textDecorationLine: 'underline' }}>Correct score</T>
        </Button>}
      </View>}
    </View>
    {savedPoint && <PointSavedConfirmation key={savedPoint.id} summary={savedPoint.summary}
      names={[record.players[0].name, record.players[1].name]} onDone={() => onSavedPointDone(savedPoint.id)} />}
  </Card>;
}
