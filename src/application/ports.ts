import type { MatchRepository } from '../storage/repository.ts';
import type { MatchRecord } from '../storage/model.ts';
import type { MatchPDFVariant } from '../reports/pdf.ts';
import type { PlayerPerformanceReport } from '../reports/playerPerformance.ts';

export interface PreparedPDF { uri: string; filename: string; canView: boolean }

export interface NotebookFiles {
  shareText(filename: string, contents: string, mimeType: string): Promise<void>;
  pickBackup(): Promise<string | null>;
  // A null result means the platform delivered a download directly.
  exportMatchPDF(record: MatchRecord, variant: MatchPDFVariant): Promise<PreparedPDF | null>;
  exportPlayerPDF(report: PlayerPerformanceReport): Promise<PreparedPDF | null>;
  viewPDF(pdf: PreparedPDF): Promise<void>;
  sharePDF(pdf: PreparedPDF): Promise<void>;
}

export interface NotebookDependencies {
  openRepository(): Promise<MatchRepository>;
  createId(): string;
  now(): string;
  files: NotebookFiles;
}
