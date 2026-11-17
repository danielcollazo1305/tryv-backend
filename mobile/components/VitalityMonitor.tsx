import React, { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/context/AuthContext';
import { useVitality } from '@/hooks/useVitality';
import {
  VITALITY_LABELS,
  VITALITY_NO_DATA_MESSAGE,
  VitalityState,
  scoreToColor,
  scoreToPanelTint,
  scoreToPillColor,
  waveformPath,
} from '@/services/vitality';
import { VITALITY_DISCLAIMER, VITALITY_PROVISIONAL_NOTE, vitalityAccessibilityLabel, vitalityRecommendation } from '@/services/vitalityView';
import { getInitials } from '@/utils/text';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

const WAVE_HEIGHT = 56;
const PORTRAIT_SIZE = 64; // ate 64 o Avatar usa a miniatura
const TEXT_ON_PANEL = '#1b1b1f'; // contraste >= 7:1 sobre o painel claro (testado em services/vitality)
const WAVE_SECONDS: Record<VitalityState, number> = { fit: 3600, attention: 5200, recover: 9000, nodata: 0 };

/**
 * Vitalidade (Treino): retrato do proprio usuario + linha de eletrocardiograma, na cor do score de prontidao (vermelho -> verde). Gratuito para
 * todos. O estado SEMPRE aparece tambem em texto (Em forma / Atencao / Recuperar); a cor nunca e a unica informacao. A onda e decorativa
 * (a tela le um rotulo unico) e fica parada com "reduzir movimento" ligado no sistema. Sem dados (sono e FC ausentes) ou com erro, painel
 * neutro e retrato apagado (cinza por sobreposicao, sem biblioteca de filtro).
 */
export function VitalityMonitor() {
  const { user } = useAuth();
  const [width, setWidth] = useState(0);
  const shift = useRef(new Animated.Value(0)).current;
  const { load, fetchData, reduceMotion, vitality, state } = useVitality();
  const hasColor = state !== 'nodata';
  const lineColor = (hasColor ? scoreToColor(vitality?.score) : null) ?? colors3.onSurfaceVariant;
  const panelColor = (hasColor ? scoreToPanelTint(vitality?.score) : null) ?? colors3.surfaceContainerHigh;
  const pillColor = hasColor ? scoreToPillColor(vitality?.score) : null;
  const duration = WAVE_SECONDS[state];
  const animate = hasColor && !reduceMotion && width > 0 && load.kind === 'ok';

  useEffect(() => {
    shift.setValue(0);
    if (!animate) return;
    const loop = Animated.loop(Animated.timing(shift, { toValue: -width, duration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
    };
  }, [animate, duration, shift, width]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };

  const portrait = (
    <View style={[styles.portraitWrap, { borderColor: lineColor }]}>
      <Avatar initials={user ? getInitials(user.name) : '?'} imageUrl={user?.avatar_url} thumbUrl={user?.avatar_thumb_url} size={PORTRAIT_SIZE} style={hasColor ? undefined : styles.portraitDim} />
      {!hasColor && <View pointerEvents="none" style={styles.grayOverlay} />}
    </View>
  );

  if (load.kind === 'loading') {
    return (
      <View style={[styles.panel, styles.loadingPanel, { backgroundColor: panelColor, borderColor: colors3.surfaceContainerHigh }]}>
        <ActivityIndicator size="small" color={colors3.primary} />
      </View>
    );
  }

  const wave = (
    <View style={styles.waveBox} onLayout={onLayout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {width > 0 && (
        <Animated.View style={{ width: width * 2, transform: [{ translateX: shift }] }}>
          <Svg width={width * 2} height={WAVE_HEIGHT}>
            <Path d={waveformPath(state, width, WAVE_HEIGHT, 2)} stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );

  if (load.kind === 'error') {
    return (
      <View style={[styles.panel, { backgroundColor: panelColor, borderColor: colors3.onSurfaceVariant }]}>
        <View style={styles.row}>
          {portrait}
          <View style={styles.info}>
            <Text style={styles.title}>Vitalidade</Text>
            <Text style={[styles.message, { color: TEXT_ON_PANEL }]}>Não foi possível carregar</Text>
            <Pressable onPress={fetchData} accessibilityRole="button" accessibilityLabel="Tentar de novo" style={styles.retry} hitSlop={8}>
              <Text style={styles.retryText}>Tentar de novo</Text>
            </Pressable>
          </View>
        </View>
        {wave}
      </View>
    );
  }

  const label = vitalityAccessibilityLabel(state, vitality?.score, vitality?.indicators, vitality?.provisional);
  const score = vitality && hasColor && vitality.score !== null ? Math.round(vitality.score) : null;
  const indicators: { name: string; value: number | null | undefined }[] = [
    { name: 'Sono', value: vitality?.indicators.sleep },
    { name: 'Carga', value: vitality?.indicators.load },
    { name: 'FC', value: vitality?.indicators.hr },
  ];

  return (
    <View style={[styles.panel, { backgroundColor: panelColor, borderColor: hasColor ? lineColor : colors3.onSurfaceVariant }]} accessible={hasColor} accessibilityLabel={hasColor ? label : undefined}>
      <View style={styles.row}>
        {portrait}
        <View style={styles.info}>
          <Text style={styles.title}>Vitalidade</Text>
          {hasColor && pillColor ? (
            <View style={[styles.pill, { backgroundColor: pillColor }]}>
              <Text style={styles.pillText}>
                {VITALITY_LABELS[state]}
                {score !== null ? ` · ${score}` : ''}
              </Text>
            </View>
          ) : (
            <Text style={[styles.stateNeutral, { color: TEXT_ON_PANEL }]}>{VITALITY_LABELS.nodata}</Text>
          )}
        </View>
      </View>
      {wave}
      <View style={styles.indicators}>
        {indicators.map((item) => (
          <View key={item.name} style={styles.indicator}>
            <Text style={[styles.indicatorName, { color: TEXT_ON_PANEL }]}>{item.name}</Text>
            <Text style={[styles.indicatorValue, { color: TEXT_ON_PANEL }]}>{typeof item.value === 'number' && Number.isFinite(item.value) ? Math.round(item.value) : '—'}</Text>
          </View>
        ))}
      </View>
      {hasColor ? (
        <View style={styles.notes}>
          <Text style={[styles.message, { color: TEXT_ON_PANEL }]}>{vitalityRecommendation(state)}</Text>
          {!!vitality?.provisional && <Text style={[styles.note, { color: TEXT_ON_PANEL }]}>{VITALITY_PROVISIONAL_NOTE}</Text>}
          <Text style={[styles.note, { color: TEXT_ON_PANEL }]}>{VITALITY_DISCLAIMER}</Text>
        </View>
      ) : (
        <Pressable onPress={() => router.push('/activity')} accessibilityRole="button" accessibilityLabel={`${VITALITY_NO_DATA_MESSAGE}. Abre a tela de conexão.`} hitSlop={8}>
          <Text style={[styles.message, styles.messageLink, { color: TEXT_ON_PANEL }]}>{VITALITY_NO_DATA_MESSAGE}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius3.xl, borderWidth: 2, padding: spacing3.md, gap: spacing3.sm },
  loadingPanel: { minHeight: 96, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  portraitWrap: { borderWidth: 3, borderRadius: radius3.lg, overflow: 'hidden' },
  portraitDim: { opacity: 0.6 },
  grayOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(128,128,128,0.65)' },
  info: { flex: 1, gap: spacing3.xs, alignItems: 'flex-start' },
  title: { ...typography3.headlineMd, fontSize: 16, lineHeight: 20, color: TEXT_ON_PANEL },
  pill: { borderRadius: radius3.pill, paddingHorizontal: spacing3.md, paddingVertical: 4 },
  pillText: { ...typography3.bodyMd, fontSize: 14, fontWeight: '700', color: '#ffffff' },
  stateNeutral: { ...typography3.bodyMd, fontSize: 14, fontWeight: '700' },
  waveBox: { height: WAVE_HEIGHT, overflow: 'hidden' },
  indicators: { flexDirection: 'row', gap: spacing3.sm },
  indicator: { flex: 1, alignItems: 'center' },
  indicatorName: { ...typography3.labelSm, textTransform: 'none' },
  indicatorValue: { ...typography3.headlineMd, fontSize: 18 },
  messageLink: { textDecorationLine: 'underline', fontWeight: '700' },
  message: { ...typography3.bodyMd, fontSize: 14, lineHeight: 20 },
  notes: { gap: 2 },
  note: { ...typography3.labelSm, textTransform: 'none', fontSize: 12, lineHeight: 16 },
  retry: { borderRadius: radius3.pill, borderWidth: 1, borderColor: colors3.primary, paddingHorizontal: spacing3.md, paddingVertical: 6 },
  retryText: { ...typography3.bodyMd, fontSize: 14, fontWeight: '700', color: colors3.primary },
});
