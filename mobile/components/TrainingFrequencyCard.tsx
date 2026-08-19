import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { HEATMAP_INTENSITY_COLORS, HeatmapDay, HeatmapGrid, computeCurrentStreak, todayKey as getTodayKey } from '@/components/HeatmapGrid';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { TrainingDay, getTrainingFrequency, parseLocalDate } from '@/services/dashboard';
import { colors2, spacing2, typography2 } from '@/constants/theme';

function currentMonthParam(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthTitle(): string {
  const label = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function intensityLabel(intensity: number): string {
  if (intensity === 0) return 'Sem treino';
  if (intensity === 1) return '1 treino';
  if (intensity === 2) return '2 treinos';
  return '3 ou mais treinos';
}

function formatSelectedDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}

/**
 * "Frequencia de treino" da Home — recurso gratuito
 * (/dashboard/training-frequency), desacoplado do resumo Pro
 * (/dashboard/home-summary): busca os proprios dados, sempre do mes civil
 * atual, sem depender do seletor de mes que continua exclusivo das
 * estatisticas pagas mais abaixo na tela.
 *
 * Calendario estilo Strava (HeatmapGrid): celulas circulares com o numero
 * do dia dentro, hoje com contorno em vez de preenchimento, dias futuros
 * apagados. Um toque na celula ainda mostra a data + intensidade em texto
 * abaixo (mantido do design anterior). Sequencia atual (streak) calculada
 * so sobre o mes civil buscado — ver comentario junto de `streak` abaixo
 * pra limitacao quando a sequencia cruza a virada do mes.
 *
 * userId opcional: reaproveitado no perfil publico de outra pessoa
 * (social/[userId].tsx) — mesma decisao de visibilidade do
 * WeeklyActivityChart (sem gate de seguidor).
 */
export function TrainingFrequencyCard({ userId }: { userId?: string } = {}) {
  const [days, setDays] = useState<TrainingDay[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<TrainingDay | null>(null);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const data = await getTrainingFrequency({ month: currentMonthParam() }, userId);
      setDays(data.training_frequency);
      setSelected(null);
    } catch {
      setError(true);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const todayKey = getTodayKey();

  // Sequencia calculada so sobre o mes civil atual (unico dado que este
  // card busca) — se ela ainda estiver ativa no dia 1 do mes (hitLeftEdge),
  // pode continuar no mes anterior, mas nao ha como saber sem buscar mais
  // dado (GET /dashboard/training-frequency so foi chamado com o mes
  // atual). Documentado em vez de inventar o restante: mostra "N+" nesse
  // caso, sinalizando que e um piso, nao o total exato.
  const streak = days ? computeCurrentStreak(days, todayKey) : null;

  let content: React.ReactNode;

  if (error) {
    content = (
      <Text style={styles.emptyText}>
        {userId ? 'Nao foi possivel carregar a frequencia de treino.' : 'Nao foi possivel carregar sua frequencia de treino.'}
      </Text>
    );
  } else if (!days) {
    content = <Text style={styles.emptyText}>Carregando...</Text>;
  } else if (days.length === 0) {
    content = (
      <Text style={styles.emptyText}>
        {userId ? 'Ainda sem atividades registradas.' : 'Sem dados neste mes ainda.'}
      </Text>
    );
  } else {
    content = (
      <>
        <HeatmapGrid
          days={days as HeatmapDay[]}
          todayKey={todayKey}
          onSelectDay={(day) => setSelected({ date: day.date, intensity: day.intensity })}
        />

        <View style={styles.footer}>
          <Text style={styles.selectedText}>
            {selected
              ? `${formatSelectedDate(selected.date)} — ${intensityLabel(selected.intensity)}`
              : 'Toque num dia para ver o detalhe'}
          </Text>
          <View style={styles.legend}>
            <Text style={styles.legendLabel}>Menos</Text>
            {HEATMAP_INTENSITY_COLORS.map((color, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <View key={index} style={[styles.legendSwatch, { backgroundColor: color }]} />
            ))}
            <Text style={styles.legendLabel}>Mais</Text>
          </View>
        </View>
      </>
    );
  }

  return (
    <LiquiglassCard style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.cardTitle}>{monthTitle()}</Text>
        {!!streak && streak.count > 0 && (
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={14} color={colors2.violet} />
            <Text style={styles.streakText}>
              {streak.count}
              {streak.hitLeftEdge ? '+' : ''} {streak.count === 1 ? 'dia seguido' : 'dias seguidos'}
            </Text>
          </View>
        )}
      </View>
      {content}
    </LiquiglassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing2.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...typography2.headlineMd, fontSize: 18 },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderRadius: 999,
    paddingHorizontal: spacing2.sm,
    paddingVertical: 4,
  },
  streakText: { ...typography2.labelCaps, textTransform: 'none', fontSize: 11, color: colors2.violet, fontWeight: '700' },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },

  footer: { gap: spacing2.xs, marginTop: spacing2.xs },
  selectedText: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLabel: { ...typography2.labelCaps, textTransform: 'none', fontSize: 10, color: colors2.onSurfaceVariant },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
});
