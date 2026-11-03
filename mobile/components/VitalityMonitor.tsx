import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '@/components/Avatar';
import { HEALTHKIT_CONNECTED_KEY } from '@/components/HealthSummaryCard';
import { useAuth } from '@/context/AuthContext';
import { fetchLastNightSleepHours } from '@/services/health';
import { getTodayReadiness, Readiness } from '@/services/readiness';
import {
  VITALITY_LABELS,
  VITALITY_NO_DATA_MESSAGE,
  VitalityState,
  readinessToState,
  scoreToColor,
  scoreToPanelTint,
  scoreToPillColor,
  vitalityAccessibilityLabel,
  waveformPath,
} from '@/services/vitality';
import { getInitials } from '@/utils/text';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

const WAVE_HEIGHT = 56;
const PORTRAIT_SIZE = 64; // ate 64 o Avatar usa a miniatura
const TEXT_ON_PANEL = '#1b1b1f'; // contraste >= 7:1 sobre o painel claro (testado em services/vitality)
const WAVE_SECONDS: Record<VitalityState, number> = { fit: 3600, attention: 5200, recover: 9000, nodata: 0 };

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; readiness: Readiness };

/**
 * Vitalidade (Treino): retrato do proprio usuario + linha de eletrocardiograma, na cor do score de prontidao (vermelho -> verde). Gratuito para
 * todos. O estado SEMPRE aparece tambem em texto (Em forma / Atencao / Recuperar); a cor nunca e a unica informacao. A onda e decorativa
 * (a tela le um rotulo unico) e fica parada com "reduzir movimento" ligado no sistema. Sem dados (sono e FC ausentes) ou com erro, painel
 * neutro e retrato apagado (cinza por sobreposicao, sem biblioteca de filtro).
 */
export function VitalityMonitor() {
  const { user } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const shift = useRef(new Animated.Value(0)).current;

  const fetchData = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      let sleepHours: number | null = null;
      if (Platform.OS === 'ios') {
        const connected = (await SecureStore.getItemAsync(HEALTHKIT_CONNECTED_KEY)) === 'true';
        if (connected) {
          try {
            sleepHours = await fetchLastNightSleepHours();
          } catch {
            sleepHours = null;
          }
        }
      }
      setLoad({ kind: 'ok', readiness: await getTodayReadiness(sleepHours) });
    } catch {
      setLoad({ kind: 'error' });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const readiness = load.kind === 'ok' ? load.readiness : null;
  const state: VitalityState = load.kind === 'ok' ? readinessToState(readiness) : 'nodata';
  const hasColor = state !== 'nodata';
  const lineColor = (hasColor ? scoreToColor(readiness?.final_score) : null) ?? colors3.onSurfaceVariant;
  const panelColor = (hasColor ? scoreToPanelTint(readiness?.final_score) : null) ?? colors3.surfaceContainerHigh;
  const pillColor = hasColor ? scoreToPillColor(readiness?.final_score) : null;
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

  const label = vitalityAccessibilityLabel(state, readiness);
  const score = readiness && hasColor ? Math.round(readiness.final_score) : null;
  const indicators: { name: string; value: number | null | undefined }[] = [
    { name: 'Sono', value: readiness?.sleep_score },
    { name: 'Carga', value: readiness?.load_score },
    { name: 'FC', value: readiness?.hr_score },
  ];

  return (
    <View style={[styles.panel, { backgroundColor: panelColor, borderColor: hasColor ? lineColor : colors3.onSurfaceVariant }]} accessible accessibilityLabel={label}>
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
      <Text style={[styles.message, { color: TEXT_ON_PANEL }]}>{hasColor ? readiness?.recommendation_text ?? '' : VITALITY_NO_DATA_MESSAGE}</Text>
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
  message: { ...typography3.bodyMd, fontSize: 14, lineHeight: 20 },
  retry: { borderRadius: radius3.pill, borderWidth: 1, borderColor: colors3.primary, paddingHorizontal: spacing3.md, paddingVertical: 6 },
  retryText: { ...typography3.bodyMd, fontSize: 14, fontWeight: '700', color: colors3.primary },
});
