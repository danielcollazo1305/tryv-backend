import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { RankingView } from '@/components/social/RankingView';
import { colors3, spacing3, typography3 } from '@/constants/theme';

/**
 * Rota oculta (href: null) mantida para nao quebrar quem a referencia: o Ranking agora e uma aba do Social
 * (feed.tsx, aba "Ranking"), e o conteudo vive em components/social/RankingView.tsx. Aberta direto, mostra o mesmo
 * cabecalho de antes (logo, titulo e avatar) por cima do RankingView.
 */
export default function RankingScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={[styles.header, { paddingTop: insets.top + spacing3.md }]}>
        <Text style={styles.logo}>Tryv Fit</Text>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Ranking</Text>
          <ProfileAvatarButton size={36} />
        </View>
      </View>
      <RankingView />
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: spacing3.md, paddingHorizontal: spacing3.containerMargin },
  logo: { ...typography3.displayLg, fontSize: 36, fontFamily: 'Inter_800ExtraBold', color: colors3.primary },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography3.headlineLgMobile, fontSize: 26 },
});
