import { useEffect } from 'react';
import type { ComponentRef, RefObject } from 'react';
import { Keyboard, Platform, TextInput, useWindowDimensions } from 'react-native';
import type { ScrollView } from 'react-native';

type ScrollRef = RefObject<ComponentRef<typeof ScrollView> | null>;

export function revealFocusedInput(scroll: ScrollRef) {
  if (Platform.OS === 'web' || !Keyboard.isVisible()) return;
  requestAnimationFrame(() => {
    const input = TextInput.State.currentlyFocusedInput();
    if (!input || !Keyboard.isVisible()) return;
    scroll.current?.measureInWindow((_x, top, _width, height) => {
      if (Keyboard.isVisible() && TextInput.State.currentlyFocusedInput() === input) {
        // A fixed Save footer can sit between the scroll area and keyboard.
        // Keep the input above the scroll area's bottom as well as the keyboard.
        const keyboardTop = Keyboard.metrics()?.screenY;
        const footerInset = keyboardTop === undefined ? 0 : Math.max(0, keyboardTop - (top + height));
        scroll.current?.scrollResponderScrollNativeHandleToKeyboard(input, top + footerInset + 16, true);
      }
    });
  });
}

export function useKeyboardReveal(scroll: ScrollRef, enabled = true) {
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    if (!enabled) return;
    const show = Keyboard.addListener('keyboardDidShow', () => revealFocusedInput(scroll));
    const resize = Keyboard.addListener('keyboardDidChangeFrame', () => revealFocusedInput(scroll));
    return () => { show.remove(); resize.remove(); };
  }, [scroll, enabled]);
  useEffect(() => { if (enabled) revealFocusedInput(scroll); }, [scroll, width, height, enabled]);
}
