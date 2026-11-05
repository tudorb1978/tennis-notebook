import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { MatchTiming } from '../domain/history.ts';
import { pointLabels } from '../domain/scoring.ts';
import type { MatchScore } from '../domain/scoring.ts';
import type { MatchRecord } from '../storage/model.ts';
import { CourtLines } from './CourtLines.tsx';
import { Button, Card, PlayerBadge, T, useTheme } from './kit.tsx';

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

export function Scoreboard({ record, score, timing, toggleServer, correctScore, busy }: {
  record: MatchRecord;
  score: MatchScore;
  timing: MatchTiming | null;
  toggleServer: (() => void) | undefined;
  correctScore: (() => void) | undefined;
  busy: boolean;
}) {
  const c = useTheme(); const columns: { label: string; values: readonly [string, string]; large: boolean }[] = [];
  for (const [i, result] of score.completedStages.entries()) columns.push({ label: result.kind === 'set' ? `Set ${i + 1}` : 'MTB', values: (result.kind === 'set' ? result.games : result.points).map(String) as [string, string], large: false });
  if (score.current) {
    if (score.current.phase === 'match-tie-break') columns.push({ label: 'MTB', values: pointLabels(score), large: true });
    else { columns.push({ label: `Set ${score.current.index + 1}`, values: score.current.games.map(String) as [string, string], large: false }); columns.push({ label: 'Points', values: pointLabels(score), large: true }); }
  }
  const overridden = record.draft.actualServer != null;
  const serving = score.status === 'in-progress' ? record.draft.actualServer ?? score.current!.server : null;
  const status = serving !== null
    ? `${record.players[serving].name} serving${overridden ? ' · this point only' : score.current!.phase !== 'game' ? ' · tie-break' : ''}`
    : score.winner !== null
      ? `${record.players[score.winner].name} wins${score.status === 'retired' ? ' by retirement' : ''}`
      : score.status === 'abandoned' ? 'Abandoned · no winner' : 'Match paused';
  const scoreWidth = (large: boolean) => large ? 50 : 35;
  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 };

  return <Card style={{ backgroundColor: c.court, borderColor: c.courtLine, paddingHorizontal: 13, paddingVertical: 8, gap: 3, overflow: 'hidden' }}>
    <CourtLines centered opacity={0.46} />
    <View style={{ ...row, gap: 12 }}>
      <Text numberOfLines={1} style={{ color: c.courtInk, flex: 1, minWidth: 0, fontSize: 13, fontWeight: '600', lineHeight: 19 }}>
        {record.group || 'Singles'}
      </Text>
      {timing && timing.playingMs !== null && <MatchClock playingMs={timing.playingMs} runningSinceMs={timing.runningSinceMs} />}
    </View>
    <View style={{ ...row, justifyContent: 'flex-end' }}>
      {columns.map((col, i) => <Text key={i} style={{
        width: scoreWidth(col.large), textAlign: 'center', color: col.large ? c.lime : c.courtSub, fontSize: 11,
        fontWeight: col.large ? '700' : '500',
      }}>{col.label}</Text>)}
    </View>
    {([0, 1] as const).map(side => <View key={side} style={row}>
      <View style={{ ...row, flex: 1, minWidth: 0, paddingRight: 4 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: serving === side ? c.lime : 'transparent' }} />
        <PlayerBadge side={side} numberOfLines={2} style={{ alignSelf: 'center' }}>{record.players[side].name}</PlayerBadge>
      </View>
      {columns.map((col, i) => <View key={i} style={{
        width: scoreWidth(col.large), minHeight: 34, justifyContent: 'center', borderRadius: 8,
        backgroundColor: col.large ? c.lime : 'transparent',
      }}>
        <Text testID={`score-${side}-${i}`} accessibilityLabel={`${record.players[side].name}, ${col.label}, ${col.values[side]}`} style={{
          textAlign: 'center', color: col.large ? c.limeInk : c.courtInk, fontSize: col.large ? 26 : 19,
          fontWeight: col.large ? '700' : '500', fontVariant: ['tabular-nums'],
        }}>{col.values[side]}</Text>
      </View>)}
    </View>)}
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
  </Card>;
}
