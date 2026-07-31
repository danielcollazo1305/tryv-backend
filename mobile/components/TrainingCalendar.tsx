import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TrainingDay, parseLocalDate } from '@/services/dashboard';
import { colors, typography } from '@/constants/theme';

const CELL_SIZE = 14;
const CELL_GAP = 4;

// Mesmo roxo de destaque do app, com opacidade crescente por intensidade —
// mantem a paleta consistente em vez de introduzir 3 tons diferentes.
const INTENSITY_COLORS = [
  colors.surfaceElevated, // 0 - sem treino
  'rgba(139, 92, 246, 0.35)', // 1
  'rgba(139, 92, 246, 0.65)', // 2
  colors.accent, // 3 ou mais
];

interface Cell {
  key: string;
  intensity?: number;
}

export function TrainingCalendar({ data }: { data: TrainingDay[] }) {
  if (data.length === 0) {
    return <Text style={styles.emptyText}>Sem dados neste periodo ainda.</Text>;
  }

  // Colunas = semanas, linhas = dia da semana (dom-sab) — igual ao contribution
  // graph do GitHub. Preenche com celulas em branco antes do primeiro dia real
  // para alinhar cada data com sua coluna de dia-da-semana correta.
  const leadingBlanks = parseLocalDate(data[0].date).getDay();
  const cells: Cell[] = [];
  for (let i = 0; i < leadingBlanks; i++) {
    cells.push({ key: `blank-${i}` });
  }
  data.forEach((day) => cells.push({ key: day.date, intensity: day.intensity }));

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <View style={styles.grid}>
      {weeks.map((week, weekIndex) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={weekIndex} style={styles.week}>
          {week.map((cell) => (
            <View
              key={cell.key}
              style={[
                styles.cell,
                {
                  backgroundColor:
                    cell.intensity === undefined ? 'transparent' : INTENSITY_COLORS[cell.intensity],
                },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: CELL_GAP },
  week: { flexDirection: 'column', gap: CELL_GAP },
  cell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 3 },
  emptyText: { ...typography.bodySecondary },
});
