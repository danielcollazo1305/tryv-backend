import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors2, colors3, radius2, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

interface ProgressSteps2Props {
  /** 1-based */
  current: number;
  total: number;
  label: string;
  /**
   * 'dark' (padrao) = colors2, usado hoje pelas 6 telas de onboarding
   * (register-goal.tsx e as outras do fluxo de cadastro). 'light' = colors3,
   * so pro formulario de gerar treino (workout-plan/generate.tsx, migrado
   * nesta tarefa) — mesmo padrao de variant ja usado em SelectionCard2/
   * TextField2, pra nao quebrar os consumidores ainda escuros.
   */
  variant?: 'dark' | 'light';
}

/**
 * Barra de progresso "Passo X de Y" usada nos mockups de onboarding
 * (step2-corpo.html a step7-saude-alimentar.html) — mesmo padrao visual em
 * todos: rotulo do passo + nome da etapa acima de uma barra com gradiente
 * roxo preenchendo proporcionalmente ao passo atual.
 */
export function ProgressSteps2({ current, total, label, variant = 'dark' }: ProgressSteps2Props) {
  const isLight = variant === 'light';
  const s = isLight ? stylesLight : styles;
  const progress = Math.min(1, Math.max(0, current / total));
  const gradientColors = isLight
    ? ([colors3.primaryContainer, colors3.primary] as const)
    : ([colors2.violet, colors2.primary] as const);

  return (
    <View style={s.container}>
      <View style={s.labelRow}>
        <Text style={s.stepText}>
          Passo {current} de {total}
        </Text>
        <Text style={s.stepLabel}>{label}</Text>
      </View>
      <View style={s.track}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[s.fill, { width: `${progress * 100}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing2.xs },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepText: { ...typography2.labelCaps, fontSize: 11, color: colors2.outline },
  stepLabel: { ...typography2.labelCaps, fontSize: 11, color: colors2.primary },
  track: {
    height: 8,
    width: '100%',
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius2.pill },
});

const stylesLight = StyleSheet.create({
  container: { width: '100%', gap: spacing3.xs },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepText: { ...typography3.labelSm, fontSize: 11, textTransform: 'uppercase', color: colors3.outline },
  stepLabel: { ...typography3.labelSm, fontSize: 11, textTransform: 'uppercase', color: colors3.primary },
  track: {
    height: 8,
    width: '100%',
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius3.pill },
});
