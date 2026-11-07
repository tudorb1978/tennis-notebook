import React from 'react';
import { View } from 'react-native';
import { Icon } from './Icon.tsx';
import { Button, Card, Eyebrow, Heading, Notice, Row, Stack, T, useTheme } from './kit.tsx';

export function PDFReady({ title, description, canView, busy, onView, onShare }: {
  title: string;
  description: string;
  canView: boolean;
  busy: boolean;
  onView: () => void;
  onShare: () => void;
}) {
  const c = useTheme();
  return <Stack>
    <View style={{ gap: 6 }}>
      <Heading>Your PDF is ready</Heading>
      <T small muted>Read the report on your device or share a copy with your coach.</T>
    </View>
    <Card>
      <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: c.soft }}>
          <Icon name="report" color={c.accent} size={24} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Eyebrow>PDF report</Eyebrow>
          <T bold style={{ fontSize: 18, lineHeight: 24 }}>{title}</T>
          <T small muted>{description}</T>
        </View>
      </Row>
    </Card>
    {!canView && <Notice>A PDF viewer is needed to open this report. You can still use Share PDF to save or send it.</Notice>}
    <View style={{ gap: 8 }}>
      <Button primary icon="report" testID="pdf-view" style={{ minHeight: 52 }} disabled={busy || !canView} onPress={onView}>View PDF</Button>
      <Button icon="upload" testID="pdf-share" style={{ minHeight: 52 }} disabled={busy} onPress={onShare}>Share PDF</Button>
    </View>
  </Stack>;
}
