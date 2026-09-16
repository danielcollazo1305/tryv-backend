import React, { useCallback, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { RadialGlow } from '@/components/RadialGlow';
import { getApiErrorMessage } from '@/services/api';
import {
  ProgressGranularity,
  ProgressPeriod,
  RunProgress,
  WorkoutProgress,
  getRunProgress,
  getWorkoutProgress,
} from '@/services/dashboard';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

type Tab = 'run' | 'workout';

const MIN_BAR_SLOT = 34;
// Pedido explicito: area do grafico bem mais alta — ja tinha ido de 76
// pra 120 numa rodada anterior, agora igual ao h-40 (160px) do container
// do mockup, sem descontar nada (o desconto de antes deixava baixo
// demais).
const BAR_TRACK_HEIGHT = 160;

// Teto FIXO do eixo Y do grafico de distancia de corrida (nao o de
// Musculacao, que continua em barra com auto-escala) — corrige o card
// mostrando uma corrida de 1km como se fosse quase 100% da altura quando e
// o unico ponto > 0 na janela visivel. Com escala fixa, 1km fica
// proporcionalmente pequeno e 15km fica grande de verdade, sem depender do
// maximo daquele dia/semana especifico. Vale pros dois toggles (Semanal e
// Mensal) — no Mensal os pontos sao soma semanal, entao uma semana muito
// ativa pode encostar no teto (nao quebra, so nao sobe mais que isso).
const RUN_CHART_MAX_KM = 12;
const RUN_CHART_GRID_KM = [5, 10];

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'run', label: 'Corrida' },
  { value: 'workout', label: 'Musculação' },
];

const PERIOD_OPTIONS: { value: ProgressPeriod; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
];

/**
 * Cor de cada aba quando selecionada — "Corrida" usa o par ambar
 * tertiary-fixed-dim/on-tertiary-fixed do HTML de origem
 * (bg-[#ffb869]/text-[#2c1700], hardcoded la tambem em vez das chaves
 * tertiary-*, mas sao os mesmos tons — ver colors3 em constants/theme.ts),
 * "Musculacao" usa o roxo primario padrao do app.
 */
const TAB_COLOR: Record<Tab, { bg: string; text: string }> = {
  run: { bg: colors3.tertiaryFixedDim, text: colors3.onTertiaryFixed },
  workout: { bg: colors3.primary, text: colors3.onPrimary },
};

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Dia da semana (granularity='day') ou dia-do-mes do inicio do bucket (granularity='week') — mesma logica de rotulo curto usada no resto do app (WeeklyActivityChart/MealsHistoryCard). */
function formatBucketLabel(dateStr: string, granularity: ProgressGranularity): string {
  const date = parseLocalDate(dateStr);
  if (granularity === 'week') return String(date.getDate());
  return WEEKDAY_LABELS[date.getDay()];
}

