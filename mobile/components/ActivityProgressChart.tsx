import React, { useId, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { ActivityProgressTab } from '@/components/useActivityProgress';
import { ProgressChartPoint, ProgressGranularity, RunProgress, WorkoutProgress } from '@/services/dashboard';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

const MIN_BAR_SLOT = 34;
/** Altura padrao (card compacto da Home) — app/activity/progress.tsx passa um valor maior, ver prop `barTrackHeight`. */
const DEFAULT_BAR_TRACK_HEIGHT = 160;

// Teto FIXO do eixo Y do grafico de distancia de corrida (nao o de
// Musculacao, que continua em barra com auto-escala) — corrige o grafico
// mostrando uma corrida de 1km como se fosse quase 100% da altura quando e
// o unico ponto > 0 na janela visivel. Com escala fixa, 1km fica
// proporcionalmente pequeno e 15km fica grande de verdade, sem depender do
// maximo daquele dia/semana especifico. Vale pros dois toggles (Semanal e
// Mensal) — no Mensal os pontos sao soma semanal, entao uma semana muito
// ativa pode encostar no teto (nao quebra, so nao sobe mais que isso).
const RUN_CHART_MAX_KM = 12;
const RUN_CHART_GRID_KM = [5, 10];

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

/** Mesmo utilitario de HealthMetricsGrid/HealthWeeklyBarChart — cores de metrica sao hex fixo. */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

interface ChartPathPoint {
  x: number;
  y: number;
}

/**
 * Interpolacao cubica MONOTONA (Hermite/Fritsch-Carlson, mesma familia da
 * curveMonotoneX do d3) entre os pontos do grafico de corrida — curva suave
 * em vez do <Polyline> reto de antes, mas sem o overshoot que uma spline
 * Catmull-Rom "pura" pode produzir com poucos pontos preenchidos (ex: so 1
 * de 7 dias com corrida — um pico isolado cercado de zeros faria uma
 * Catmull-Rom comum "mergulhar" abaixo da linha de base ou passar por cima
 * do pico entre os pontos, ficando visualmente errado). Monotona garante
 * que a curva entre dois pontos nunca ultrapassa o valor de nenhum dos
 * dois — seguro por construcao pra esse cenario de dado esparso, que e
 * justamente o pedido explicito de teste desta tarefa.
 */
function monotoneCubicPath(points: ChartPathPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const n = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push(dx[i] === 0 ? 0 : (points[i + 1].y - points[i].y) / dx[i]);
  }

  const tangent: number[] = new Array(n).fill(0);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] === 0 || slope[i] === 0 || slope[i - 1] * slope[i] < 0) {
      tangent[i] = 0;
    } else {
      tangent[i] = (slope[i - 1] + slope[i]) / 2;
    }
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = p0.x + dx[i] / 3;
    const cp1y = p0.y + (tangent[i] * dx[i]) / 3;
    const cp2x = p1.x - dx[i] / 3;
    const cp2y = p1.y - (tangent[i + 1] * dx[i]) / 3;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

interface ActivityProgressChartProps {
  tab: ActivityProgressTab;
  progress: RunProgress | WorkoutProgress | null;
  tabColor: { bg: string; text: string };
  /** Altura da area do grafico — maior na pagina cheia (mais espaco vertical), compacta por padrao no card da Home. */
  barTrackHeight?: number;
}

/**
 * Grafico de linha/pontos (Corrida, eixo Y fixo em 12km) ou barras
 * (Musculacao, auto-escala) do progresso — extraido do antigo
 * ActivityProgressCard.tsx nesta tarefa pra ser compartilhado entre o card
 * compacto da Home e a pagina cheia (app/activity/progress.tsx). A medicao
 * de largura real do container (onLayout) mora aqui dentro — cada
 * consumidor so precisa passar `progress`, sem gerenciar layout.
 */
