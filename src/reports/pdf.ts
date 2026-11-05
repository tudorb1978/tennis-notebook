import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { replayMatch } from '../domain/history.ts';
import { strokes } from '../domain/points.ts';
import type { PlayerStats } from '../domain/points.ts';
import { hasPointNotes } from '../domain/pointNotes.ts';
import { pointNoteLabels, pointNoteSummary } from './pointNotes.ts';
import { pointEndingLabel, pointScoreBefore, resultLabel, strokeNames, timingLabels } from './report.ts';
import { performanceCountLabels } from './playerPerformance.ts';
import type { PlayerPerformanceReport } from './playerPerformance.ts';
import type { MatchRecord } from '../storage/model.ts';

/** Generate on-device without a WebView, remote service, or system print renderer. */
async function createReportPDF(title: string, fontBytes: Uint8Array, render: (writer: {
  paragraph: (value: string, size?: number, secondary?: boolean, gap?: number) => void;
  heading: (value: string, size?: number, spaceBefore?: number) => void;
  ensure: (space: number) => void;
  playerTable: (name: string, stats: PlayerStats) => void;
  notesSummary: (summary: ReturnType<typeof pointNoteSummary>) => void;
}) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const supported = new Set(font.getCharacterSet());
  const ink = rgb(.09, .18, .14), sub = rgb(.32, .41, .35), line = rgb(.80, .86, .81), soft = rgb(.92, .95, .90);
  const width = 595.28, height = 841.89, left = 44, contentWidth = width - left * 2;
  let page: PDFPage, y = 0;
  const normalized = (value: string) => value.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\t/g, ' ').replace(/\r/g, '');
  const check = (text: string) => {
    if ([...text].some(c => c !== '\n' && !supported.has(c.codePointAt(0)!))) throw new Error('This report contains a character the bundled font cannot display. A records backup preserves the original text.');
  };
  function newPage() { page = doc.addPage([width, height]); y = height - 44; page.drawText('TENNIS NOTEBOOK', { x: left, y, size: 8, font, color: sub }); y -= 24; }
  function ensure(space: number) { if (y - space < 48) newPage(); }
  function wrapped(value: string, size: number, maxWidth: number): string[] {
    const text = normalized(value); check(text); const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          if (current) { lines.push(current); current = ''; }
          for (const c of word) {
            if (font.widthOfTextAtSize(current + c, size) > maxWidth) { lines.push(current); current = c; } else current += c;
          }
        } else if (!current || font.widthOfTextAtSize(current + ' ' + word, size) <= maxWidth) current += (current ? ' ' : '') + word;
        else { lines.push(current); current = word; }
      }
      lines.push(current);
    }
    return lines;
  }
  function paragraph(value: string, size = 10, secondary = false, gap = 7) {
    for (const text of wrapped(value, size, contentWidth)) {
      ensure(size * 1.5); page.drawText(text, { x: left, y, font, size, color: secondary ? sub : ink }); y -= size * 1.4;
    }
    y -= gap;
  }
  function heading(value: string, size = 15, spaceBefore = 0) {
    ensure(45 + spaceBefore); y -= spaceBefore;
    paragraph(value, size, false, 7);
  }
  function playerTable(name: string, player: PlayerStats) {
    ensure(275); heading(name);
    const widths = [180, (contentWidth - 180) / 3, (contentWidth - 180) / 3, (contentWidth - 180) / 3];
    const tableRow = (label: string, values: readonly (number | string)[], highlight = false) => {
      ensure(22);
      if (highlight) page.drawRectangle({ x: left, y: y - 6, width: contentWidth, height: 21, color: soft });
      let x = left;
      for (const [index, cell] of [label, ...values].entries()) {
        const text = normalized(String(cell)); check(text); const size = index === 0 ? 10 : 9;
        const cellWidth = widths[index]!;
        page.drawText(text, { x: index === 0 ? x + 5 : x + (cellWidth - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color: ink });
        x += cellWidth;
      }
      page.drawLine({ start: { x: left, y: y - 7 }, end: { x: left + contentWidth, y: y - 7 }, thickness: .5, color: line }); y -= 21;
    };
    tableRow('Stroke', ['Winners', 'Unforced errors', 'Forced errors'], true);
    const total = [0, 0, 0];
    for (const stroke of strokes) {
      const s = player.byStroke[stroke]; const values = [s.winners, s.unforcedErrors, s.forcedErrors];
      values.forEach((n, i) => { total[i] = total[i]! + n; }); tableRow(strokeNames[stroke], values);
    }
    tableRow('Total', total, true); y -= 5;
    paragraph(`Points won: ${player.pointsWon} | Aces: ${player.aces} | Double faults: ${player.doubleFaults}`, 9, true, 2);
    paragraph(`First serves in: ${player.firstServesIn}/${player.firstServesObserved} | Second serves in: ${player.secondServesIn}/${player.secondServesObserved} | Returns in: ${player.returnsIn}/${player.returnsObserved} (observed)`, 8.5, true, 12);
  }
  function notesSummary(summary: ReturnType<typeof pointNoteSummary>) {
    if (!summary.length) return;
    heading('Point notes summary');
    paragraph('Counts are based on observations recorded during the match.', 9, true);
    for (const section of summary) {
      heading(section.title, 11);
      for (const line of section.lines) paragraph(line, 9, false, 1);
    }
  }
  doc.setTitle(title); doc.setCreator('Tennis Notebook'); doc.setProducer('Tennis Notebook');
  newPage();
  render({ paragraph, heading, ensure, playerTable, notesSummary });
  for (const [index, item] of doc.getPages().entries()) {
    item.drawText(`${index + 1} / ${doc.getPageCount()}`, { x: width - left - 35, y: 24, size: 8, font, color: sub });
  }
  return doc.save();
}

