import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { TrainingDay, getTrainingFrequency, parseLocalDate } from '@/services/dashboard';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

const WEEKDAY_HEADERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Mesma paleta roxa usada em todo o app, com opacidade crescente por
// intensidade (0-3) — em vez de introduzir tons novos.
const INTENSITY_COLORS = [
  colors2.surfaceContainerHigh, // 0 - sem treino
  'rgba(139, 92, 246, 0.35)', // 1
  'rgba(139, 92, 246, 0.65)', // 2
  colors2.violet, // 3 ou mais
];

function currentMonthParam(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthTitle(): string {
  const label = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface Cell {
  key: string;
  day?: number;
  intensity?: number;
  isToday?: boolean;
}

/**
 * "Frequencia de treino" da Home — recurso gratuito
 * (/dashboard/training-frequency), desacoplado do resumo Pro
 * (/dashboard/home-summary): busca os proprios dados, sempre do mes civil
 * atual, sem depender do seletor de mes que continua exclusivo das
 * estatisticas pagas mais abaixo na tela.
 */
export function TrainingFrequencyCard() {
  const [days, setDays] = useState<TrainingDay[] | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const data = await getTrainingFrequency({ month: currentMonthParam() });
      setDays(data.training_frequency);
    } catch {
      setError(true);
    }
  }, []);

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
    content = <Text style={styles.emptyText}>Nao foi possivel carregar sua frequencia de treino.</Text>;
  } else if (!days) {
    content = <Text style={styles.emptyText}>Carregando...</Text>;
  } else if (days.length === 0) {
    content = <Text style={styles.emptyText}>Sem dados neste mes ainda.</Text>;
  } else {
    const leadingBlanks = parseLocalDate(days[0].date).getDay();
    const cells: Cell[] = [];
    for (let i = 0; i < leadingBlanks; i++) {
      cells.push({ key: `blank-lead-${i}` });
    }
    days.forEach((d) => {
      cells.push({
        key: d.date,
        day: parseLocalDate(d.date).getDate(),
        intensity: d.intensity,
        isToday: d.date === todayKey,
      });
    });
    while (cells.length % 7 !== 0) {
      cells.push({ key: `blank-trail-${cells.length}` });
    }

    const weeks: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }

    content = (
      <View style={styles.grid}>
        <View style={styles.week}>
          {WEEKDAY_HEADERS.map((label, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Text key={index} style={styles.weekdayLabel}>
              {label}
            </Text>
          ))}
        </View>
        {weeks.map((week, weekIndex) => (
          // eslint-disable-next-line react/no-array-index-key
          <View key={weekIndex} style={styles.week}>
            {week.map((cell) => (
              <View
                key={cell.key}
                style={[
                  styles.cell,
                  cell.day !== undefined && {
                    backgroundColor: INTENSITY_COLORS[cell.intensity ?? 0],
                  },
                  cell.isToday && styles.cellToday,
                ]}
              >
                {cell.day !== undefined && (
                  <Text style={[styles.cellDay, (cell.intensity ?? 0) >= 2 && styles.cellDayOnColor]}>
                    {cell.day}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
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

  grid: { gap: 4 },
  week: { flexDirection: 'row', gap: 4 },
  weekdayLabel: {
    ...typography2.labelCaps,
    textTransform: 'none',
    width: 36,
    textAlign: 'center',
    color: colors2.onSurfaceVariant,
  },
  cell: {
    width: 36,
    height: 36,
    borderRadius: radius2.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: colors2.violet,
  },
  cellDay: { ...typography2.bodyMd, fontSize: 12, color: colors2.onSurfaceVariant },
  cellDayOnColor: { color: colors2.white, fontWeight: '700' },
});
