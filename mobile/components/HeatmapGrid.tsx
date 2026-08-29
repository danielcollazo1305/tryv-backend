import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors2, colors3, typography2, typography3 } from '@/constants/theme';

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
  isFuture?: boolean;
}

const WEEKDAY_HEADERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Mesma paleta roxa do app, opacidade crescente por intensidade — 0 quase invisivel de proposito (heatmap estilo GitHub: "sem atividade" e neutro, nao alerta). */
export const HEATMAP_INTENSITY_COLORS = [
  colors2.surfaceContainerHigh,
  'rgba(139, 92, 246, 0.35)',
  'rgba(139, 92, 246, 0.65)',
  colors2.violet,
];

/**
 * Equivalente claro (sistema "prism-glass", ver colors3 em
 * constants/theme.ts) — mesma progressao de opacidade crescente, so com o
 * roxo do tema novo (#6b38d4) e um neutro claro pra intensidade 0 (o HTML
 * de origem nao modela intensidade nenhuma nas celulas do calendario —
 * todo dia nao-hoje usa a mesma cor estatica —, mas a Home precisa manter
 * o dado real de "quantos treinos naquele dia", entao a progressao aqui e
 * uma adaptacao pro tema claro do mesmo conceito, nao uma copia literal do
 * HTML).
 */
export const HEATMAP_INTENSITY_COLORS_LIGHT = [
  'rgba(229, 226, 225, 0.5)',
  'rgba(107, 56, 212, 0.18)',
  'rgba(107, 56, 212, 0.4)',
  colors3.primary,
];

function parseLocalDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

/** 'YYYY-MM-DD' de hoje, horario local — mesmo formato usado em todo o app pra comparar com HeatmapDay.date. */
export function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Sequencia atual de dias consecutivos com intensidade > 0, terminando
 * hoje — anda dia a dia (nao por indice do array, que pode ter buracos)
 * comparando strings 'YYYY-MM-DD'. Se hoje ainda nao tem intensidade > 0,
 * isso NAO quebra a sequencia (o dia so ainda nao aconteceu de verdade) —
 * comeca a contar de ontem, mesma convencao do contador de sequencia do
 * Strava.
 *
 * hitLeftEdge = true quando a sequencia estava ativa e ainda ininterrupta
 * no dia mais antigo presente em `days` — ou seja, pode continuar antes
 * disso, mas nao ha dado pra confirmar. Quem chama decide o que fazer com
 * isso: se `days` cobre um periodo com inicio real e conhecido (ex: inicio
 * de um desafio), hitLeftEdge=true so significa "a sequencia cobre o
 * periodo inteiro" (dado exato). Se `days` e uma janela arbitraria (ex: so
 * o mes civil atual), hitLeftEdge=true significa que o numero e um piso,
 * nao o total real — nao inventar o restante, so sinalizar a incerteza
 * (ver TrainingFrequencyCard, que mostra "N+" nesse caso).
 */
