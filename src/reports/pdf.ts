import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { strokes } from '../domain/points.ts';
import type { PlayerStats } from '../domain/points.ts';
import { pointNoteSummary } from './pointNotes.ts';
import { buildPointByPoint } from './pointByPoint.ts';
import { pressurePointExplanation, pressurePointGroups, replayMatchForReport, resultParts, strokeNames, timingLabels } from './report.ts';
import type { ResultPart } from './report.ts';
import { performanceCountLabels } from './playerPerformance.ts';
import type { PlayerPerformanceReport } from './playerPerformance.ts';
import type { MatchRecord } from '../storage/model.ts';

export interface ReportFonts { regular: Uint8Array; bold: Uint8Array }
export type MatchPDFVariant = 'summary' | 'point-by-point' | 'combined';
type TextRole = 'title' | 'lead' | 'heading' | 'subheading' | 'body' | 'caption' | 'tableHeader' | 'tableBody' | 'tableTotal'
  | 'positive' | 'negative' | 'rally';
type TextBlock = readonly [text: string, role: TextRole, gapAfter?: number];
type RowTone = 'header' | 'labels' | 'plain' | 'stripe' | 'total';

interface ReportWriter {
  group: (blocks: readonly TextBlock[]) => void;
  summary: (lead: string | readonly ResultPart[], details: readonly string[]) => void;
  playerTable: (name: string, stats: PlayerStats) => void;
  statsTable: (title: string, names: readonly [string, string], stats: readonly [PlayerStats, PlayerStats], includeStrokeTotals: boolean) => void;
  strokeTable: (names: readonly [string, string], stats: readonly [PlayerStats, PlayerStats]) => void;
  pressurePoints: (names: readonly string[], stats: readonly PlayerStats[]) => void;
  matchNotes: (notes: string) => void;
  notesSummary: (summary: ReturnType<typeof pointNoteSummary>) => void;
  pointNote: (details: readonly TextBlock[], notes: string, intro?: readonly TextBlock[]) => void;
}

function observedRate(inPlay: number, observed: number) {
  return observed ? `${Math.round(inPlay / observed * 100)}% (${inPlay}/${observed})` : 'Not recorded';
}

