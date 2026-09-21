import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useElapsedLabel, useWorkoutSessionDraft } from '@/context/WorkoutSessionDraftContext';
import { GlassCard } from '@/components/GlassCard';
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_HEIGHT } from '@/app/(tabs)/_layout';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

const FREE_SESSION_ROUTE = '/workout-plan/free-session';

/** Respiro entre o topo da tab bar flutuante e a base do banner — mesmo espirito do TAB_BAR_BOTTOM_GAP dela, so que entre os dois elementos flutuantes. */
const BANNER_TAB_BAR_GAP = spacing3.sm;

/**
 * Mini-player flutuante do treino livre em andamento — mostrado em cima de
 * QUALQUER tela (montado no RootLayout, acima do <Stack>, nao dentro de
 * (tabs)/_layout.tsx) enquanto houver um rascunho `mode:'free'` com pelo
 * menos 1 exercicio em WorkoutSessionDraftContext. Sem estado proprio: some
 * e reaparece automaticamente seguindo o Context (concluir treino ->
 * setDraft(null) em FreeWorkoutLogView; reabrir o app com rascunho salvo em
 * disco -> reaparece sozinho, ver hidratacao em WorkoutSessionDraftContext).
 *
 * Posicionamento reaproveita TAB_BAR_HEIGHT/TAB_BAR_BOTTOM_GAP exportados
 * de (tabs)/_layout.tsx (mesma altura/insets.bottom que a tab bar
 * flutuante usa pra se posicionar) pra empilhar o banner logo acima dela
 * sem duplicar esses valores. Fora do grupo (tabs) (ex: activity/[id],
 * weight/index) nao ha tab bar embaixo -- o mesmo deslocamento so deixa o
 * banner um pouco mais solto do fundo, sem problema (pedido explicito).
 */
export function ActiveWorkoutBanner() {
  const { draft } = useWorkoutSessionDraft();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isFreeSessionScreen = pathname === FREE_SESSION_ROUTE;
  const exercisesCount = draft?.mode === 'free' ? draft.exercises.length : 0;
  // Chamado incondicionalmente (regra dos hooks) mesmo quando o early
  // return abaixo vai descartar o valor -- startedAt null so desliga o
  // timer interno do hook, sem custo real.
  const elapsedLabel = useElapsedLabel(draft?.mode === 'free' ? draft.startedAt : null);

  if (draft?.mode !== 'free' || exercisesCount === 0 || isFreeSessionScreen) return null;

  const bottom = insets.bottom + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + BANNER_TAB_BAR_GAP;
  const exercisesLabel = exercisesCount === 1 ? '1 exercício' : `${exercisesCount} exercícios`;

  return (
    <Pressable
      onPress={() => router.push(FREE_SESSION_ROUTE)}
      style={[styles.wrapper, { bottom }]}
      accessibilityRole="button"
      accessibilityLabel={`Treino livre em andamento, ${exercisesLabel}, ${elapsedLabel} decorridos. Toque para voltar.`}
    >
      <GlassCard variant="card" style={styles.content}>
        <View style={styles.iconBadge}>
          <Ionicons name="barbell" size={18} color={colors3.onPrimary} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={1}>
            Treino livre em andamento
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {exercisesLabel} • {elapsedLabel}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors3.outline} />
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing3.containerMargin,
    right: spacing3.containerMargin,
    // Alto o suficiente pra ficar por cima do conteudo normal das telas
    // (scrolls, cards) em qualquer aba/rota empilhada -- nao precisa
    // disputar com modais (Stack.Screen presentation:'modal' ja cobre a
    // tela toda nativamente, por cima disso).
    zIndex: 50,
    ...Platform.select({ android: { elevation: 12 } }),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: radius3.pill,
    backgroundColor: colors3.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1, gap: 1 },
  title: { ...typography3.labelMd },
  subtitle: { ...typography3.labelSm, color: colors3.onSurfaceVariant },
});
