import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors2 } from '@/constants/theme';

export interface HeatmapDay {
  date: string;
  /** Indice em HEATMAP_INTENSITY_COLORS — 0 = nada, ultimo indice = maximo. */
  intensity: number;
}

interface Cell {
  key: string;
  date?: string;
  intensity?: number;
  isToday?: boolean;
}

const WEEKDAY_HEADERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Mesma paleta roxa do app, opacidade crescente por intensidade — 0 quase invisivel de proposito (heatmap estilo GitHub: "sem atividade" e neutro, nao alerta). */
export const HEATMAP_INTENSITY_COLORS = [
  colors2.surfaceContainerHigh,
  'rgba(139, 92, 246, 0.35)',
  'rgba(139, 92, 246, 0.65)',
  colors2.violet,
];

function parseLocalDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

interface HeatmapGridProps {
  /** Dias em ordem crescente — celulas de preenchimento (antes do primeiro dia da semana e depois do ultimo) sao adicionadas automaticamente. */
  days: HeatmapDay[];
  /** 'YYYY-MM-DD' do dia atual, pra destacar a celula correspondente — omitir se nao fizer sentido (ex: preview em miniatura). */
  todayKey?: string;
  /** 14 = tamanho usado na Frequencia de Treino da Home. Reduzir pra previas em miniatura (ex: card da Home). */
  cellSize?: number;
  showWeekdayHeaders?: boolean;
  intensityColors?: string[];
  onSelectDay?: (day: HeatmapDay) => void;
}

/**
 * Grade de heatmap estilo GitHub contribution graph — extraida de
 * TrainingFrequencyCard (Frequencia de Treino da Home) pra ser reaproveitada
 * tambem no heatmap de consistencia dos Desafios (tela de detalhe e previas
 * em miniatura), sem duplicar a logica de montagem de semanas/celulas.
 * TrainingFrequencyCard mantem so a busca de dados e o card/legenda em
 * volta — a grade em si vive aqui.
 */
export function HeatmapGrid({
  days,
  todayKey,
  cellSize = 14,
  showWeekdayHeaders = true,
  intensityColors = HEATMAP_INTENSITY_COLORS,
  onSelectDay,
}: HeatmapGridProps) {
  if (days.length === 0) return null;

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

  const cellStyle = { width: cellSize, height: cellSize, borderRadius: Math.max(2, Math.round(cellSize * 0.2)) };

  return (
    <View style={styles.grid}>
      {showWeekdayHeaders && (
        <View style={styles.week}>
          {WEEKDAY_HEADERS.map((label, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Text key={index} style={[styles.weekdayLabel, { width: cellSize }]}>
              {label}
            </Text>
          ))}
        </View>
      )}
      {weeks.map((week, weekIndex) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={weekIndex} style={styles.week}>
          {week.map((cell) =>
            cell.date ? (
              onSelectDay ? (
                <Pressable
                  key={cell.key}
                  onPress={() => onSelectDay({ date: cell.date!, intensity: cell.intensity ?? 0 })}
                  hitSlop={2}
                >
                  <View
                    style={[
                      cellStyle,
                      { backgroundColor: intensityColors[cell.intensity ?? 0] ?? intensityColors[0] },
                      cell.isToday && styles.cellToday,
                    ]}
                  />
                </Pressable>
              ) : (
                <View
                  key={cell.key}
                  style={[
                    cellStyle,
                    { backgroundColor: intensityColors[cell.intensity ?? 0] ?? intensityColors[0] },
                    cell.isToday && styles.cellToday,
                  ]}
                />
              )
            ) : (
              <View key={cell.key} style={cellStyle} />
            )
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 4 },
  week: { flexDirection: 'row', gap: 4 },
  weekdayLabel: {
    fontSize: 9,
    textAlign: 'center',
    color: colors2.onSurfaceVariant,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: colors2.white,
  },
});
