import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { createMatchPDF } from '../../src/reports/pdf.ts';
import { presets } from '../../src/domain/presets.ts';
import { emptyDraft } from '../../src/storage/model.ts';
import type { MatchRecord } from '../../src/storage/model.ts';
const font = new Uint8Array(await readFile(new URL('../../assets/DejaVuSans.ttf', import.meta.url)));
function fixture(): MatchRecord {
  return { schemaVersion: 1, id: 'pdf-test', revision: 1, createdAt: '2026-11-04T12:00:00Z', updatedAt: '2026-11-04T12:00:00Z', players: [{ id: 'p1', name: 'Ștefan' }, { id: null, name: 'Émilie' }], date: '2026-11-04', group: 'Practice', round: '', venue: '', surface: 'Hard', conditions: '', format: presets['fast4-match-tiebreak'], firstServer: 0, mode: 'endings', events: [], draft: emptyDraft() };
}
test('A local PDF embeds the font, preserves Unicode names, and has valid A4 pages', async () => {
  const bytes = await createMatchPDF(fixture(), font);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getTitle(), 'Ștefan vs Émilie');
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(bytes.length > 5000);
  assert.ok(Math.abs(pdf.getPages()[0]!.getWidth() - 595.28) < .01);
});
test('Long point notes paginate into a valid report without a native print renderer', async () => {
  const match = fixture();
  match.events = Array.from({ length: 20 }, (_, i) => ({ id: `point-${i}`, type: 'point' as const, input: { type: 'winner-only' as const, winner: 0 as const, observations: { ...emptyDraft().observations, notes: 'Backhand depth under pressure. '.repeat(30) } } }));
  const pdf = await PDFDocument.load(await createMatchPDF(match, font));
  assert.ok(pdf.getPageCount() > 2);
});
test('Unsupported font characters fail explicitly rather than losing player names', async () => {
  const match = fixture(); match.players[0].name = '\u{10FFFF}';
  await assert.rejects(createMatchPDF(match, font), /font cannot display/);
});
