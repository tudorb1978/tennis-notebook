import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MatchRepository } from '../../src/storage/repository.ts';
import type { Database, SQLValue } from '../../src/storage/repository.ts';
import { emptyDraft, parseBackup } from '../../src/storage/model.ts';
import type { MatchRecord } from '../../src/storage/model.ts';
import { presets } from '../../src/domain/presets.ts';
import { appendEvent, replayMatch } from '../../src/domain/history.ts';
import { reportCSV, reportHTML } from '../../src/reports/report.ts';

function adapter(db: DatabaseSync): Database {
  return {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...params: SQLValue[]) { return { changes: Number(db.prepare(sql).run(...params).changes) }; },
    async getAllAsync<T>(sql: string, ...params: SQLValue[]) { return db.prepare(sql).all(...params) as T[]; },
    async getFirstAsync<T>(sql: string, ...params: SQLValue[]) { return (db.prepare(sql).get(...params) as T | undefined) ?? null; },
    async withTransactionAsync(task) { db.exec('BEGIN'); try { await task(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
const player = { id: 'player-1', name: 'Alex', createdAt: '2026-11-04T12:00:00.000Z' };
function fixture(id = 'match-1'): MatchRecord {
  return { schemaVersion: 1, id, revision: 0, createdAt: player.createdAt, updatedAt: player.createdAt, players: [{ id: player.id, name: player.name }, { id: null, name: 'Jamie' }], date: '2026-11-04', group: 'Club event', round: '', venue: '', surface: 'Hard', conditions: 'Windy', format: presets['fast4-match-tiebreak'], firstServer: 0, mode: 'endings', events: [], draft: emptyDraft() };
}
async function memory() { const db = new DatabaseSync(':memory:'); const repo = new MatchRepository(adapter(db)); await repo.initialize(); return { db, repo }; }

test('SQLite stores and recovers a pending stroke, serve draft, and point after closing the database', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'tennis-storage-')); const path = join(folder, 'matches.db');
  let db = new DatabaseSync(path);
  try {
    let repo = new MatchRepository(adapter(db)); await repo.initialize();
    let match = await repo.createMatch(fixture(), player);
    match = await repo.saveMatch({ ...match, draft: { observations: { ...match.draft.observations, firstServe: 'fault', secondServe: 'in' }, pending: { actor: 1, ending: 'unforced-error' }, lets: 1 } }, match.revision);
    db.close(); db = new DatabaseSync(path); repo = new MatchRepository(adapter(db)); await repo.initialize();
    const restored = (await repo.getMatch(match.id))!;
    assert.equal(restored.draft.pending!.ending, 'unforced-error');
    assert.equal(restored.draft.observations.secondServe, 'in');
    assert.equal(await repo.resumeId(), match.id);
    const events = appendEvent(restored.format, restored.firstServer, restored.events, { id: 'point-1', type: 'point', input: { type: 'ending', actor: 1, ending: 'unforced-error', stroke: 'backhand', observations: restored.draft.observations } });
    await repo.saveMatch({ ...restored, events, draft: emptyDraft() }, restored.revision);
    db.close(); db = new DatabaseSync(path); repo = new MatchRepository(adapter(db)); await repo.initialize();
    const saved = (await repo.getMatch(match.id))!;
    assert.deepEqual(replayMatch(saved.format, saved.firstServer, saved.events).score.current!.points, [1, 0]);
    assert.equal(saved.draft.pending, null);
  } finally { db.close(); await rm(folder, { recursive: true, force: true }); }
});

test('Revision checks prevent stale saves from overwriting a newer point', async () => {
  const { db, repo } = await memory();
  try {
    const original = await repo.createMatch(fixture(), player);
    await repo.saveMatch({ ...original, group: 'Updated group' }, original.revision);
    await assert.rejects(repo.saveMatch({ ...original, group: 'Stale group' }, original.revision), /changed elsewhere/);
    assert.equal((await repo.getMatch(original.id))!.group, 'Updated group');
  } finally { db.close(); }
});

test('Match deletion checks the revision and clears only its resume pointer in the same transaction', async () => {
  const { db, repo } = await memory();
  try {
    const match = await repo.createMatch(fixture(), player);
    const other = await repo.createMatch(fixture('other-match'), null);
    const updated = await repo.saveMatch({ ...match, group: 'Updated group' }, match.revision);
    await assert.rejects(repo.deleteMatch(match.id, match.revision), /changed elsewhere/);
    assert.equal(await repo.resumeId(), other.id);

    await repo.setResumeId(match.id);
    db.exec("CREATE TRIGGER prevent_resume_delete BEFORE DELETE ON preferences BEGIN SELECT RAISE(ABORT, 'resume failure'); END");
    await assert.rejects(repo.deleteMatch(match.id, updated.revision), /resume failure/);
    assert.deepEqual(await repo.getMatch(match.id), updated);
    assert.equal(await repo.resumeId(), match.id);
    db.exec('DROP TRIGGER prevent_resume_delete');

    await repo.deleteMatch(match.id, updated.revision);
    assert.equal(await repo.getMatch(match.id), null);
    assert.equal(await repo.resumeId(), null);
    await repo.setResumeId(other.id);
    await repo.deleteMatch(match.id, updated.revision);
    assert.equal(await repo.resumeId(), other.id);
    assert.deepEqual((await repo.matches()).map(record => record.id), [other.id]);
    assert.deepEqual((await repo.players()).map(profile => ({ ...profile })), [player]);
  } finally { db.close(); }
});

test('Failed match creation rolls back the profile insert and leaves existing matches intact', async () => {
  const { db, repo } = await memory();
  try {
    await repo.createMatch(fixture(), player);
    const secondPlayer = { ...player, id: 'player-2', name: 'Sam' };
    const duplicate = { ...fixture(), players: [{ id: secondPlayer.id, name: secondPlayer.name }, { id: null, name: 'Opponent' }] } as MatchRecord;
    await assert.rejects(repo.createMatch(duplicate, secondPlayer));
    assert.equal((await repo.players()).length, 1);
    assert.equal((await repo.matches()).length, 1);
  } finally { db.close(); }
});

test('Backup restoration is complete, skips identical copies, and preserves conflicting local records', async () => {
  const source = await memory(); const target = await memory();
  try {
    const record = await source.repo.createMatch(fixture(), player);
    const backup = await source.repo.backup();
    assert.equal(parseBackup(backup).matches.length, 1);
    assert.equal((await target.repo.previewImport(backup)).newMatches, 1);
    await target.repo.importNew(backup);
    assert.deepEqual(await target.repo.getMatch(record.id), record);
    const repeated = await target.repo.importNew(backup);
    assert.equal(repeated.identical, 1); assert.equal(repeated.newMatches, 0);
    await target.repo.saveMatch({ ...record, group: 'Keep my correction' }, record.revision);
    const conflict = await target.repo.importNew(backup);
    assert.equal(conflict.conflicts, 1);
    assert.equal((await target.repo.getMatch(record.id))!.group, 'Keep my correction');
  } finally { source.db.close(); target.db.close(); }
});

test('A malformed or internally invalid backup writes nothing', async () => {
  const { db, repo } = await memory();
  try {
    await assert.rejects(repo.importNew('{broken'));
    const backup = { schemaVersion: 1, application: 'tennis-tracker', exportedAt: player.createdAt, players: [player], matches: [{ ...fixture(), events: [{ id: 'bad', type: 'point', input: { type: 'ending', actor: 0, ending: 'winner' } }] }] };
    await assert.rejects(repo.importNew(JSON.stringify(backup)));
    assert.equal((await repo.players()).length, 0); assert.equal((await repo.matches()).length, 0);
  } finally { db.close(); }
});

test('A database from a newer schema version is not silently modified', async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA user_version=2');
  try { await assert.rejects(new MatchRepository(adapter(db)).initialize(), /newer app version/); }
  finally { db.close(); }
});

