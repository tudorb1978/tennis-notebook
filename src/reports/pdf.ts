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

export interface ReportFonts { regular: Uint8Array; bold: Uint8Array }
type TextRole = 'title' | 'lead' | 'heading' | 'subheading' | 'body' | 'caption';
type TextBlock = readonly [text: string, role: TextRole, gapAfter?: number];

interface ReportWriter {
  group: (blocks: readonly TextBlock[]) => void;
  summary: (lead: string, details: readonly string[]) => void;
  playerTable: (name: string, stats: PlayerStats) => void;
  matchNotes: (notes: string) => void;
  notesSummary: (summary: ReturnType<typeof pointNoteSummary>) => void;
  pointNote: (details: readonly TextBlock[], notes: string, intro?: readonly TextBlock[]) => void;
}

/** Generate on-device without a WebView, remote service, or system print renderer. */
async function createReportPDF(title: string, kind: string, fonts: ReportFonts, render: (writer: ReportWriter) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const regularCharacters = new Set(regular.getCharacterSet());
  const boldCharacters = new Set(bold.getCharacterSet());
  const court = rgb(.08, .22, .17);
  const ink = rgb(.10, .18, .14);
  const muted = rgb(.29, .38, .33);
  const line = rgb(.82, .87, .83);
  const soft = rgb(.92, .95, .90);
  const stripe = rgb(.97, .98, .97);
  const white = rgb(1, 1, 1);
  const lime = rgb(.88, .95, .68);
  const styles = {
    title: { font: bold, color: court, size: 25, leading: 31 },
    lead: { font: bold, color: court, size: 19, leading: 24 },
    heading: { font: bold, color: court, size: 14, leading: 19 },
    subheading: { font: bold, color: ink, size: 10.5, leading: 15 },
    body: { font: regular, color: ink, size: 10, leading: 15 },
    caption: { font: regular, color: muted, size: 9, leading: 13 },
  };
  const width = 595.28, height = 841.89, left = 44, contentWidth = width - left * 2;
  const top = height - 72, bottom = 52;
  let page: PDFPage, y = 0;

  function rule(target: PDFPage, at: number) {
    target.drawLine({ start: { x: left, y: at }, end: { x: width - left, y: at }, thickness: .6, color: line });
  }
  function newPage() {
    page = doc.addPage([width, height]);
    const headerY = height - 45;
    page.drawRectangle({ x: left, y: headerY - 1, width: 9, height: 9, color: lime });
    page.drawText('TENNIS NOTEBOOK', { x: left + 15, y: headerY, size: 9, font: bold, color: court });
    page.drawText(kind, { x: width - left - bold.widthOfTextAtSize(kind, 8), y: headerY, size: 8, font: bold, color: muted });
    rule(page, headerY - 12);
    y = top;
  }
  function ensure(space: number) {
    if (space <= top - bottom && y - space < bottom) newPage();
  }
  function layout([value, role, gap = 0]: TextBlock, maxWidth = contentWidth) {
    const text = value.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\t/g, ' ').replace(/\r/g, '');
    const characters = [...text].filter(c => c !== '\n').map(c => c.codePointAt(0)!);
    if (characters.some(c => !regularCharacters.has(c))) {
      throw new Error('This report contains a character the bundled font cannot display. A records backup preserves the original text.');
    }
    const { font: preferredFont, color, size, leading } = styles[role];
    const font = preferredFont === bold && characters.some(c => !boldCharacters.has(c)) ? regular : preferredFont;
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          if (current) { lines.push(current); current = ''; }
          for (const c of word) {
            if (font.widthOfTextAtSize(current + c, size) > maxWidth) { lines.push(current); current = c; }
            else current += c;
          }
        } else if (!current || font.widthOfTextAtSize(current + ' ' + word, size) <= maxWidth) {
          current += (current ? ' ' : '') + word;
        } else { lines.push(current); current = word; }
      }
      lines.push(current);
    }
    return { lines, font, color, size, leading, gap, height: lines.length * leading + gap };
  }
  function draw(block: ReturnType<typeof layout>, x = left) {
    const { lines, font, color, size, leading, gap } = block;
    for (const text of lines) {
      ensure(leading);
      if (text) page.drawText(text, { x, y: y - size, font, size, color });
      y -= leading;
    }
    y -= gap;
  }
  function group(parts: readonly TextBlock[]) {
    const blocks = parts.map(part => layout(part));
    ensure(blocks.reduce((space, block) => space + block.height, 0));
    blocks.forEach(block => draw(block));
  }
  function summary(lead: string, details: readonly string[]) {
    const inset = 13;
    const blocks = [
      layout([lead, 'lead', 3], contentWidth - inset * 2),
      ...details.map(detail => layout([detail, 'caption'], contentWidth - inset * 2)),
    ];
    const panelHeight = blocks.reduce((space, block) => space + block.height, 22);
    if (panelHeight > top - bottom) {
      group([[lead, 'lead', 3], ...details.map((detail): TextBlock => [detail, 'caption', 3])]);
      return;
    }
    ensure(panelHeight);
    page.drawRectangle({ x: left, y: y - panelHeight, width: contentWidth, height: panelHeight, color: soft });
    page.drawRectangle({ x: left, y: y - panelHeight, width: 2, height: panelHeight, color: court });
    y -= 11;
    blocks.forEach(block => draw(block, left + inset));
    y -= 27;
  }
  function playerTable(name: string, player: PlayerStats) {
    const title = layout([name, 'heading', 7]);
    const totals = layout([`Points won ${player.pointsWon}  ·  Aces ${player.aces}  ·  Double faults ${player.doubleFaults}`, 'subheading', 2]);
    const serving = layout([`First serves in ${player.firstServesIn}/${player.firstServesObserved}  ·  Second serves in ${player.secondServesIn}/${player.secondServesObserved}  ·  Returns in ${player.returnsIn}/${player.returnsObserved} (observed)`, 'caption', 16]);
    const rowHeight = 18;
    ensure(title.height + (strokes.length + 2) * rowHeight + 8 + totals.height + serving.height - serving.gap);
    draw(title);
    const numericWidth = (contentWidth - 173) / 3;
    const widths = [173, numericWidth, numericWidth, numericWidth];
    function row(cells: readonly (number | string)[], tone: 'header' | 'plain' | 'stripe' | 'total') {
      const fill = { header: court, plain: white, stripe, total: soft }[tone];
      const color = tone === 'header' ? white : ink;
      const font = tone === 'header' || tone === 'total' ? bold : regular;
      page.drawRectangle({ x: left, y: y - rowHeight, width: contentWidth, height: rowHeight, color: fill });
      let x = left;
      for (const [index, cell] of cells.entries()) {
        const text = String(cell);
        const size = 9;
        const cellWidth = widths[index]!;
        page.drawText(text, { x: index === 0 ? x + 10 : x + (cellWidth - font.widthOfTextAtSize(text, size)) / 2, y: y - 12, font, size, color });
        x += cellWidth;
      }
      y -= rowHeight;
      rule(page, y);
    }
    row(['Stroke', 'Winners', 'Unforced errors', 'Forced errors'], 'header');
    const totalsByType = [0, 0, 0];
    for (const [index, stroke] of strokes.entries()) {
      const stats = player.byStroke[stroke];
      const values = [stats.winners, stats.unforcedErrors, stats.forcedErrors];
      values.forEach((n, i) => { totalsByType[i] = totalsByType[i]! + n; });
      row([strokeNames[stroke], ...values], index % 2 === 0 ? 'plain' : 'stripe');
    }
    row(['Total', ...totalsByType], 'total');
    y -= 8;
    draw(totals);
    draw(serving);
  }
  function notesSummary(summary: ReturnType<typeof pointNoteSummary>) {
    for (const [index, section] of summary.entries()) {
      const blocks: TextBlock[] = index === 0
        ? [['Point notes summary', 'heading', 4], ['Counts are based on observations recorded during the match.', 'caption', 10]]
        : [];
      blocks.push([section.title, 'subheading', 3], ...section.lines.map((text): TextBlock => [text, 'body', 2]));
      group(blocks);
      y -= 8;
    }
  }
  function matchNotes(notes: string) {
    const title = layout(['Match notes', 'heading', 5]);
    const body = layout([notes, 'body', 14]);
    ensure(title.height + body.leading);
    draw(title);
    draw(body);
  }
  function pointNote(details: readonly TextBlock[], notes: string, intro: readonly TextBlock[] = []) {
    const introduction = intro.map(part => layout(part));
    const blocks = details.map(part => layout(part));
    const body = notes ? layout([notes, 'body', 4]) : null;
    ensure([...introduction, ...blocks].reduce((space, block) => space + block.height, 9 + (body?.leading ?? 0)));
    introduction.forEach(block => draw(block));
    rule(page, y);
    y -= 9;
    blocks.forEach(block => draw(block));
    if (body) draw(body);
    y -= 9;
  }

  doc.setTitle(title);
  doc.setCreator('Tennis Notebook');
  doc.setProducer('Tennis Notebook');
  newPage();
  render({ group, summary, playerTable, matchNotes, notesSummary, pointNote });
  for (const [index, item] of doc.getPages().entries()) {
    const number = `Page ${index + 1} of ${doc.getPageCount()}`;
    rule(item, 39);
    item.drawText(number, { x: width - left - regular.widthOfTextAtSize(number, 8), y: 24, size: 8, font: regular, color: muted });
  }
  return doc.save();
}

