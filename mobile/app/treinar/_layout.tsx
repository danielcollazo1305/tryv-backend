import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

import { RETRO, RETRO_FALLBACK_FONT, RETRO_FONT_NAME, RetroFontProvider } from '@/components/retro/retroTheme';

/**
 * Layout das telas "Treinar" (escuras, estilo menu de inventario retro). A fonte pixelada (Press Start 2P,
 * OFL) so e carregada AQUI, nao no boot do app. Se o carregamento falhar, usa uma fonte monoespacada do
 * sistema: a tela nunca fica travada esperando a fonte.
 */
export default function TreinarLayout() {
  const [loaded, error] = useFonts({
    [RETRO_FONT_NAME]: require('@/assets/fonts/PressStart2P-Regular.ttf'),
  });

  // Enquanto nem carregou nem falhou, so o fundo escuro (evita piscar a fonte de reserva).
  if (!loaded && !error) {
    return <View style={{ flex: 1, backgroundColor: RETRO.bg }} />;
  }

  return (
    <RetroFontProvider family={loaded ? RETRO_FONT_NAME : RETRO_FALLBACK_FONT}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: RETRO.bg }, animation: 'fade' }} />
    </RetroFontProvider>
  );
}
