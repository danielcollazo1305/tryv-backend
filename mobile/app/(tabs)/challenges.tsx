import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { ChallengesView } from '@/components/social/ChallengesView';
import { spacing3, typography3 } from '@/constants/theme';

/**
 * Rota oculta (href: null) mantida para nao quebrar quem a referencia (ex.: o carrossel de desafios da Home): os
 * Desafios agora tambem sao uma aba do Social (feed.tsx, aba "Desafios"), e o conteudo vive em
 * components/social/ChallengesView.tsx. Aberta direto, mostra o titulo de antes por cima do ChallengesView.
 */
export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={[styles.header, { paddingTop: insets.top + spacing3.md }]}>
        <Text style={styles.title}>Desafios</Text>
      </View>
      <ChallengesView />
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing3.containerMargin },
  title: { ...typography3.headlineLgMobile, fontSize: 26 },
});
