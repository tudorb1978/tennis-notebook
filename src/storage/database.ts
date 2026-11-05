import * as SQLite from 'expo-sqlite';
import { MatchRepository } from './repository.ts';

let repository: Promise<MatchRepository> | undefined;
export function openRepository(): Promise<MatchRepository> {
  repository ??= (async () => {
    const db = await SQLite.openDatabaseAsync('tennis-tracker.db');
    const repo = new MatchRepository(db);
    await repo.initialize();
    return repo;
  })().catch(error => { repository = undefined; throw error; });
  return repository;
}
