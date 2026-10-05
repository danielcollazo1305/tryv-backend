import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import Svg, { Circle, Line, Polygon, Text as SvgText, TSpan } from 'react-native-svg';

import { GlassCard } from '@/components/GlassCard';
import { OverallStats, getOverallStats } from '@/services/overall';
import { colors3, spacing3 } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Nivel (carta de jogador) a partir do overall
// ---------------------------------------------------------------------------

export interface Tier {
  key: 'ELITE' | 'OURO' | 'PRATA' | 'BRONZE';
  label: string;
  /** Nome por extenso, pra leitura em voz alta (leitor de tela). */
  spoken: string;
  /** Degrade da barrinha sob o avatar. */
  gradient: readonly [string, string];
  /** Cor da bolinha ao lado do nome do nivel. */
  dot: string;
}

/** ELITE >= 90, OURO 75-89, PRATA 50-74, BRONZE < 50. */
export function getTier(overall: number): Tier {
  if (overall >= 90) return { key: 'ELITE', label: 'ELITE', spoken: 'Elite', gradient: ['#F3E8FF', '#A78BFA'], dot: '#A78BFA' };
  if (overall >= 75) return { key: 'OURO', label: 'OURO', spoken: 'Ouro', gradient: ['#FDE68A', '#D4A017'], dot: '#F5C542' };
  if (overall >= 50) return { key: 'PRATA', label: 'PRATA', spoken: 'Prata', gradient: ['#F1F5F9', '#94A3B8'], dot: '#CBD5E1' };
  return { key: 'BRONZE', label: 'BRONZE', spoken: 'Bronze', gradient: ['#FDBA74', '#B45309'], dot: '#F59E0B' };
}

// ---------------------------------------------------------------------------
// Radar (react-native-svg)
// ---------------------------------------------------------------------------

const VIEWBOX_W = 164;
const VIEWBOX_H = 134;
const CX = 82;
const CY = 70;
const R = 34; // raio pra 100 pontos

const clamp100 = (value: number) => Math.max(0, Math.min(100, value));

