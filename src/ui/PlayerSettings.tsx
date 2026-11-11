import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { replayMatch } from '../domain/history.ts';
import type { MatchRecord, PlayerProfile } from '../storage/model.ts';
import { Icon } from './Icon.tsx';
import { Button, Card, Field, Heading, Notice, Row, Stack, T, useTheme, useContentWidth } from './kit.tsx';

export function PlayerSettings({ players, matches, busy, onRename, onDelete }: {
  players: readonly PlayerProfile[];
  matches: readonly MatchRecord[];
  busy: boolean;
  onRename: (player: PlayerProfile) => void;
  onDelete: (player: PlayerProfile) => void;
}) {
  const c = useTheme();
  const width = useContentWidth();
  const stacked = width < 480;
  return <Card>
    <Row style={{ flexWrap: 'nowrap', gap: 10 }}>
      <View style={{ padding: 8, borderRadius: 9, backgroundColor: c.soft }}><Icon name="players" color={c.accent} /></View>
      <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 18, lineHeight: 24, fontWeight: '700' }}>Players</Text>
    </Row>
    {players.length ? players.map((player, index) => {
      const count = matches.filter(match => match.players[0].id === player.id).length;
      return <View key={player.id} testID={`player-settings-${player.id}`} style={{
        flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'stretch' : 'center', gap: stacked ? 8 : 12,
        borderTopWidth: index ? StyleSheet.hairlineWidth : 0, borderColor: c.line, paddingTop: index ? 12 : 0,
      }}>
        <View style={{ flex: stacked ? undefined : 1, minWidth: 0, gap: 2 }}>
          <T bold>{player.name}</T>
          <T small muted>{count} {count === 1 ? 'saved match' : 'saved matches'}</T>
        </View>
        <Row style={{ gap: 6, justifyContent: 'flex-end' }}>
          <Button compact icon="edit" label={`Rename ${player.name}`} testID={`rename-player-${player.id}`}
            style={{ paddingHorizontal: 10, backgroundColor: c.bg }} disabled={busy} onPress={() => onRename(player)}>Rename</Button>
          <Button compact label={`Delete ${player.name}`} testID={`delete-player-${player.id}`}
            style={{ paddingHorizontal: 10, backgroundColor: c.bg }} disabled={busy} onPress={() => onDelete(player)}>
            <Row style={{ flexWrap: 'nowrap', justifyContent: 'center', gap: 5 }}>
              <Icon name="trash" color={c.error} size={15} /><T small bold style={{ color: c.error }}>Delete</T>
            </Row>
          </Button>
        </Row>
      </View>;
    }) : <View style={{ padding: 12, borderRadius: 10, backgroundColor: c.bg, gap: 3 }}>
      <T small bold>No players yet</T>
      <T small muted>Players will appear here when you save your first match.</T>
    </View>}
  </Card>;
}

export function RenamePlayerForm({ player, busy, onSave, onCancel }: {
  player: PlayerProfile;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(player.name);
  const trimmed = name.trim();
  const error = !trimmed ? 'Enter a player name.' : trimmed.length > 80 ? 'Use 80 characters or fewer.' : '';
  return <Stack>
    <Heading>Rename player</Heading>
    <T small muted>The new name will appear on their saved matches and reports.</T>
    <Field label="Player name" testID="player-name" value={name} onChange={setName} maxLength={80} />
    {error ? <Notice error>{error}</Notice> : null}
    <Button primary testID="save-player-name" disabled={busy || Boolean(error) || trimmed === player.name} onPress={() => onSave(trimmed)}>Save name</Button>
    <Button testID="keep-player-name" disabled={busy} onPress={onCancel}>Keep name</Button>
  </Stack>;
}

export function DeletePlayerConfirmation({ player, matches, busy, onConfirm, onCancel }: {
  player: PlayerProfile;
  matches: readonly MatchRecord[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const c = useTheme();
  const counts = useMemo(() => {
    const owned = matches.filter(match => match.players[0].id === player.id);
    const points = owned.reduce((total, match) => total + (match.firstServer === null ? 0
      : replayMatch(match.format, match.firstServer, match.events, match.timingStartedAt).points.length), 0);
    return { matches: owned.length, points };
  }, [matches, player.id]);
  return <Stack>
    <View style={{ alignSelf: 'flex-start', padding: 10, borderRadius: 12, backgroundColor: c.bg }}><Icon name="trash" color={c.error} size={24} /></View>
    <Heading>Delete {player.name}?</Heading>
    <Card style={{ backgroundColor: c.bg, gap: 6 }}>
      <T bold>{counts.matches} {counts.matches === 1 ? 'saved match' : 'saved matches'}</T>
      <T small muted>{counts.points} {counts.points === 1 ? 'recorded point' : 'recorded points'}</T>
    </Card>
    <Notice error>
      This permanently deletes {player.name}’s profile and every saved match recorded for them, including all recorded points, match notes, point notes and performance history. This cannot be undone.
    </Notice>
    <Button testID="keep-player" disabled={busy} onPress={onCancel}>Keep player</Button>
    <Button destructive icon="trash" testID="confirm-delete-player" disabled={busy} onPress={onConfirm}>Delete player &amp; data</Button>
  </Stack>;
}
