import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { TrainingDay, getTrainingFrequency, parseLocalDate } from '@/services/dashboard';
import { colors2, spacing2, typography2 } from '@/constants/theme';

const WEEKDAY_HEADERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Mesma paleta roxa usada em todo o app, com opacidade crescente por
// intensidade (0-3) — em vez de introduzir tons novos. Indice 0 fica quase
// invisivel no fundo escuro de proposito (heatmap estilo GitHub: "sem
// treino" e o estado neutro, nao um alerta).
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

function intensityLabel(intensity: number): string {
  if (intensity === 0) return 'Sem treino';
  if (intensity === 1) return '1 treino';
  if (intensity === 2) return '2 treinos';
  return '3 ou mais treinos';
}

function formatSelectedDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}

interface Cell {
  key: string;
  date?: string;
  intensity?: number;
  isToday?: boolean;
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
 */
export function TrainingFrequencyCard() {
  const [days, setDays] = useState<TrainingDay[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<TrainingDay | null>(null);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const data = await getTrainingFrequency({ month: currentMonthParam() });
      setDays(data.training_frequency);
      setSelected(null);
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
      cells.push({ key: d.date, date: d.date, intensity: d.intensity, isToday: d.date === todayKey });
    });
    while (cells.length % 7 !== 0) {
      cells.push({ key: `blank-trail-${cells.length}` });
    }

    const weeks: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }

    content = (
      <>
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
              {week.map((cell) =>
                cell.date ? (
                  <Pressable
                    key={cell.key}
                    onPress={() => setSelected({ date: cell.date!, intensity: cell.intensity ?? 0 })}
                    hitSlop={2}
                  >
                    <View
                      style={[
                        styles.cell,
                        { backgroundColor: INTENSITY_COLORS[cell.intensity ?? 0] },
                        cell.isToday && styles.cellToday,
                      ]}
                    />
                  </Pressable>
                ) : (
                  <View key={cell.key} style={styles.cell} />
                )
              )}
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.selectedText}>
            {selected
              ? `${formatSelectedDate(selected.date)} — ${intensityLabel(selected.intensity)}`
              : 'Toque num dia para ver o detalhe'}
          </Text>
          <View style={styles.legend}>
            <Text style={styles.legendLabel}>Menos</Text>
            {INTENSITY_COLORS.map((color, index) => (
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

  grid: { gap: 4 },
  week: { flexDirection: 'row', gap: 4 },
  weekdayLabel: {
    ...typography2.labelCaps,
    textTransform: 'none',
    width: 14,
    fontSize: 9,
    textAlign: 'center',
    color: colors2.onSurfaceVariant,
  },
  cell: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: colors2.white,
  },

  footer: { gap: spacing2.xs, marginTop: spacing2.xs },
  selectedText: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLabel: { ...typography2.labelCaps, textTransform: 'none', fontSize: 10, color: colors2.onSurfaceVariant },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
});