/** TOPO = força, DIREITA = resistência, BAIXO = disciplina, ESQUERDA = consistência. */
function radarPoints(stats: OverallStats | null): string {
  const f = clamp100(stats?.forca ?? 0);
  const r = clamp100(stats?.resistencia ?? 0);
  const d = clamp100(stats?.disciplina ?? 0);
  const c = clamp100(stats?.consistencia ?? 0);
  return [
    [CX, CY - (R * f) / 100],
    [CX + (R * r) / 100, CY],
    [CX, CY + (R * d) / 100],
    [CX - (R * c) / 100, CY],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
}

function diamond(scale: number): string {
  const k = R * scale;
  return `${CX},${CY - k} ${CX + k},${CY} ${CX},${CY + k} ${CX - k},${CY}`;
}

const LABEL_NAME_FILL = 'rgba(255,255,255,0.65)';
const FONT_MEDIUM = 'Inter_500Medium';
const FONT_BOLD = 'Inter_700Bold';
const FONT_EXTRABOLD = 'Inter_800ExtraBold';
const FONT_SEMIBOLD = 'Inter_600SemiBold';

function AxisLabel({
  x,
  y,
  anchor,
  name,
  value,
}: {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  name: string;
  value: number;
}) {
  return (
    <SvgText x={x} y={y} fontSize={10} textAnchor={anchor}>
      <TSpan fill={LABEL_NAME_FILL} fontFamily={FONT_MEDIUM}>
        {name}{' '}
      </TSpan>
      <TSpan fill="#FFFFFF" fontFamily={FONT_BOLD}>
        {value}
      </TSpan>
    </SvgText>
  );
}

/** Grade + eixos + (se houver dados) poligono e rotulos. Sem `stats`, so a moldura (carregando/erro). */
function Radar({ stats }: { stats: OverallStats | null }) {
  return (
    <Svg width="100%" viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} style={styles.radarSvg}>
      <Circle cx={CX} cy={CY} r={42} fill="rgba(0,0,0,0.28)" />
      <Polygon points={diamond(1)} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
      <Polygon points={diamond(0.5)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      <Line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
      <Line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
      {stats && (
        <>
          <Polygon
            points={radarPoints(stats)}
            fill="rgba(167,139,250,0.4)"
            stroke="#C4B5FD"
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <AxisLabel x={82} y={14} anchor="middle" name="FOR" value={stats.forca} />
          <AxisLabel x={128} y={74} anchor="start" name="RES" value={stats.resistencia} />
          <AxisLabel x={82} y={126} anchor="middle" name="DIS" value={stats.disciplina} />
          <AxisLabel x={36} y={74} anchor="end" name="CON" value={stats.consistencia} />
        </>
      )}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Detalhes dos atributos (abaixo do card)
// ---------------------------------------------------------------------------

type AttributeKey = Exclude<keyof OverallStats, 'overall'>;

const ATTRIBUTES: { key: AttributeKey; label: string; hint: string }[] = [
  { key: 'forca', label: 'Força', hint: 'volume de carga semanal' },
  { key: 'resistencia', label: 'Resistência', hint: 'km de corrida no mês' },
  { key: 'consistencia', label: 'Consistência', hint: 'dias treinados' },
  { key: 'disciplina', label: 'Disciplina', hint: 'dias batendo a meta' },
];

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface OverallCardProps {
  /** Nome do usuario -- SEMPRE exibido, mesmo carregando ou com erro. */
  name: string;
  /**
   * Avatar ja pronto, passado pelo Perfil (o Pressable com o badge de camera que abre a
   * troca/geracao de avatar), pra o card nao perder esse comportamento. Renderizado
   * dentro de um slot de 64 px; o proprio elemento define o circulo/borda.
   */
  avatar: React.ReactNode;
}

const AVATAR_SIZE = 64;

/**
 * Carta de jogador do Overall (GET /dashboard/overall, ultimos 30 dias): nivel,
 * avatar e nome a esquerda, o numero overall no centro e o radar dos 4 atributos
 * a direita; abaixo, os detalhes de cada atributo. Recarrega a cada foco da aba
 * (o Perfil fica montado na tab bar); so mostra o spinner enquanto nao ha dado
 * nenhum, pra nao piscar no refoco.
 *
 * Identidade nunca some: avatar e nome nao dependem da requisicao. Carregando ->
 * "--" e radar vazio com spinner; erro -> mensagem curta + "Tentar de novo" no
 * lugar do radar. Tudo 0 (sem atividade) mostra 0 e BRONZE normalmente.
 */
export function OverallCard({ name, avatar }: OverallCardProps) {
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setFailed(false);
    getOverallStats()
      .then((data) => {
        if (active) setStats(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  const overall = stats ? clamp100(stats.overall) : null;
  const tier = getTier(overall ?? 0);
  const showError = !stats && failed;
  const showSpinner = !stats && !failed;

  // Rotulo do grupo "numero + radar" (o avatar fica fora, pra continuar focavel como botao).
  const summary = stats
    ? `Overall ${stats.overall}, nível ${tier.spoken}. ` +
      `Força ${stats.forca}, Resistência ${stats.resistencia}, Consistência ${stats.consistencia}, Disciplina ${stats.disciplina}.`
    : showError
      ? 'Overall indisponível no momento.'
      : 'Carregando overall.';

  return (
    <View>
      <View style={styles.shadowWrap}>
        <LinearGradient
          colors={['#2A1B52', '#1B1236', '#140D2B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {/* Brilho roxo no canto superior direito (so o que o expo-linear-gradient permite). */}
          <LinearGradient
            colors={['rgba(139,92,246,0.35)', 'rgba(139,92,246,0)']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0.35, y: 0.65 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Coluna esquerda: nivel, avatar, barra do nivel, nome */}
          <View style={styles.leftCol}>
            <View style={styles.tierRow}>
              <View style={[styles.tierDot, { backgroundColor: tier.dot }]} />
              <Text style={styles.tierText}>{tier.label}</Text>
            </View>
            <View style={styles.avatarSlot}>{avatar}</View>
            <LinearGradient colors={[...tier.gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tierBar} />
            <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {name}
            </Text>
          </View>

          {/* Centro + direita: numero overall e radar */}
          <View style={styles.statsGroup} accessible accessibilityLabel={summary}>
            <View style={styles.centerCol}>
              <Text style={styles.overallValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                {overall ?? '--'}
              </Text>
              <Text style={styles.overallLabel}>OVERALL</Text>
            </View>

            <View style={styles.rightCol}>
              {showError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>Não foi possível carregar.</Text>
                  <Pressable onPress={load} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.retryText}>Tentar de novo</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Radar stats={stats} />
                  {showSpinner && (
                    <View style={styles.radarSpinner} pointerEvents="none">
                      <ActivityIndicator color="#C4B5FD" />
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </LinearGradient>
      </View>

      {stats && (
        <View style={styles.details}>
          <Text style={styles.detailsTitle}>DETALHES DOS ATRIBUTOS</Text>
          <GlassCard variant="glass" padding={spacing3.md} style={styles.detailsCard}>
            {ATTRIBUTES.map(({ key, label, hint }) => (
              <View key={key} style={styles.detailRow}>
                <View style={styles.detailTexts}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailHint}>{hint}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${clamp100(stats[key])}%` }]} />
                </View>
                <Text style={styles.detailValue}>{stats[key]}</Text>
              </View>
            ))}
          </GlassCard>
          <Text style={styles.footnote}>Últimos 30 dias</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Sombra suave roxa no wrapper (o gradiente tem overflow:hidden, que cortaria a sombra).
  shadowWrap: {
    borderRadius: 24,
    backgroundColor: '#1B1236',
    shadowColor: '#6B38D4',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    paddingLeft: 14,
    paddingRight: 10,
    paddingBottom: 10,
  },

  leftCol: { width: 76, alignItems: 'center' },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  tierDot: { width: 7, height: 7, borderRadius: 3.5 },
  tierText: { fontFamily: FONT_EXTRABOLD, fontSize: 10, letterSpacing: 1, color: '#FFFFFF' },
  avatarSlot: { width: AVATAR_SIZE, height: AVATAR_SIZE, alignItems: 'center', justifyContent: 'center' },
  tierBar: { width: 64, height: 4, borderRadius: 2, marginTop: 7 },
  name: { fontFamily: FONT_EXTRABOLD, fontSize: 14, color: '#FFFFFF', marginTop: 6, maxWidth: 76, textAlign: 'center' },

  statsGroup: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  centerCol: { width: 62, alignItems: 'center' },
  overallValue: {
    fontFamily: FONT_EXTRABOLD,
    fontSize: 54,
    lineHeight: 60,
    letterSpacing: -1.6,
    color: '#FFFFFF',
    width: 62,
    textAlign: 'center',
  },
  overallLabel: { fontFamily: FONT_BOLD, fontSize: 9, letterSpacing: 1.26, color: 'rgba(255,255,255,0.55)', marginTop: 2 },

  rightCol: { flex: 1, justifyContent: 'center' },
  radarSvg: { width: '100%', aspectRatio: VIEWBOX_W / VIEWBOX_H },
  radarSpinner: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  errorBox: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 4 },
  errorText: { fontFamily: FONT_MEDIUM, fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  retryText: { fontFamily: FONT_BOLD, fontSize: 12, color: '#C4B5FD' },

  details: { marginTop: spacing3.md, gap: spacing3.sm },
  detailsTitle: { fontFamily: FONT_EXTRABOLD, fontSize: 11, letterSpacing: 1.1, color: colors3.primary },
  detailsCard: { gap: spacing3.md },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  detailTexts: { width: 136 },
  detailLabel: { fontFamily: FONT_SEMIBOLD, fontSize: 13, color: colors3.onSurface },
  detailHint: { fontFamily: FONT_MEDIUM, fontSize: 11, color: colors3.onSurfaceVariant },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors3.surfaceContainerHigh, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors3.primary },
  detailValue: { fontFamily: FONT_BOLD, fontSize: 13, color: colors3.onSurface, width: 28, textAlign: 'right' },
  footnote: { fontFamily: FONT_MEDIUM, fontSize: 11, color: colors3.onSurfaceVariant, textAlign: 'center' },
});