function formatDistance(km: number): string {
  return km.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Mesmo utilitario de HealthMetricsGrid/HealthWeeklyBarChart — cores de metrica sao hex fixo. */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

interface StatTileProps {
  label: string;
  value: string;
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

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
 * Musculacao nao tem Tempo/Calorias reais (workout_sessions.duration_minutes/
 * calories_burned existem como coluna mas nenhum fluxo do app preenche
 * isso hoje — falta um cronometro na tela de treino, ver investigacao) —
 * as 3 estatisticas viraram Treinos/Series/Volume, decisao tomada com o
 * usuario, tudo derivado do que de fato e gravado nas series completadas
 * de cada sessao.
 */
export function ActivityProgressCard() {
  const [tab, setTab] = useState<Tab>('run');
  const [period, setPeriod] = useState<ProgressPeriod>('weekly');
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [workoutProgress, setWorkoutProgress] = useState<WorkoutProgress | null>(null);
  // Largura real do container do grafico, medida via onLayout — a versao
  // anterior calculava uma largura "estimada" a partir de SCREEN_WIDTH e
  // uma formula de margens que nao batia com a largura real do card
  // (GlassCard tem seu proprio padding, nao contabilizado ali), sobrando
  // espaco assimetrico de um lado so. Medindo o container de verdade, as
  // barras sempre preenchem exatamente o espaco disponivel.
  const [chartAreaWidth, setChartAreaWidth] = useState(0);
  const handleChartAreaLayout = (event: LayoutChangeEvent) => {
    setChartAreaWidth(event.nativeEvent.layout.width);
  };
  // Mensagem real do erro (nao so um boolean) — mesma convencao usada no
  // resto do app (getApiErrorMessage) pra distinguir 404/500/rede em vez
  // de um "nao foi possivel" generico que esconde a causa. Logada tambem
  // no console pra depuracao (Metro/logs do device).
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErrorMessage(null);
    try {
      if (tab === 'run') {
        setRunProgress(await getRunProgress(period));
      } else {
        setWorkoutProgress(await getWorkoutProgress(period));
      }
    } catch (err) {
      console.error('ActivityProgressCard: falha ao buscar progresso', err);
      setErrorMessage(getApiErrorMessage(err, 'Não foi possível carregar seu progresso.'));
    }
  }, [tab, period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const tabColor = TAB_COLOR[tab];
  const progress = tab === 'run' ? runProgress : workoutProgress;
  const chart = progress?.chart ?? [];
  const maxValue = Math.max(...chart.map((point) => point.value), 1);
  // So precisa rolar quando as barras nao cabem na largura real medida
  // (mensal, ate 12 semanas) — semanal (7 dias) sempre cabe, entao as
  // barras esticam pra preencher o espaco de verdade (symmetric, sem
  // sobra assimetrica de um lado so).
  const needsScroll = chartAreaWidth > 0 && chart.length * MIN_BAR_SLOT > chartAreaWidth;
  const barsWidth = needsScroll ? chart.length * MIN_BAR_SLOT : chartAreaWidth;
  // So usado pelo grafico de linha/pontos da corrida — largura numerica por
  // ponto (em vez de flex:1 dos slots de barra), necessaria pra posicionar
  // cada ponto/rotulo em coordenadas de pixel dentro do <Svg>.
  const slotWidth = chart.length > 0 ? barsWidth / chart.length : 0;

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
          {tab === 'run' ? (
            <View style={styles.runChartWrap}>
              <View style={styles.runChartAxis}>
                {RUN_CHART_GRID_KM.map((km) => (
                  <Text
                    key={km}
                    style={[
                      styles.runAxisLabel,
                      { top: BAR_TRACK_HEIGHT * (1 - km / RUN_CHART_MAX_KM) - 6 },
                    ]}
                  >
                    {km}km
                  </Text>
                ))}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                scrollEnabled={needsScroll}
                onLayout={handleChartAreaLayout}
              >
                <View>
                  <Svg width={barsWidth} height={BAR_TRACK_HEIGHT}>
                    {RUN_CHART_GRID_KM.map((km) => {
                      const y = BAR_TRACK_HEIGHT * (1 - km / RUN_CHART_MAX_KM);
                      return (
                        <Line
                          key={km}
                          x1={0}
                          y1={y}
                          x2={barsWidth}
                          y2={y}
                          stroke={colors3.outlineVariant}
                          strokeWidth={1}
                          strokeDasharray="4,4"
                        />
                      );
                    })}
                    <Polyline
                      points={chart
                        .map((point, index) => {
                          const x = slotWidth * index + slotWidth / 2;
                          const y = BAR_TRACK_HEIGHT * (1 - Math.min(1, point.value / RUN_CHART_MAX_KM));
                          return `${x},${y}`;
                        })
                        .join(' ')}
                      fill="none"
                      stroke={tabColor.bg}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {chart.map((point, index) => {
                      const x = slotWidth * index + slotWidth / 2;
                      const y = BAR_TRACK_HEIGHT * (1 - Math.min(1, point.value / RUN_CHART_MAX_KM));
                      const isMostRecent = index === chart.length - 1;
                      const dotColor =
                        point.value === 0 ? colors3.surfaceVariant : isMostRecent ? tabColor.bg : hexToRgba(tabColor.bg, 0.7);
                      return <Circle key={point.date} cx={x} cy={y} r={isMostRecent ? 5 : 3.5} fill={dotColor} />;
                    })}
                  </Svg>
                  <View style={[styles.runChartLabelsRow, { width: barsWidth }]}>
                    {chart.map((point) => (
                      <Text key={point.date} style={[styles.barLabel, { width: slotWidth, textAlign: 'center' }]}>
                        {formatBucketLabel(point.date, progress.granularity)}
                      </Text>
                    ))}
                  </View>
                </View>
              </ScrollView>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEnabled={needsScroll}
              style={styles.chartScroll}
              onLayout={handleChartAreaLayout}
            >
              <View style={[styles.barsRow, { width: barsWidth }, !needsScroll && styles.barsRowFlexible]}>
                {chart.map((point, index) => {
                  const heightPercent = point.value > 0 ? Math.max(6, Math.round((point.value / maxValue) * 100)) : 3;
                  // Ultima barra (periodo mais recente) em destaque solido —
                  // as demais com valor > 0 ficam num tom mais suave do
                  // mesmo acento.
                  const isMostRecent = index === chart.length - 1;
                  const barColor =
                    point.value === 0 ? colors3.surfaceVariant : isMostRecent ? tabColor.bg : hexToRgba(tabColor.bg, 0.45);
                  return (
                    <View key={point.date} style={[styles.barSlot, needsScroll && styles.barSlotFixedWidth]}>
                      <View style={styles.barTrack}>
                        <View style={[styles.bar, { height: `${heightPercent}%`, backgroundColor: barColor }]} />
                      </View>
                      <Text style={styles.barLabel}>{formatBucketLabel(point.date, progress.granularity)}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {tab === 'run' ? (
            <View style={styles.statsRow}>
              <StatTile label="Distância" value={runProgress ? `${runProgress.distance_km.toFixed(1)} km` : '--'} />
              <StatTile label="Tempo" value={runProgress ? `${Math.round(runProgress.duration_minutes)} min` : '--'} />
              <StatTile
                label="Ganho de elev."
                value={runProgress ? `${Math.round(runProgress.elevation_gain_m)} m` : '--'}
              />
            </View>
          ) : (
            <View style={styles.statsRow}>
              <StatTile label="Treinos" value={workoutProgress ? `${workoutProgress.sessions_count}` : '--'} />
              <StatTile label="Séries" value={workoutProgress ? `${workoutProgress.sets_count}` : '--'} />
              <StatTile label="Volume" value={workoutProgress ? `${Math.round(workoutProgress.volume_kg)} kg` : '--'} />
            </View>
          )}
        </>
      )}

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
  tabPillTextSelected: {},

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

  // marginTop extra (alem do gap:16 do `card`) — respiro entre o toggle
  // Semanal/Mensal e o grafico, que estava "colado" antes. Total efetivo
  // ~24px (16 do gap + 8 daqui).
  chartScroll: { marginTop: spacing3.sm },

  // Grafico de linha/pontos da aba Corrida — coluna fixa de rotulos do eixo
  // Y (5km/10km) a esquerda, fora do ScrollView horizontal (nao rola junto
  // com o grafico), + area rolavel com o <Svg> a direita.
  runChartWrap: { flexDirection: 'row', marginTop: spacing3.sm },
  runChartAxis: { width: 30, height: BAR_TRACK_HEIGHT, marginRight: spacing3.xs },
  runAxisLabel: { position: 'absolute', right: 0, ...typography3.labelSm, fontSize: 9, color: colors3.outline },
  runChartLabelsRow: { flexDirection: 'row', marginTop: spacing3.xs },

  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing3.xs, height: BAR_TRACK_HEIGHT + 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.5)', paddingBottom: spacing3.sm },
  // Semanal (7 dias, sempre cabe): barras esticam (flex:1) pra preencher
  // exatamente a largura real medida do container — sem isso, a barra
  // ficava com largura fixa menor que o espaco disponivel, sobrando vao
  // assimetrico so de um lado (a largura "estimada" antiga nao batia com
  // a largura real do card). Mensal (ate 12 semanas, pode rolar): largura
  // fixa por barra, ver barSlotFixedWidth.
  barsRowFlexible: { justifyContent: 'space-between' },
  barSlot: { flex: 1, minWidth: 0, alignItems: 'center', gap: spacing3.xs },
  barSlotFixedWidth: { flex: 0, width: MIN_BAR_SLOT - spacing3.xs },
  barTrack: { width: '100%', height: BAR_TRACK_HEIGHT, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4 },
  barLabel: { ...typography3.labelSm, fontSize: 10, color: colors3.outline },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statTile: { alignItems: 'flex-start', gap: spacing3.xs },
  statLabel: { ...typography3.labelSm, fontSize: 10, color: colors3.onSurfaceVariant },
  statValue: { ...typography3.labelMd },
});