export function ActivityProgressChart({ tab, progress, tabColor, barTrackHeight = DEFAULT_BAR_TRACK_HEIGHT }: ActivityProgressChartProps) {
  // Largura real do container do grafico, medida via onLayout — uma
  // largura "estimada" a partir de SCREEN_WIDTH e uma formula de margens
  // nao bate com a largura real do card (GlassCard tem seu proprio
  // padding, nao contabilizado numa conta assim), sobrando espaco
  // assimetrico de um lado so. Medindo o container de verdade, as barras
  // sempre preenchem exatamente o espaco disponivel.
  const [chartAreaWidth, setChartAreaWidth] = useState(0);
  const handleChartAreaLayout = (event: LayoutChangeEvent) => {
    setChartAreaWidth(event.nativeEvent.layout.width);
  };
  // Id estavel por instancia do componente -- evita colisao de id de
  // <LinearGradient> se por algum motivo mais de um ActivityProgressChart
  // acabar montado na tela ao mesmo tempo (nenhum caso hoje usa 2 juntos,
  // mas um id fixo tipo "runFill" seria uma pegadinha esperando acontecer).
  const gradientId = useId();

  const chart = progress?.chart ?? [];
  const maxValue = Math.max(...chart.map((point: ProgressChartPoint) => point.value), 1);
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

  // So usado pela aba Corrida, mas calculado aqui em cima (fora do JSX) por
  // legibilidade -- barato o suficiente pra nao precisar de useMemo, e o
  // componente ja recalcula tudo isso a cada render de qualquer forma.
  const runPoints: ChartPathPoint[] = chart.map((point, index) => ({
    x: slotWidth * index + slotWidth / 2,
    y: barTrackHeight * (1 - Math.min(1, point.value / RUN_CHART_MAX_KM)),
  }));
  const runLinePath = monotoneCubicPath(runPoints);
  // Fecha a curva ate a linha de base (0km) e volta pro inicio -- mesmo
  // path da linha, so com 2 segmentos retos extras pra fechar a area
  // preenchida (a curva em si nao muda).
  const runAreaPath =
    runPoints.length > 0
      ? `${runLinePath} L ${runPoints[runPoints.length - 1].x} ${barTrackHeight} L ${runPoints[0].x} ${barTrackHeight} Z`
      : '';

  if (!progress) return null;

  if (tab === 'run') {
    return (
      <View style={styles.runChartWrap}>
        <View style={[styles.runChartAxis, { height: barTrackHeight }]}>
          {RUN_CHART_GRID_KM.map((km) => (
            <Text
              key={km}
              style={[styles.runAxisLabel, { top: barTrackHeight * (1 - km / RUN_CHART_MAX_KM) - 6 }]}
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
            <Svg width={barsWidth} height={barTrackHeight}>
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={tabColor.bg} stopOpacity={0.32} />
                  <Stop offset="1" stopColor={tabColor.bg} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {/* Linhas de referencia (5km/10km) discretas -- opacidade baixa de proposito, pra nao competir com a curva de dados. */}
              {RUN_CHART_GRID_KM.map((km) => {
                const y = barTrackHeight * (1 - km / RUN_CHART_MAX_KM);
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
                    opacity={0.5}
                  />
                );
              })}

              {!!runAreaPath && <Path d={runAreaPath} fill={`url(#${gradientId})`} />}
              {!!runLinePath && (
                <Path d={runLinePath} fill="none" stroke={tabColor.bg} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              )}

              {runPoints.map((point, index) => {
                const isMostRecent = index === chart.length - 1;
                if (!isMostRecent) return null;
                // Halo sutil atras do ponto mais recente -- circulo maior e translucido, so pra chamar atencao sem virar um circulo solido gigante.
                return <Circle key={`halo-${chart[index].date}`} cx={point.x} cy={point.y} r={11} fill={hexToRgba(tabColor.bg, 0.18)} />;
              })}
              {runPoints.map((point, index) => {
                const value = chart[index].value;
                const isMostRecent = index === chart.length - 1;
                const dotColor = value === 0 ? colors3.surfaceVariant : isMostRecent ? tabColor.bg : hexToRgba(tabColor.bg, 0.7);
                return <Circle key={chart[index].date} cx={point.x} cy={point.y} r={isMostRecent ? 5 : 3.5} fill={dotColor} />;
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
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEnabled={needsScroll}
      style={styles.chartScroll}
      onLayout={handleChartAreaLayout}
    >
      <View style={[styles.barsRow, { width: barsWidth, height: barTrackHeight + 24 }, !needsScroll && styles.barsRowFlexible]}>
        {chart.map((point, index) => {
          const heightPercent = point.value > 0 ? Math.max(6, Math.round((point.value / maxValue) * 100)) : 3;
          // Ultima barra (periodo mais recente) em destaque solido — as
          // demais com valor > 0 ficam num tom mais suave do mesmo acento.
          const isMostRecent = index === chart.length - 1;
          const barColor =
            point.value === 0 ? colors3.surfaceVariant : isMostRecent ? tabColor.bg : hexToRgba(tabColor.bg, 0.45);
          return (
            <View key={point.date} style={[styles.barSlot, needsScroll && styles.barSlotFixedWidth]}>
              <View style={[styles.barTrack, { height: barTrackHeight }]}>
                <View style={[styles.bar, { height: `${heightPercent}%`, backgroundColor: barColor }]} />
              </View>
              <Text style={styles.barLabel}>{formatBucketLabel(point.date, progress.granularity)}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
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

interface ActivityProgressStatsProps {
  tab: ActivityProgressTab;
  runProgress: RunProgress | null;
  workoutProgress: WorkoutProgress | null;
}

/**
 * Musculacao nao tem Tempo/Calorias reais (workout_sessions.duration_minutes/
 * calories_burned existem como coluna mas nenhum fluxo do app preenche
 * isso hoje — falta um cronometro na tela de treino, ver investigacao) —
 * as 3 estatisticas viraram Treinos/Series/Volume, decisao tomada com o
 * usuario, tudo derivado do que de fato e gravado nas series completadas
 * de cada sessao.
 */
export function ActivityProgressStats({ tab, runProgress, workoutProgress }: ActivityProgressStatsProps) {
  if (tab === 'run') {
    return (
      <View style={styles.statsRow}>
        <StatTile label="Distância" value={runProgress ? `${runProgress.distance_km.toFixed(1)} km` : '--'} />
        <StatTile label="Tempo" value={runProgress ? `${Math.round(runProgress.duration_minutes)} min` : '--'} />
        <StatTile
          label="Ganho de elev."
          value={runProgress ? `${Math.round(runProgress.elevation_gain_m)} m` : '--'}
        />
      </View>
    );
  }
  return (
    <View style={styles.statsRow}>
      <StatTile label="Treinos" value={workoutProgress ? `${workoutProgress.sessions_count}` : '--'} />
      <StatTile label="Séries" value={workoutProgress ? `${workoutProgress.sets_count}` : '--'} />
      <StatTile label="Volume" value={workoutProgress ? `${Math.round(workoutProgress.volume_kg)} kg` : '--'} />
    </View>
  );
}

const styles = StyleSheet.create({
  // marginTop extra (alem do gap:16 do container do consumidor) — respiro
  // entre o toggle Semanal/Mensal e o grafico, que estava "colado" antes.
  chartScroll: { marginTop: spacing3.sm },

  // Grafico de linha/pontos da aba Corrida — coluna fixa de rotulos do eixo
  // Y (5km/10km) a esquerda, fora do ScrollView horizontal (nao rola junto
  // com o grafico), + area rolavel com o <Svg> a direita.
  runChartWrap: { flexDirection: 'row', marginTop: spacing3.sm },
  runChartAxis: { width: 30, marginRight: spacing3.xs },
  runAxisLabel: { position: 'absolute', right: 0, ...typography3.labelSm, fontSize: 9, color: colors3.outline },
  runChartLabelsRow: { flexDirection: 'row', marginTop: spacing3.xs },

  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing3.xs, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.5)', paddingBottom: spacing3.sm },
  // Semanal (7 dias, sempre cabe): barras esticam (flex:1) pra preencher
  // exatamente a largura real medida do container — sem isso, a barra
  // ficava com largura fixa menor que o espaco disponivel, sobrando vao
  // assimetrico so de um lado (a largura "estimada" antiga nao batia com
  // a largura real do card). Mensal (ate 12 semanas, pode rolar): largura
  // fixa por barra, ver barSlotFixedWidth.
  barsRowFlexible: { justifyContent: 'space-between' },
  barSlot: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: spacing3.xs },
  // flexGrow/flexShrink/flexBasis explicitos (em vez do atalho "flex: 0") --
  // no react-native-web, "flex: 0" pode ser resolvido como flex-basis:0%,
  // que no eixo principal (row) sobrepoe a "width" explicita e colapsa a
  // barra pra largura zero (bug pre-existente, achado ao validar o toggle
  // Mensal+Musculacao nesta tarefa -- reproduz identico no card da Home,
  // entao nao e regressao desta extracao, so nunca tinha sido visto).
  barSlotFixedWidth: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: MIN_BAR_SLOT - spacing3.xs },
  barTrack: { width: '100%', justifyContent: 'flex-end' },
  // So os cantos do topo arredondados (radius3.sm, mesmo token do grafico
  // de refeicoes) -- a barra fica sentada na linha de base de baixo
  // (barsRow tem borderBottomWidth), entao arredondar tambem os cantos de
  // baixo deixava uma friestinha da linha de base espiando por tras deles.
  bar: { width: '100%', borderTopLeftRadius: radius3.sm, borderTopRightRadius: radius3.sm },
  barLabel: { ...typography3.labelSm, fontSize: 10, color: colors3.outline },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statTile: { alignItems: 'flex-start', gap: spacing3.xs },
  statLabel: { ...typography3.labelSm, fontSize: 10, color: colors3.onSurfaceVariant },
  statValue: { ...typography3.labelMd },
});
