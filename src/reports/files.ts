import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Asset } from 'expo-asset';
import { randomUUID } from 'expo-crypto';
import { createMatchPDF, createPlayerPerformancePDF } from './pdf.ts';
import type { MatchPDFVariant, ReportAssets } from './pdf.ts';
import type { PlayerPerformanceReport } from './playerPerformance.ts';
import type { MatchRecord } from '../storage/model.ts';

export type PreparedPDF = { uri: string; filename: string; canView: boolean };

export async function shareText(filename: string, contents: string, mimeType: string): Promise<void> {
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
  const file = new File(Paths.cache, filename); file.create({ overwrite: true }); file.write(contents);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Save or share your tennis records' });
}
export async function pickBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0]; if (!asset) return null;
  if ((asset.size ?? 0) > 20_000_000) throw new Error('This backup is too large to import.');
  if (Platform.OS === 'web' && asset.file) return asset.file.text();
  return new File(asset.uri).text();
}
async function loadReportAsset(moduleId: number): Promise<Uint8Array> {
  let asset = Asset.fromModule(moduleId);
  // Android images can be marked downloaded with a drawable name, not a file URI.
  // A fresh Asset copies that bundled resource into the cache before reading it.
  if (Platform.OS === 'android' && asset.localUri && !asset.localUri.includes(':')) {
    asset = new Asset({ name: asset.name, type: asset.type, hash: asset.hash, uri: asset.localUri });
  }
  await asset.downloadAsync();
  if (Platform.OS === 'web') return new Uint8Array(await (await fetch(asset.uri)).arrayBuffer());
  if (!asset.localUri) throw new Error('Could not load a report asset. Please try exporting again.');
  return new File(asset.localUri).bytes();
}
async function generateReportPDF(create: (assets: ReportAssets) => Promise<Uint8Array>): Promise<Uint8Array> {
  // Include both weights' redistribution notice in every app bundle.
  Asset.fromModule(require('../../assets/FONT-LICENSE.txt'));
  const [regular, bold, mark, wordmark] = await Promise.all([
    loadReportAsset(require('../../assets/DejaVuSans.ttf')),
    loadReportAsset(require('../../assets/DejaVuSans-Bold.ttf')),
    loadReportAsset(require('../../assets/tennis-notebook-mark.png')),
    loadReportAsset(require('../../assets/tennis-notebook-wordmark.png')),
  ]);
  return create({ regular, bold, mark, wordmark });
}

async function canPreviewPDF(file: File): Promise<boolean> {
  try {
    return await file.canPreview({ mimeType: 'application/pdf' });
  } catch {
    return false;
  }
}

async function prepareReportPDF(filename: string, create: (assets: ReportAssets) => Promise<Uint8Array>): Promise<PreparedPDF> {
  if (Platform.OS === 'web') throw new Error('Download this report from the browser. PDF preview is available in the mobile app.');
  const bytes = await generateReportPDF(create);
  const file = new File(Paths.cache, 'tennis-reports', randomUUID(), filename);
  file.create({ intermediates: true });
  file.write(bytes);
  return { uri: file.uri, filename, canView: await canPreviewPDF(file) };
}

export async function viewPreparedPDF(pdf: PreparedPDF): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Download this report from the browser. PDF preview is available in the mobile app.');
  const file = new File(pdf.uri);
  if (!file.exists) throw new Error('This PDF is no longer available. Prepare the report again.');
  if (!(await canPreviewPDF(file))) throw new Error('No PDF viewer is available. Use Share PDF to save or open this report with another app.');
  try {
    await file.preview({ mimeType: 'application/pdf', title: pdf.filename });
  } catch (error) {
    throw new Error('Could not open this PDF. Use Share PDF to save or open it with another app.', { cause: error });
  }
}

export async function sharePreparedPDF(pdf: PreparedPDF): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Download this report from the browser.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
  if (!new File(pdf.uri).exists) throw new Error('This PDF is no longer available. Prepare the report again.');
  await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', dialogTitle: 'Save or share tennis report' });
}

async function shareReportPDF(filename: string, create: (assets: ReportAssets) => Promise<Uint8Array>): Promise<void> {
  if (Platform.OS !== 'web') {
    await sharePreparedPDF(await prepareReportPDF(filename, create));
    return;
  }
  const bytes = await generateReportPDF(create);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function matchPDFFilename(record: MatchRecord, variant: MatchPDFVariant): string {
  const players = record.players.map(({ name }, side) => name.normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || (side === 0 ? 'Player' : 'Opponent'));
  return `${players.join('-vs-')}-${record.date}-${variant}.pdf`;
}

export function prepareMatchPDF(record: MatchRecord, variant: MatchPDFVariant): Promise<PreparedPDF> {
  return prepareReportPDF(matchPDFFilename(record, variant), assets => createMatchPDF(record, assets, variant));
}

export function preparePlayerPerformancePDF(report: PlayerPerformanceReport): Promise<PreparedPDF> {
  return prepareReportPDF('tennis-player-performance.pdf', assets => createPlayerPerformancePDF(report, assets));
}

export function sharePDF(record: MatchRecord, variant: MatchPDFVariant): Promise<void> {
  return shareReportPDF(matchPDFFilename(record, variant), assets => createMatchPDF(record, assets, variant));
}

export function sharePlayerPerformancePDF(report: PlayerPerformanceReport): Promise<void> {
  return shareReportPDF('tennis-player-performance.pdf', assets => createPlayerPerformancePDF(report, assets));
}
