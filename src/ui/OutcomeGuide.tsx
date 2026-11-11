import React from 'react';
import { View } from 'react-native';
import { Button, Card, Heading, Stack, T, useTheme } from './kit.tsx';

const definitions = [
  { label: 'Winner', text: 'A shot that wins the point without the opponent touching the ball.' },
  { label: 'Unforced error', text: 'A miss on a shot the player could reasonably be expected to keep in play.' },
  { label: 'Forced error', text: 'The player reaches the ball, but it is too difficult to get back into play.' },
] as const;

export function OutcomeHelpButton({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
  const c = useTheme();
  return <Button quiet compact label="Definitions" style={{ width: 48, alignItems: 'center' }} disabled={disabled} onPress={onPress}>
    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: c.sub, alignItems: 'center', justifyContent: 'center' }}>
      <T small bold muted style={{ lineHeight: 16 }}>i</T>
    </View>
  </Button>;
}

export function OutcomeGuide({ onClose }: { onClose: () => void }) {
  return <Stack>
    <Heading>Outcome definitions</Heading>
    <Card>
      {definitions.map(({ label, text }) => <View key={label} style={{ gap: 3 }}>
        <T bold>{label}</T>
        <T>{text}</T>
      </View>)}
    </Card>
    <T small muted>These definitions are guidelines. Choose the outcome that best fits what you saw and keep recording.</T>
    <Button primary onPress={onClose}>Done</Button>
  </Stack>;
}
