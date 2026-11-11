import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { RetroText } from '@/components/retro/RetroText';
import { RETRO } from '@/components/retro/retroTheme';
import { useVitality } from '@/hooks/useVitality';
import {
  VITALITY_LABELS,
  VITALITY_NO_DATA_MESSAGE,
  VitalityState,
  scoreToColorOnDark,
  vitalityAccessibilityLabel,
  waveformPath,
} from '@/services/vitality';

const WAVE_HEIGHT = 36;
const WAVE_SECONDS: Record<VitalityState, number> = { fit: 3600, attention: 5200, recover: 9000, nodata: 0 };

/**
 * Vitalidade no tema retro (tela Treinar): mesmos dados do card da tela Treino (hook useVitality), em painel escuro com fonte pixel. O estado
 * SEMPRE aparece em texto (cor so reforca; a cor do score usa luminosidade propria para fundo escuro). A onda e decorativa e para com
 * "reduzir movimento". Sem dados, a mensagem "Conecte o Apple Health" leva ao card de conexao (/activity).
 */
export function RetroVitality() {
  const { load, fetchData, reduceMotion, readiness, state } = useVitality();
  const [width, setWidth] = useState(0);
  const shift = useRef(new Animated.Value(0)).current;

  const hasColor = state !== 'nodata';
  const color = (hasColor ? scoreToColorOnDark(readiness?.final_score) : null) ?? RETRO.textDim;
  const animate = hasColor && !reduceMotion && width > 0 && load.kind === 'ok';
  const duration = WAVE_SECONDS[state];

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

  if (load.kind === 'loading') {
    return (
      <View style={[styles.panel, styles.center]}>
        <ActivityIndicator size="small" color={RETRO.accent} />
      </View>
    );
  }

  const wave = (
    <View style={styles.waveBox} onLayout={onLayout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {width > 0 && (
        <Animated.View style={{ width: width * 2, transform: [{ translateX: shift }] }}>
          <Svg width={width * 2} height={WAVE_HEIGHT}>
            <Path d={waveformPath(state, width, WAVE_HEIGHT, 2)} stroke={color} strokeWidth={2} strokeLinecap="square" strokeLinejoin="miter" fill="none" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );

  if (load.kind === 'error') {
    return (
      <View style={styles.panel}>
        <RetroText size={8} color={RETRO.textDim}>Vitalidade</RetroText>
        {wave}
        <Pressable onPress={fetchData} accessibilityRole="button" accessibilityLabel="Tentar de novo" style={styles.link}>
          <RetroText size={8} color={RETRO.danger}>Não foi possível carregar. Tentar de novo</RetroText>
        </Pressable>
      </View>
    );
  }

  const score = readiness && hasColor ? Math.round(readiness.final_score) : null;
  const rows: { name: string; value: number | null | undefined }[] = [
    { name: 'Sono', value: readiness?.sleep_score },
    { name: 'Carga', value: readiness?.load_score },
    { name: 'FC', value: readiness?.hr_score },
  ];

  return (
    <View style={styles.panel} accessible={!hasColor} accessibilityLabel={hasColor ? undefined : vitalityAccessibilityLabel(state, readiness)}>
      <View
        style={styles.header}
        accessible={hasColor}
        accessibilityLabel={hasColor ? vitalityAccessibilityLabel(state, readiness) : undefined}
      >
        <RetroText size={8} color={RETRO.textDim}>Vitalidade</RetroText>
        <RetroText size={9} color={color}>
          {`${VITALITY_LABELS[state]}${score !== null ? ` · ${score}` : ''}`}
        </RetroText>
      </View>
      {wave}
      {hasColor &&
        rows.map((item) => (
          <View key={item.name} style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <RetroText size={8} color={RETRO.textDim}>{item.name}</RetroText>
            <RetroText size={9}>
              {typeof item.value === 'number' && Number.isFinite(item.value) ? String(Math.round(item.value)) : '--'}
            </RetroText>
          </View>
        ))}
      {hasColor ? (
        !!readiness?.recommendation_text && (
          <RetroText size={8} color={RETRO.textSoft} upper={false} style={styles.message}>
            {readiness.recommendation_text}
          </RetroText>
        )
      ) : (
        <View style={styles.link}>
          <RetroText size={8} color={RETRO.accent}>{VITALITY_NO_DATA_MESSAGE}</RetroText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: RETRO.panel, borderWidth: 2, borderColor: RETRO.border, padding: 10, gap: 6 },
  center: { minHeight: 72, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  waveBox: { height: WAVE_HEIGHT, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  message: { paddingTop: 4, borderTopWidth: 2, borderTopColor: RETRO.slotBorder },
  link: { minHeight: 44, justifyContent: 'center' },
});
