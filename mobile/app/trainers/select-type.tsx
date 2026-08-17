import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ImageCoverCard } from '@/components/ImageCoverCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { colors2, spacing2, typography2 } from '@/constants/theme';

/**
 * Passo intermediario do fluxo "Acompanhamento profissional" da Home —
 * antes ia direto pra listagem (trainers/index.tsx); agora esse passo deixa
 * o usuario escolher a categoria primeiro, cada sub-card abrindo a listagem
 * ja filtrada via o param `type` (ver isProfessionalType em trainers/index.tsx).
 *
 * Layout empilhado (2 linhas), nao lado a lado: as imagens dos 2 sub-cards
 * (personal-trainer-card.png, nutricionista-card.png) sao paisagem
 * (1376x768, ~1.79:1) — um layout de 2 colunas estreitas forcaria um corte
 * feio (resizeMode="cover" cortando as laterais numa moldura estreita e
 * alta). Empilhado preserva a proporcao natural da imagem com boa
 * legibilidade de texto, igual aos outros cards de capa da Home.
 */
export default function SelectTrainerTypeScreen() {
  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.title}>Acompanhamento profissional</Text>
          <Text style={styles.subtitle}>Escolha o tipo de profissional que voce procura.</Text>
        </View>

        <ImageCoverCard
          image={require('../../assets/imagens/personal-trainer-card.png')}
          title="Personal Trainer"
          subtitle="Treino acompanhado por um profissional"
          accessibilityLabel="Personal trainer orientando um treino"
          height={160}
          onPress={() => router.push({ pathname: '/trainers', params: { type: 'personal_trainer' } })}
        />

        <ImageCoverCard
          image={require('../../assets/imagens/nutricionista-card.png')}
          title="Nutricionista"
          subtitle="Plano alimentar acompanhado por um profissional"
          accessibilityLabel="Prato de comida saudavel preparado por um nutricionista"
          height={160}
          onPress={() => router.push({ pathname: '/trainers', params: { type: 'nutritionist' } })}
        />
      </ScrollView>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.md },
  intro: { gap: spacing2.xs, marginBottom: spacing2.xs },
  title: { ...typography2.headlineLgMobile, fontSize: 24 },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
});
