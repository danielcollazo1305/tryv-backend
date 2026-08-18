import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { HEATMAP_INTENSITY_COLORS, HeatmapDay, HeatmapGrid } from '@/components/HeatmapGrid';
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
 * Heatmap estilo GitHub contribution graph: quadradinhos sem numero do dia
 * (decisao de design — com o quadrado pequeno o suficiente pra caber o mes
 * inteiro numa largura de card confortavel, o numero fica ilegivel; um
 * toque no quadrado mostra a data + intensidade em texto abaixo, entao a
 * informacao do dia exato continua acessivel sem precisar do numero
 * impresso em cima da cor).
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

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;

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
      <Text style={styles.cardTitle}>{monthTitle()}</Text>
      {content}
    </LiquiglassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing2.md },
  cardTitle: { ...typography2.headlineMd, fontSize: 18 },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },

  footer: { gap: spacing2.xs, marginTop: spacing2.xs },
  selectedText: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLabel: { ...typography2.labelCaps, textTransform: 'none', fontSize: 10, color: colors2.onSurfaceVariant },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
});
