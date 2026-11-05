import { parseBackup, validateMatch, validatePlayer } from './model.ts';
import type { Backup, MatchRecord, PlayerProfile } from './model.ts';

export type SQLValue = string | number | null;
export interface Database {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SQLValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, ...params: SQLValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SQLValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
export interface ImportPreview { newPlayers: number; newMatches: number; identical: number; conflicts: number }

export class MatchRepository {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly db: Database;
  constructor(db: Database) { this.db = db; }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation); this.queue = next.catch(() => {}); return next;
  }
  async initialize(): Promise<void> {
    const version = await this.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) > 1) throw new Error('These records were saved by a newer app version. Please update the app.');
    await this.db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    if ((version?.user_version ?? 0) === 0) await this.db.withTransactionAsync(async () => {
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, createdAt TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL, updatedAt TEXT NOT NULL, playerId TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS matches_by_player ON matches(playerId, updatedAt);
        CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY NOT NULL, value TEXT);
        PRAGMA user_version = 1;
      `);
    });
  }
  async players(): Promise<PlayerProfile[]> { return this.db.getAllAsync<PlayerProfile>('SELECT id, name, createdAt FROM players ORDER BY name COLLATE NOCASE'); }
  async matches(): Promise<MatchRecord[]> {
    const rows = await this.db.getAllAsync<{ payload: string }>('SELECT payload FROM matches ORDER BY updatedAt DESC');
    return rows.map(row => { const record: unknown = JSON.parse(row.payload); validateMatch(record); return record; });
  }
  async getMatch(id: string): Promise<MatchRecord | null> {
    const row = await this.db.getFirstAsync<{ payload: string }>('SELECT payload FROM matches WHERE id = ?', id);
    if (!row) return null; const record: unknown = JSON.parse(row.payload); validateMatch(record); return record;
  }
  async resumeId(): Promise<string | null> { return (await this.db.getFirstAsync<{ value: string | null }>("SELECT value FROM preferences WHERE key = 'resumeMatch'"))?.value ?? null; }
  setResumeId(id: string | null): Promise<void> {
    return this.serial(async () => { await this.db.runAsync("INSERT INTO preferences(key,value) VALUES('resumeMatch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", id); });
  }
  createMatch(record: MatchRecord, player: PlayerProfile | null): Promise<MatchRecord> {
    return this.serial(async () => {
      const saved = { ...record, revision: 1 }; validateMatch(saved);
      if (player) validatePlayer(player);
      await this.db.withTransactionAsync(async () => {
        if (player) await this.db.runAsync('INSERT INTO players(id,name,createdAt) VALUES(?,?,?)', player.id, player.name, player.createdAt);
        const owner = await this.db.getFirstAsync<{ id: string }>('SELECT id FROM players WHERE id = ?', saved.players[0].id);
        if (!owner) throw new Error('Select a saved player before starting.');
        await this.db.runAsync('INSERT INTO matches(id,revision,updatedAt,playerId,payload) VALUES(?,?,?,?,?)', saved.id, saved.revision, saved.updatedAt, saved.players[0].id, JSON.stringify(saved));
        await this.db.runAsync("INSERT INTO preferences(key,value) VALUES('resumeMatch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", saved.id);
      });
      return saved;
    });
  }
  saveMatch(record: MatchRecord, expectedRevision: number): Promise<MatchRecord> {
    return this.serial(async () => {
      const saved = { ...record, revision: expectedRevision + 1 }; validateMatch(saved);
      const result = await this.db.runAsync('UPDATE matches SET revision=?, updatedAt=?, payload=? WHERE id=? AND revision=?', saved.revision, saved.updatedAt, JSON.stringify(saved), saved.id, expectedRevision);
      if (result.changes !== 1) throw new Error('This match changed elsewhere. Reopen it before recording more points.');
      return saved;
    });
  }
  deleteMatch(id: string, expectedRevision: number): Promise<void> {
    return this.serial(() => this.db.withTransactionAsync(async () => {
      const deleted = await this.db.runAsync('DELETE FROM matches WHERE id = ? AND revision = ?', id, expectedRevision);
      if (deleted.changes === 0 && await this.db.getFirstAsync('SELECT id FROM matches WHERE id = ?', id)) {
        throw new Error('This match changed elsewhere. Reload it before deleting.');
      }
      await this.db.runAsync("DELETE FROM preferences WHERE key = 'resumeMatch' AND value = ?", id);
    }));
  }
  async backup(): Promise<string> {
    return this.serial(async () => {
      let backup: Backup | undefined;
      await this.db.withTransactionAsync(async () => {
        backup = { schemaVersion: 1, application: 'tennis-tracker', exportedAt: new Date().toISOString(), players: await this.players(), matches: await this.matches() };
      });
      return JSON.stringify(backup, null, 2);
    });
  }
  private async planImport(backup: Backup): Promise<{ players: PlayerProfile[]; matches: MatchRecord[]; preview: ImportPreview }> {
    const currentPlayers = new Map((await this.players()).map(p => [p.id, p]));
    const currentMatches = new Map((await this.matches()).map(m => [m.id, m]));
    const conflicts = new Set<string>(); const players: PlayerProfile[] = []; const matches: MatchRecord[] = [];
    let identical = 0; let conflictCount = 0;
    for (const player of backup.players) {
      const existing = currentPlayers.get(player.id);
      if (!existing) players.push(player);
      else if (existing.name !== player.name || existing.createdAt !== player.createdAt) { conflicts.add(player.id); conflictCount++; }
    }
    for (const match of backup.matches) {
      const existing = currentMatches.get(match.id);
      if (existing) {
        if (JSON.stringify({ ...existing, revision: 0 }) === JSON.stringify({ ...match, revision: 0 })) identical++;
        else conflictCount++;
      } else if (conflicts.has(match.players[0].id!)) conflictCount++;
      else matches.push(match);
    }
    return { players, matches, preview: { newPlayers: players.length, newMatches: matches.length, identical, conflicts: conflictCount } };
  }
  async previewImport(text: string): Promise<ImportPreview> { return (await this.planImport(parseBackup(text))).preview; }
  importNew(text: string): Promise<ImportPreview> {
    return this.serial(async () => {
      const backup = parseBackup(text); let preview: ImportPreview | undefined;
      await this.db.withTransactionAsync(async () => {
        const plan = await this.planImport(backup); preview = plan.preview;
        for (const p of plan.players) await this.db.runAsync('INSERT INTO players(id,name,createdAt) VALUES(?,?,?)', p.id, p.name, p.createdAt);
        for (const match of plan.matches) {
          const saved = { ...match, revision: 1 };
          await this.db.runAsync('INSERT INTO matches(id,revision,updatedAt,playerId,payload) VALUES(?,?,?,?,?)', saved.id, 1, saved.updatedAt, saved.players[0].id, JSON.stringify(saved));
        }
      });
      return preview!;
    });
  }
}