export function createMatchPDF(record: MatchRecord, fontBytes: Uint8Array): Promise<Uint8Array> {
  const title = `${record.players[0].name} vs ${record.players[1].name}`;
  return createReportPDF(title, fontBytes, ({ paragraph, heading, ensure, playerTable, notesSummary }) => {
    const { score, stats, points, pointEntries, hasScoreCorrections, timing } = replayMatch(record.format, record.firstServer, record.events, record.timingStartedAt);
    paragraph(`${record.players[0].name} vs ${record.players[1].name}`, 20);
    paragraph([record.date, record.group, record.round, record.venue, record.surface, record.courtSetting, record.conditions].filter(Boolean).join(' | '), 9, true);
    paragraph(resultLabel(score), 19);
    const status = score.winner !== null ? `${record.players[score.winner].name} wins${score.status === 'retired' ? ' by retirement' : ''}` : score.status === 'abandoned' ? 'Abandoned without a winner' : score.status === 'suspended' ? 'Match paused' : 'In progress';
    paragraph(`${status} | ${record.format.name}`, 9, true, 12);
    const times = timingLabels(timing);
    if (times.length) paragraph(times.join(' | '), 9, true);
    for (const side of [0, 1] as const) playerTable(record.players[side].name, stats.players[side]);
    paragraph(`Aces count as serve winners; double faults are separate. Endings recorded: ${stats.coverage.endings}/${stats.coverage.points}. Stroke recorded: ${stats.coverage.strokes}/${stats.coverage.endings} classified endings.`, 9, true);
    if (hasScoreCorrections) paragraph('The score includes manual corrections. Statistics use observed points only.', 9, true);
    const matchNotes = record.matchNotes?.trim();
    if (matchNotes) {
      heading('Match notes');
      paragraph(matchNotes, 10, false, 14);
    }
    const names = [record.players[0].name, record.players[1].name] as const;
    notesSummary(pointNoteSummary(points, names));
    const notable = pointEntries.map((entry, index) => ({ ...entry, number: index + 1 })).filter(p => hasPointNotes(p.point.observations));
    if (notable.length) {
      ensure(120);
      heading('Notes and notable points', 15, 10);
      paragraph(`Scores list ${names[0]} first and ${names[1]} second.`, 9, true);
      for (const entry of notable) {
        const p = entry.point, obs = p.observations!;
        ensure(65);
        paragraph(`${entry.number}. ${pointScoreBefore(p)}`, 9, true, 2);
        paragraph(`${names[p.winner]} won`, 11, false, 2);
        paragraph(pointEndingLabel(p, names), 10, false, 3);
        const labels = pointNoteLabels(obs, names);
        if (labels.length) paragraph(labels.join(' | '), 9, true, 3);
        if (obs.notes) paragraph(obs.notes, 10);
      }
    }
  });
}

export function createPlayerPerformancePDF(report: PlayerPerformanceReport, fontBytes: Uint8Array): Promise<Uint8Array> {
  return createReportPDF(`Player performance · ${report.name}`, fontBytes, ({ paragraph, playerTable, notesSummary }) => {
    paragraph('Player performance', 20);
    paragraph(report.scope, 10, true);
    for (const line of performanceCountLabels(report)) paragraph(line, 10, true, 3);
    playerTable(report.name, report.stats);
    if (report.hasScoreCorrections) paragraph('Some matches contain score corrections. Statistics use recorded observations only.', 9, true);
    notesSummary(report.noteSummary);
  });
}