function strokeTotals(player: PlayerStats) {
  return strokes.reduce<[number, number, number]>(([winners, unforced, forced], stroke) => {
    const counts = player.byStroke[stroke];
    return [winners + counts.winners, unforced + counts.unforcedErrors, forced + counts.forcedErrors];
  }, [0, 0, 0]);
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
  const playerFills = [
    { labels: rgb(.88, .93, .84), plain: rgb(.96, .98, .94), stripe: rgb(.93, .96, .90), total: rgb(.88, .93, .84) },
    { labels: rgb(.87, .92, .95), plain: rgb(.95, .97, .99), stripe: rgb(.92, .95, .97), total: rgb(.87, .92, .95) },
  ];
  const styles = {
    title: { font: bold, color: court, size: 25, leading: 31 },
    lead: { font: bold, color: court, size: 19, leading: 24 },
    heading: { font: bold, color: court, size: 14, leading: 19 },
    subheading: { font: bold, color: ink, size: 10.5, leading: 15 },
    body: { font: regular, color: ink, size: 10, leading: 15 },
    caption: { font: regular, color: muted, size: 9, leading: 13 },
    tableHeader: { font: bold, color: white, size: 9, leading: 13 },
    tableBody: { font: regular, color: ink, size: 9, leading: 13 },
    tableTotal: { font: bold, color: ink, size: 9, leading: 13 },
    positive: { font: bold, color: rgb(.13, .36, .20), size: 9, leading: 13 },
    negative: { font: bold, color: rgb(.58, .21, .16), size: 9, leading: 13 },
    rally: { font: bold, color: rgb(.15, .32, .56), size: 9, leading: 13 },
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
  function layoutResult(parts: readonly ResultPart[], maxWidth: number) {
    const { font, size, color, leading } = styles.lead;
    const smallSize = 12;
    const gap = 12;
    let line = 0, offset = 0;
    const cells = parts.map(({ score, setTieBreak }) => {
      const text = score.replace(/–/g, '-');
      const mainWidth = font.widthOfTextAtSize(text, size);
      const cellWidth = mainWidth + font.widthOfTextAtSize(setTieBreak, smallSize);
      if (offset && offset + cellWidth > maxWidth) { line++; offset = 0; }
      const cell = { text, setTieBreak, mainWidth, line, offset };
      offset += cellWidth + gap;
      return cell;
    });
    return {
      height: (line + 1) * leading + 3,
      draw(x: number) {
        let currentLine = -1;
        for (const cell of cells) {
          if (cell.line !== currentLine) {
            if (currentLine >= 0) y -= leading;
            ensure(leading);
            currentLine = cell.line;
          }
          const left = x + cell.offset;
          const baseline = y - size;
          page.drawText(cell.text, { x: left, y: baseline, font, size, color });
          if (cell.setTieBreak) page.drawText(cell.setTieBreak, { x: left + cell.mainWidth, y: baseline, font, size: smallSize, color });
        }
        y -= leading + 3;
      },
    };
  }
  function summary(lead: string | readonly ResultPart[], details: readonly string[]) {
    const inset = 13;
    const maxWidth = contentWidth - inset * 2;
    const plainLead = typeof lead === 'string' ? layout([lead, 'lead', 3], maxWidth) : null;
    const resultLead = typeof lead === 'string' ? null : layoutResult(lead, maxWidth);
    const blocks = details.map(detail => layout([detail, 'caption'], maxWidth));
    const panelHeight = blocks.reduce((space, block) => space + block.height, 22 + (plainLead?.height ?? resultLead?.height ?? 0));
    const drawLead = (x: number) => plainLead ? draw(plainLead, x) : resultLead?.draw(x);
    if (panelHeight > top - bottom) {
      drawLead(left);
      blocks.forEach(block => draw(block));
      return;
    }
    ensure(panelHeight);
    page.drawRectangle({ x: left, y: y - panelHeight, width: contentWidth, height: panelHeight, color: soft });
    page.drawRectangle({ x: left, y: y - panelHeight, width: 2, height: panelHeight, color: court });
    y -= 11;
    drawLead(left + inset);
    blocks.forEach(block => draw(block, left + inset));
    y -= 27;
  }
  function tableRow(cells: readonly (number | string)[], widths: readonly number[], tone: RowTone, padding = 10) {
    const role = tone === 'header' ? 'tableHeader' : tone === 'total' || tone === 'labels' ? 'tableTotal' : 'tableBody';
    const blocks = cells.map((cell, i) => layout([String(cell), role], widths[i]! - 2 * padding));
    const height = Math.max(...blocks.map(block => block.height)) + 5;
    return { blocks, widths, tone, height, padding };
  }
  function drawTableRow({ blocks, widths, tone, height, padding }: ReturnType<typeof tableRow>, players?: readonly (number | null)[]) {
    const fill = { header: court, labels: soft, plain: white, stripe, total: soft }[tone];
    let x = left;
    for (const [index, block] of blocks.entries()) {
      const { lines, font, size, color, leading } = block;
      const cellWidth = widths[index]!;
      const player = players?.[index];
      const tint = tone !== 'header' && player != null ? playerFills[player]?.[tone] : undefined;
      page.drawRectangle({ x, y: y - height, width: cellWidth, height, color: tint ?? fill });
      if (players && index > 0) {
        const groupBoundary = player !== players[index - 1];
        page.drawLine({ start: { x, y }, end: { x, y: y - height }, thickness: groupBoundary ? .8 : .4, color: line });
      }
      let baseline = y - (height - block.height) / 2 - size;
      for (const text of lines) {
        if (text) page.drawText(text, { x: index === 0 ? x + padding : x + (cellWidth - font.widthOfTextAtSize(text, size)) / 2, y: baseline, font, size, color });
        baseline -= leading;
      }
      x += cellWidth;
    }
    y -= height;
    rule(page, y);
  }
  function playerTable(name: string, player: PlayerStats) {
    const title = layout([name, 'heading', 7]);
    const totals = layout([`Points won ${player.pointsWon}  ·  Aces ${player.aces}  ·  Double faults ${player.doubleFaults}`, 'subheading', 2]);
    const serving = layout([`First serves in ${observedRate(player.firstServesIn, player.firstServesObserved)} · Second serves in ${observedRate(player.secondServesIn, player.secondServesObserved)} · Returns in ${observedRate(player.returnsIn, player.returnsObserved)}`, 'caption', 16]);
    const numericWidth = (contentWidth - 173) / 3;
    const widths = [173, numericWidth, numericWidth, numericWidth];
    const rows = [tableRow(['Stroke', 'Winners', 'Unforced errors', 'Forced errors'], widths, 'header')];
    const totalsByType = [0, 0, 0];
    for (const [index, stroke] of strokes.entries()) {
      const stats = player.byStroke[stroke];
      const values = [stats.winners, stats.unforcedErrors, stats.forcedErrors];
      values.forEach((n, i) => { totalsByType[i] = totalsByType[i]! + n; });
      rows.push(tableRow([strokeNames[stroke], ...values], widths, index % 2 === 0 ? 'plain' : 'stripe'));
    }
    rows.push(tableRow(['Total', ...totalsByType], widths, 'total'));
    ensure(rows.reduce((space, row) => space + row.height, title.height + 8 + totals.height + serving.height - serving.gap));
    draw(title);
    const playerColumns = [null, 0, 0, 0];
    rows.forEach(row => drawTableRow(row, playerColumns));
    y -= 8;
    draw(totals);
    draw(serving);
  }
  function comparisonTable(heading: string, firstColumn: string, names: readonly [string, string], rows: readonly (readonly (string | number)[])[]) {
    const title = layout([heading, 'heading', 5]);
    const widths = [150, (contentWidth - 150) / 2, (contentWidth - 150) / 2];
    const table = [tableRow([firstColumn, ...names], widths, 'header'),
      ...rows.map((row, index) => tableRow(row, widths, index % 2 ? 'stripe' : 'plain'))];
    ensure(title.height + table.reduce((sum, row) => sum + row.height, 0));
    draw(title);
    const playerColumns = [null, 0, 1];
    table.forEach(row => drawTableRow(row, playerColumns));
    y -= 13;
  }
  function groupedTable(heading: string, firstColumn: string, names: readonly string[], columns: readonly string[],
    rows: readonly (readonly (string | number)[])[], options: { bands?: readonly string[]; detail?: string; total?: boolean } = {}) {
    const title = layout([heading, 'heading', 5]);
    const caption = options.detail ? layout([options.detail, 'caption', 7]) : null;
    const labelWidth = 113;
    const playerWidth = (contentWidth - labelWidth) / names.length;
    const numberWidth = playerWidth / columns.length;
    const widths = [labelWidth, ...names.flatMap(() => columns.map(() => numberWidth))];
    const players = [null, ...names.flatMap((_, index) => columns.map(() => index))];
    const header = tableRow([firstColumn, ...names], [labelWidth, ...names.map(() => playerWidth)], 'header');
    const labels = tableRow(['', ...names.flatMap(() => columns)], widths, 'labels', 6);
    const bands = options.bands ?? [];
    const bandRow = bands.length ? tableRow(['', ...names.flatMap(() => bands)],
      [labelWidth, ...names.flatMap(() => bands.map(() => playerWidth / bands.length))], 'labels', 6) : null;
    const body = rows.map((row, index) => tableRow(row, widths,
      options.total && index === rows.length - 1 ? 'total' : index % 2 ? 'stripe' : 'plain', 6));
    const tableHeight = [header, labels, ...body].reduce((sum, row) => sum + row.height, bandRow?.height ?? 0);
    ensure(title.height + (caption?.height ?? 0) + tableHeight);
    draw(title);
    if (caption) draw(caption);
    drawTableRow(header, [null, ...names.map((_, index) => index)]);
    if (bandRow) drawTableRow(bandRow, [null, ...names.flatMap((_, index) => bands.map(() => index))]);
    drawTableRow(labels, players);
    body.forEach(row => drawTableRow(row, players));
    y -= 13;
  }
  function statsTable(title: string, names: readonly [string, string], stats: readonly [PlayerStats, PlayerStats], includeStrokeTotals: boolean) {
    const rows: (string | number)[][] = [
      ['Points won', ...stats.map(player => player.pointsWon)],
      ['Aces', ...stats.map(player => player.aces)],
      ['Double faults', ...stats.map(player => player.doubleFaults)],
      ['First serves in', ...stats.map(player => observedRate(player.firstServesIn, player.firstServesObserved))],
      ['Second serves in', ...stats.map(player => observedRate(player.secondServesIn, player.secondServesObserved))],
      ['Returns in', ...stats.map(player => observedRate(player.returnsIn, player.returnsObserved))],
    ];
    if (includeStrokeTotals) {
      const totals = stats.map(strokeTotals);
      ['Winners', 'Unforced errors', 'Forced errors'].forEach((label, index) => rows.push([label, ...totals.map(counts => counts[index] ?? 0)]));
    }
    comparisonTable(title, 'Metric', names, rows);
  }
  function strokeTable(names: readonly [string, string], stats: readonly [PlayerStats, PlayerStats]) {
    const rows = strokes.filter(stroke => stats.some(player =>
      Object.values(player.byStroke[stroke]).some(Boolean))).map(stroke => [
      strokeNames[stroke], ...stats.flatMap(player => {
        const { winners, unforcedErrors, forcedErrors } = player.byStroke[stroke];
        return [winners, unforcedErrors, forcedErrors];
      }),
    ]);
    rows.push(['Total', ...stats.flatMap(strokeTotals)]);
    groupedTable('Shot breakdown', 'Stroke', names, ['Winners', 'Unforced\nerrors', 'Forced\nerrors'], rows, { total: true });
  }
  function pressurePoints(names: readonly string[], stats: readonly PlayerStats[]) {
    const data = pressurePointGroups(stats);
    if (!data.length) return;
    const rows = data.map(({ label, values }) => [
      label, ...values.flatMap(({ chances, faced }) => [chances.won, chances.lost, faced.won, faced.lost]),
    ]);
    groupedTable('Pressure points', 'Point type', names, ['Won', 'Lost', 'Saved', 'Lost'], rows,
      { bands: ['Own chances', 'Faced'], detail: pressurePointExplanation });
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
    const body = notes ? layout([notes, 'body']) : null;
    const detailsHeight = [...introduction, ...blocks].reduce((space, block) => space + block.height, 5);
    const pointHeight = detailsHeight + (body?.height ?? 0);
    ensure(pointHeight <= top - bottom ? pointHeight : detailsHeight + (body?.leading ?? 0));
    introduction.forEach(block => draw(block));
    rule(page, y);
    y -= 5;
    blocks.forEach(block => draw(block));
    if (body) draw(body);
    y -= 5;
  }

  doc.setTitle(title);
  doc.setCreator('Tennis Notebook');
  doc.setProducer('Tennis Notebook');
  newPage();
  render({ group, summary, playerTable, statsTable, strokeTable, pressurePoints, matchNotes, notesSummary, pointNote });
  for (const [index, item] of doc.getPages().entries()) {
    const number = `Page ${index + 1} of ${doc.getPageCount()}`;
    rule(item, 39);
    item.drawText(number, { x: width - left - regular.widthOfTextAtSize(number, 8), y: 24, size: 8, font: regular, color: muted });
  }
  return doc.save();
}

const reportKinds: Record<MatchPDFVariant, string> = {
  summary: 'MATCH STATS SUMMARY',
  'point-by-point': 'POINT-BY-POINT REPORT',
  combined: 'COMBINED MATCH REPORT',
};

export function createMatchPDF(record: MatchRecord, fonts: ReportFonts, variant: MatchPDFVariant = 'combined'): Promise<Uint8Array> {
  const title = `${record.players[0].name} vs ${record.players[1].name}`;
  return createReportPDF(title, reportKinds[variant], fonts, ({ group, summary, statsTable, strokeTable, pressurePoints, matchNotes, notesSummary, pointNote }) => {
    const projection = replayMatchForReport(record);
    const { score, stats, points, hasScoreCorrections, timing } = projection;
    const names = [record.players[0].name, record.players[1].name] as const;
    const metadata = [record.date, record.group, record.round, record.venue, record.surface, record.courtSetting, record.conditions].filter(Boolean).join(' · ');
    group([[title, 'title', 5], [metadata, 'body', 14]]);
    const status = score.winner !== null ? `${record.players[score.winner].name} wins${score.status === 'retired' ? ' by retirement' : ''}` : score.status === 'abandoned' ? 'Abandoned without a winner' : score.status === 'suspended' ? 'Match paused' : 'In progress';
    const times = timingLabels(timing);
    summary(resultParts(score), [`${status} · ${record.format.name}`, ...(times.length ? [times.join(' · ')] : [])]);
    if (hasScoreCorrections) group([['The score includes manual corrections. Statistics use recorded points only.', 'caption', 10]]);
    if (variant !== 'point-by-point') {
      statsTable('Match stats', names, stats.players, false);
      if (stats.coverage.endings > 0) strokeTable(names, stats.players);
      if (stats.coverage.points) group([[
        `Endings recorded: ${stats.coverage.endings}/${stats.coverage.points} points. Strokes recorded: ${stats.coverage.strokes}/${stats.coverage.endings} endings. Aces count as serve winners; double faults as unforced serve errors.`,
        'caption', 8,
      ]]);
      pressurePoints(names, stats.players);
      const notes = record.matchNotes?.trim();
      if (notes) matchNotes(notes);
      if (variant === 'combined') notesSummary(pointNoteSummary(points, names));
    }

    if (variant === 'summary') return;
    const stages = buildPointByPoint(projection, names);
    const logIntro: TextBlock[] = [
      ['Point by point', 'heading', 4],
      [`Scores are shown before each point, with ${names[0]} first and ${names[1]} second.`, 'caption', 8],
    ];
    if (!stages.length) {
      group([...logIntro, ['No points recorded yet.', 'body']]);
      return;
    }
    for (const [index, stage] of stages.entries()) {
      const intro: TextBlock[] = [
        ...(index === 0 ? logIntro : []),
        [stage.title, 'heading', 4],
        [stage.status === 'completed' ? `${stage.points.length} recorded points` : `${stage.points.length} recorded points · ${stage.status === 'in-progress' ? 'In progress' : stage.status === 'paused' ? 'Paused' : 'Unfinished'}`, 'caption', 7],
      ];
      for (const [pointIndex, point] of stage.points.entries()) {
        const details: TextBlock[] = [
          [`${point.number}. ${point.scoreBefore}  ·  ${point.winner} won`, 'subheading'],
          [`${point.ending}  ·  ${point.serve}`, 'caption'],
        ];
        if (point.pressure.length) details.push([point.pressure.join(' · '), 'tableTotal']);
        for (const tone of ['rally', 'positive', 'negative', 'neutral'] as const) {
          const labels = point.labels.filter(label => label.tone === tone).map(label => label.text);
          if (labels.length) details.push([labels.join('  ·  '), tone === 'neutral' ? 'caption' : tone]);
        }
        pointNote(details, point.notes, pointIndex === 0 ? intro : undefined);
      }
      if (stage.points.length) {
        statsTable(`${stage.title} stats`, names, stage.stats.players, true);
      } else {
        group([...intro, ['No points were recorded for this stage.', 'body', 14]]);
      }
    }
  });
}

export function createPlayerPerformancePDF(report: PlayerPerformanceReport, fonts: ReportFonts): Promise<Uint8Array> {
  return createReportPDF(`Player performance · ${report.name}`, 'PLAYER PERFORMANCE', fonts, ({ group, summary, playerTable, pressurePoints, notesSummary }) => {
    group([[report.name, 'title', 5], [report.scope, 'body', 14]]);
    const [volume, result] = performanceCountLabels(report);
    summary(volume, [result]);
    playerTable('Stroke breakdown', report.stats);
    if (report.hasScoreCorrections) group([['Some matches contain score corrections. Statistics use recorded observations only.', 'caption', 10]]);
    pressurePoints([report.name], [report.stats]);
    notesSummary(report.noteSummary);
  });
}