test('Backup validation rejects impossible dates and inconsistent serve drafts', async () => {
  const { db, repo } = await memory();
  try {
    const invalidDate = fixture(); invalidDate.date = '2026-02-31';
    await assert.rejects(repo.createMatch(invalidDate, player), /match date/);
    const invalidDraft = fixture(); invalidDraft.draft.observations = { ...emptyDraft().observations, firstServe: 'in', secondServe: 'in' };
    await assert.rejects(repo.createMatch(invalidDraft, player), /Inconsistent draft/);
    assert.equal((await repo.players()).length, 0);
  } finally { db.close(); }
});

test('Reports escape notes and keep spreadsheet formula inputs as text', () => {
  const match = fixture();
  match.players[1].name = '=1+1';
  match.events = [{ id: 'a', type: 'point', input: { type: 'ending', actor: 0, ending: 'winner', stroke: 'forehand', observations: { ...emptyDraft().observations, notes: '<script>private</script>' } } }];
  const html = reportHTML(match); assert.ok(!html.includes('<script>private'));
  assert.ok(html.includes('&lt;script&gt;private&lt;/script&gt;'));
  const csv = reportCSV(match); // Opponent is not the actor in this point, so test the winner name too.
  match.players[0].name = '=1+1';
  assert.ok(reportCSV(match).includes("'=1+1")); assert.ok(csv.includes('Forehand'));
});
