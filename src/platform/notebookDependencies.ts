import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { openRepository } from '../storage/database.ts';
import { pickBackup, prepareMatchPDF, preparePlayerPerformancePDF, sharePDF, sharePlayerPerformancePDF, sharePreparedPDF, shareText, viewPreparedPDF } from '../reports/files.ts';
import type { NotebookDependencies } from '../application/ports.ts';

// This is the composition point for device services. Application workflows and
// layouts consume the same contract without importing the Expo implementations.
export const notebookDependencies: NotebookDependencies = {
  openRepository,
  createId: randomUUID,
  now: () => new Date().toISOString(),
  files: {
    shareText,
    pickBackup,
    async exportMatchPDF(record, variant) {
      if (Platform.OS === 'web') { await sharePDF(record, variant); return null; }
      return prepareMatchPDF(record, variant);
    },
    async exportPlayerPDF(report) {
      if (Platform.OS === 'web') { await sharePlayerPerformancePDF(report); return null; }
      return preparePlayerPerformancePDF(report);
    },
    viewPDF: viewPreparedPDF,
    sharePDF: sharePreparedPDF,
  },
};
