import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { RadialGlow } from '@/components/RadialGlow';
import { ActivityProgressChart, ActivityProgressStats } from '@/components/ActivityProgressChart';
import { PERIOD_OPTIONS, TAB_COLOR, TAB_OPTIONS, formatDistance, useActivityProgress } from '@/components/useActivityProgress';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/**
 * Card de progresso da Home, estilo Strava — substitui o antigo "Km
 * rodados" (que continua existindo como WeeklyActivityChart, ainda usado
 * em social/[userId].tsx pro perfil publico de outra pessoa, por isso nao
 * foi tocado). Duas abas (Corrida/Musculacao), estatisticas fixas da
 * semana atual, toggle Semanal (picos diarios) / Mensal (picos semanais,
 * 12 semanas) pro grafico de barras.
 *
 * Retemado pro sistema visual novo "prism-glass" (ver colors3 em
 * constants/theme.ts) — GlassCard no lugar do LiquiglassCard, glow radial
 * discreto (bg-primary/10 blur-3xl no HTML de origem) no lugar do glow
 * roxo vivo do tema escuro. Mesma fonte de dado de sempre
 * (getRunProgress/getWorkoutProgress). Sem o indicador de variacao "+18%
 * vs. semana passada" do mockup: nao existe endpoint que compare o
 * RunProgress/WorkoutProgress da semana atual contra a anterior (so
 * getMonthComparison/getPeriodComparison fazem esse tipo de comparacao, em
 * outra granularidade) — nao inventado.
 *
 * Estado/fetch (tabs, toggle de periodo, getRunProgress/getWorkoutProgress)
 * e a renderizacao do grafico/estatisticas foram extraidos nesta tarefa
 * pra useActivityProgress.ts / ActivityProgressChart.tsx — reaproveitados
 * tambem pela pagina cheia (app/activity/progress.tsx), sem duplicar
 * logica entre o card compacto e a pagina nova. Este arquivo ficou so com
 * o "chrome" proprio do card (header com hero value, pills de
 * aba/periodo, botao "Veja mais").
 */
export function ActivityProgressCard() {
  const { tab, setTab, period, setPeriod, runProgress, workoutProgress, progress, errorMessage } = useActivityProgress();
  const tabColor = TAB_COLOR[tab];

  const heroValue = tab === 'run' ? (runProgress ? formatDistance(runProgress.distance_km) : '--') : workoutProgress ? `${workoutProgress.sessions_count}` : '--';
  const heroUnit = tab === 'run' ? 'km' : workoutProgress?.sessions_count === 1 ? 'sessão' : 'sessões';

  return (
    <GlassCard style={styles.card} padding={24}>
      <RadialGlow position="top-right" color={colors3.primary} opacity={0.1} radius="70%" cy="0%" />

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionTitle}>Esta semana</Text>
          <View style={styles.heroRow}>
            <Text style={styles.heroValue}>{heroValue}</Text>
            <Text style={styles.heroUnit}>{heroUnit}</Text>
          </View>
        </View>
        <View style={styles.tabRow}>
          {TAB_OPTIONS.map((option) => {
            const selected = option.value === tab;
            return (
              <Pressable
                key={option.value}
                onPress={() => setTab(option.value)}
                style={[styles.tabPill, selected && { backgroundColor: TAB_COLOR[option.value].bg }]}
              >
                <Text style={[styles.tabPillText, selected && { color: TAB_COLOR[option.value].text }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((option) => {
          const selected = option.value === period;
          return (
            <Pressable
              key={option.value}
              onPress={() => setPeriod(option.value)}
              style={[styles.periodPill, selected && styles.periodPillSelected]}
            >
              <Text style={[styles.periodPillText, selected && styles.periodPillTextSelected]}>
                {option.label.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {errorMessage ? (
        <Text style={styles.emptyText}>{errorMessage}</Text>
      ) : !progress ? (
        <Text style={styles.emptyText}>Carregando...</Text>
      ) : (
        <>
          <ActivityProgressChart tab={tab} progress={progress} tabColor={tabColor} />
          <ActivityProgressStats tab={tab} runProgress={runProgress} workoutProgress={workoutProgress} />
        </>
      )}

      {/* Continua indo pra /activity (lista crua) de proposito -- so os 2
          tiles equivalentes da Comparacao Mensal (Km percorridos/Treinos
          concluidos) passaram a apontar pra /activity/progress nesta
          tarefa; este botao do proprio card nao foi redirecionado. */}
      <Button3 label="Veja mais do seu progresso" variant="secondary" onPress={() => router.push('/activity')} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing3.md },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sectionTitle: { ...typography3.labelSm, color: colors3.onSurfaceVariant },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing3.xs },
  heroValue: { ...typography3.displayLg, fontSize: 40, lineHeight: 44 },
  heroUnit: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginLeft: spacing3.xs },

  tabRow: { flexDirection: 'row', gap: spacing3.xs },
  tabPill: {
    paddingVertical: 6,
    paddingHorizontal: spacing3.sm + 4,
    borderRadius: radius3.pill,
  },
  tabPillText: { ...typography3.labelSm, color: colors3.onSurfaceVariant },

  periodRow: {
    flexDirection: 'row',
    gap: 0,
    padding: 4,
    borderRadius: radius3.md,
    backgroundColor: 'rgba(229, 226, 225, 0.3)',
  },
  periodPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing3.sm,
    borderRadius: radius3.md,
  },
  periodPillSelected: { backgroundColor: colors3.primary },
  periodPillText: { ...typography3.labelSm, color: colors3.onSurfaceVariant, textAlign: 'center' },
  periodPillTextSelected: { color: colors3.onPrimary },

  emptyText: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant },
});
