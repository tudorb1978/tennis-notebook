import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Asset } from 'expo-asset';
import { createMatchPDF, createPlayerPerformancePDF } from './pdf.ts';
import type { ReportFonts } from './pdf.ts';
import type { PlayerPerformanceReport } from './playerPerformance.ts';
import type { MatchRecord } from '../storage/model.ts';

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
async function loadReportFont(moduleId: number): Promise<Uint8Array> {
  const asset = await Asset.fromModule(moduleId).downloadAsync();
  return Platform.OS === 'web' ? new Uint8Array(await (await fetch(asset.uri)).arrayBuffer()) : new File(asset.localUri ?? asset.uri).bytes();
}
async function shareReportPDF(filename: string, create: (fonts: ReportFonts) => Promise<Uint8Array>): Promise<void> {
  // Include both weights' redistribution notice in every app bundle.
  Asset.fromModule(require('../../assets/FONT-LICENSE.txt'));
  const [regular, bold] = await Promise.all([
    loadReportFont(require('../../assets/DejaVuSans.ttf')),
    loadReportFont(require('../../assets/DejaVuSans-Bold.ttf')),
  ]);
  const bytes = await create({ regular, bold });
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
  const file = new File(Paths.cache, filename); file.create({ overwrite: true }); file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Save or share tennis report' });
}

export function sharePDF(record: MatchRecord): Promise<void> {
  return shareReportPDF(`tennis-match-${record.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`, font => createMatchPDF(record, font));
}

export function sharePlayerPerformancePDF(report: PlayerPerformanceReport): Promise<void> {
  return shareReportPDF('tennis-player-performance.pdf', font => createPlayerPerformancePDF(report, font));
}