export function createMatchPDF(record: MatchRecord, fonts: ReportFonts): Promise<Uint8Array> {
  const title = `${record.players[0].name} vs ${record.players[1].name}`;
  return createReportPDF(title, 'MATCH REPORT', fonts, ({ group, summary, playerTable, matchNotes, notesSummary, pointNote }) => {
    const { score, stats, points, pointEntries, hasScoreCorrections, timing } = replayMatch(record.format, record.firstServer, record.events, record.timingStartedAt);
    const metadata = [record.date, record.group, record.round, record.venue, record.surface, record.courtSetting, record.conditions].filter(Boolean).join(' · ');
    group([[title, 'title', 5], [metadata, 'body', 14]]);
    const status = score.winner !== null ? `${record.players[score.winner].name} wins${score.status === 'retired' ? ' by retirement' : ''}` : score.status === 'abandoned' ? 'Abandoned without a winner' : score.status === 'suspended' ? 'Match paused' : 'In progress';
    const times = timingLabels(timing);
    summary(resultLabel(score), [`${status} · ${record.format.name}`, ...(times.length ? [times.join(' · ')] : [])]);
    for (const side of [0, 1] as const) playerTable(record.players[side].name, stats.players[side]);
    const coverage: TextBlock[] = [[`Aces count as serve winners. Double faults are separate. Endings recorded ${stats.coverage.endings}/${stats.coverage.points} · Strokes recorded ${stats.coverage.strokes}/${stats.coverage.endings} classified endings.`, 'caption', 8]];
    if (hasScoreCorrections) coverage.push(['The score includes manual corrections. Statistics use observed points only.', 'caption', 8]);
    group(coverage);
    const notes = record.matchNotes?.trim();
    if (notes) matchNotes(notes);
    const names = [record.players[0].name, record.players[1].name] as const;
    notesSummary(pointNoteSummary(points, names));
    const notable = pointEntries.map(({ point }, index) => ({ point, number: index + 1 })).filter(p => hasPointNotes(p.point.observations));
    for (const [index, { point, number }] of notable.entries()) {
      const observations = point.observations!;
      const details: TextBlock[] = [
        [`${number}. ${pointScoreBefore(point)}`, 'caption', 2],
        [`${names[point.winner]} won`, 'subheading'],
        [pointEndingLabel(point, names), 'body', 3],
      ];
      const labels = pointNoteLabels(observations, names);
      if (labels.length) details.push([labels.join(' · '), 'caption', 4]);
      pointNote(details, observations.notes, index === 0 ? [
        ['Notes and notable points', 'heading', 4],
        [`Scores list ${names[0]} first and ${names[1]} second.`, 'caption', 8],
      ] : undefined);
    }
  });
}

export function createPlayerPerformancePDF(report: PlayerPerformanceReport, fonts: ReportFonts): Promise<Uint8Array> {
  return createReportPDF(`Player performance · ${report.name}`, 'PLAYER PERFORMANCE', fonts, ({ group, summary, playerTable, notesSummary }) => {
    group([[report.name, 'title', 5], [report.scope, 'body', 14]]);
    const [volume, result] = performanceCountLabels(report);
    summary(volume, [result]);
    playerTable('Stroke breakdown', report.stats);
    if (report.hasScoreCorrections) group([['Some matches contain score corrections. Statistics use recorded observations only.', 'caption', 10]]);
    notesSummary(report.noteSummary);
  });
}
