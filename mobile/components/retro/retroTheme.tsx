import React, { createContext, useContext } from 'react';
import { Platform } from 'react-native';

/** Paleta da tela Treinar (escura, so nela). */
export const RETRO = {
  bg: '#07060c',
  panel: '#0d0820',
  panelAlt: '#0f0b1c',
  border: '#3a2a6b',
  slotBorder: '#2a1f4a',
  accent: '#b9a4ff',
  accentDark: '#3b1d7a',
  text: '#e9e5f5',
  textSoft: '#bdb6d6',
  textDim: '#8a82a8',
  warning: '#f5b84b',
  danger: '#ff6b6b',
} as const;

/** Nome registrado pelo useFonts em app/treinar/_layout.tsx. */
export const RETRO_FONT_NAME = 'PressStart2P';

/** Se a fonte pixelada nao carregar, cai numa monoespacada do sistema (nunca trava a tela). */
export const RETRO_FALLBACK_FONT = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }) as string;

const RetroFontContext = createContext<string>(RETRO_FALLBACK_FONT);

export function RetroFontProvider({ family, children }: { family: string; children: React.ReactNode }) {
  return <RetroFontContext.Provider value={family}>{children}</RetroFontContext.Provider>;
}

export function useRetroFont(): string {
  return useContext(RetroFontContext);
}
