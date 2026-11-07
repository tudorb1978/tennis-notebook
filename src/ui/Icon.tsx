import React from 'react';
import { Image } from 'react-native';

const icons = {
  calendar: require('../../assets/icons/calendar.png'),
  chart: require('../../assets/icons/chart.png'),
  'chevron-left': require('../../assets/icons/chevron-left.png'),
  'chevron-right': require('../../assets/icons/chevron-right.png'),
  close: require('../../assets/icons/close.png'),
  court: require('../../assets/icons/court.png'),
  download: require('../../assets/icons/download.png'),
  edit: require('../../assets/icons/edit.png'),
  history: require('../../assets/icons/history.png'),
  note: require('../../assets/icons/note.png'),
  players: require('../../assets/icons/players.png'),
  plus: require('../../assets/icons/plus.png'),
  racket: require('../../assets/icons/racket.png'),
  record: require('../../assets/icons/record.png'),
  report: require('../../assets/icons/report.png'),
  settings: require('../../assets/icons/settings.png'),
  sliders: require('../../assets/icons/sliders.png'),
  trash: require('../../assets/icons/trash.png'),
  undo: require('../../assets/icons/undo.png'),
  upload: require('../../assets/icons/upload.png'),
};

export type IconName = keyof typeof icons;

export function Icon({ name, color, size = 18 }: { name: IconName; color: string; size?: number }) {
  return <Image source={icons[name]} accessible={false} accessibilityElementsHidden importantForAccessibility="no"
    style={{ width: size, height: size, tintColor: color, flexShrink: 0 }} />;
}