export function computeCurrentStreak(days: HeatmapDay[], todayKeyValue: string): { count: number; hitLeftEdge: boolean } {
  const byDate = new Map(days.map((d) => [d.date, d.intensity] as const));

  const shiftDateKey = (key: string, deltaDays: number): string => {
    const date = parseLocalDate(key);
    date.setDate(date.getDate() + deltaDays);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  let cursor = (byDate.get(todayKeyValue) ?? 0) > 0 ? todayKeyValue : shiftDateKey(todayKeyValue, -1);
  let count = 0;
  while (byDate.has(cursor) && (byDate.get(cursor) ?? 0) > 0) {
    count += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return { count, hitLeftEdge: count > 0 && !byDate.has(cursor) };
}

interface HeatmapGridProps {
  /** Dias em ordem crescente — celulas de preenchimento (antes do primeiro dia da semana e depois do ultimo) sao adicionadas automaticamente. */
  days: HeatmapDay[];
  /** 'YYYY-MM-DD' do dia atual, pra destacar a celula correspondente e apagar os dias futuros — omitir se nao fizer sentido (ex: preview em miniatura sem essas variacoes). */
  todayKey?: string;
  /** 34 = tamanho do calendario estilo Strava (numero do dia legivel). Reduzir pra previas em miniatura (ex: card da Home), onde showDayNumbers tambem deve ir pra false. */
  cellSize?: number;
  /** false nas previas em miniatura — numero ilegivel em celulas pequenas, melhor omitir do que espremer. */
  showDayNumbers?: boolean;
  showWeekdayHeaders?: boolean;
  intensityColors?: string[];
  onSelectDay?: (day: HeatmapDay) => void;
  /** 'dark' (liquiglass, padrao — mantem todo uso existente inalterado) ou 'light' (prism-glass, Home). */
  variant?: 'dark' | 'light';
}

/**
 * Calendario de consistencia estilo Strava (celulas circulares grandes com
 * o numero do dia dentro, dia atual com contorno em vez de preenchimento,
 * dias futuros apagados) — redesenhado a partir do heatmap estilo GitHub
 * anterior (quadradinhos pequenos, sem numero), que ficava pequeno demais
 * pra ler rapido. Continua compartilhado entre Frequencia de Treino (Home
 * e perfil publico de outra pessoa), consistencia de Desafio (tela de
 * detalhe e previas em miniatura na Home/Perfil) e o proprio Perfil — so a
 * fonte do `days` muda por contexto, a grade em si vive aqui.
 */
export function HeatmapGrid({
  days,
  todayKey: todayKeyProp,
  cellSize = 34,
  showDayNumbers = true,
  showWeekdayHeaders = true,
  intensityColors,
  onSelectDay,
  variant = 'dark',
}: HeatmapGridProps) {
  if (days.length === 0) return null;

  const isLight = variant === 'light';
  const resolvedIntensityColors = intensityColors ?? (isLight ? HEATMAP_INTENSITY_COLORS_LIGHT : HEATMAP_INTENSITY_COLORS);
  const palette = isLight
    ? {
        onSurface: colors3.onSurface,
        onSurfaceVariant: colors3.onSurfaceVariant,
        white: colors3.onPrimary,
        today: colors3.primary,
        todayGlow: colors3.primaryContainer,
        futureBorder: colors3.outlineVariant,
      }
    : {
        onSurface: colors2.onSurface,
        onSurfaceVariant: colors2.onSurfaceVariant,
        white: colors2.white,
        today: colors2.violet,
        todayGlow: colors2.violetGlow,
        futureBorder: colors2.outlineVariant,
      };

  const leadingBlanks = parseLocalDate(days[0].date).getDay();
  const cells: Cell[] = [];
  for (let i = 0; i < leadingBlanks; i++) {
    cells.push({ key: `blank-lead-${i}` });
  }
  days.forEach((d) => {
    cells.push({
      key: d.date,
      date: d.date,
      intensity: d.intensity,
      isToday: d.date === todayKeyProp,
      isFuture: !!todayKeyProp && d.date > todayKeyProp,
    });
  });
  while (cells.length % 7 !== 0) {
    cells.push({ key: `blank-trail-${cells.length}` });
  }

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const baseCellStyle = { width: cellSize, height: cellSize, borderRadius: cellSize / 2 };
  const numberFontSize = Math.max(9, Math.round(cellSize * 0.36));

  const renderCell = (cell: Cell) => {
    if (!cell.date) return <View key={cell.key} style={baseCellStyle} />;

    let content: React.ReactNode = null;
    let cellStyle;
    let numberColor: string = palette.onSurface;

    if (cell.isToday) {
      cellStyle = [
        baseCellStyle,
        {
          backgroundColor: palette.today,
          borderWidth: 2,
          borderColor: palette.todayGlow,
          shadowColor: palette.todayGlow,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: 8,
          elevation: 6,
        },
      ];
      numberColor = palette.white;
    } else if (cell.isFuture) {
      cellStyle = [baseCellStyle, { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.futureBorder }];
      numberColor = palette.onSurfaceVariant;
    } else {
      const bg = resolvedIntensityColors[cell.intensity ?? 0] ?? resolvedIntensityColors[0];
      cellStyle = [baseCellStyle, { backgroundColor: bg }];
      numberColor = (cell.intensity ?? 0) > 0 ? palette.onSurface : palette.onSurfaceVariant;
    }

    if (showDayNumbers) {
      content = (
        <Text style={[styles.dayNumber, { fontSize: numberFontSize, color: numberColor }, cell.isFuture && styles.dayNumberFuture]}>
          {parseLocalDate(cell.date).getDate()}
        </Text>
      );
    }

    if (!onSelectDay) {
      return (
        <View key={cell.key} style={[cellStyle, styles.cellCenter]}>
          {content}
        </View>
      );
    }

    return (
      <Pressable key={cell.key} onPress={() => onSelectDay({ date: cell.date!, intensity: cell.intensity ?? 0 })} hitSlop={2}>
        <View style={[cellStyle, styles.cellCenter]}>{content}</View>
      </Pressable>
    );
  };

  return (
    <View style={styles.grid}>
      {showWeekdayHeaders && (
        <View style={styles.week}>
          {WEEKDAY_HEADERS.map((label, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Text
              key={index}
              style={[isLight ? styles.weekdayLabelLight : styles.weekdayLabelDark, { width: cellSize }]}
            >
              {label}
            </Text>
          ))}
        </View>
      )}
      {weeks.map((week, weekIndex) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={weekIndex} style={styles.week}>
          {week.map(renderCell)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 4 },
  // `week` (linha de 7 celulas de largura FIXA, cellSize) e filho de
  // `grid` (coluna) sem largura propria — herda o alignItems:'stretch'
  // padrao do RN e vira tao largo quanto o card (menos o padding do
  // GlassCard/LiquiglassCard). Sem justifyContent, os 7 itens de largura
  // fixa ficam colados a esquerda (flex-start, o padrao) e toda a sobra
  // vira um vao vazio so do lado direito — mesma causa raiz do card de
  // progresso (ActivityProgressCard.tsx: la os itens eram largura fixa
  // dentro de uma linha mais larga que o conteudo real). A correcao aqui
  // e diferente porque as celulas do calendario PRECISAM ficar com
  // tamanho fixo (sao circulos, esticar deformaria); em vez de crescer os
  // itens (flex:1, como no grafico de barras), so distribui o espaco
  // sobrando igualmente entre eles.
  week: { flexDirection: 'row', gap: 4, justifyContent: 'space-between' },
  weekdayLabelDark: {
    ...typography2.labelCaps,
    fontSize: 9,
    letterSpacing: 0.9,
    textAlign: 'center',
    color: '#6B7280',
  },
  weekdayLabelLight: {
    ...typography3.labelSm,
    fontSize: 10,
    textAlign: 'center',
    color: colors3.outline,
  },
  cellCenter: { alignItems: 'center', justifyContent: 'center' },
  dayNumber: {
    fontWeight: '600',
  },
  dayNumberFuture: {
    opacity: 0.55,
  },
});
