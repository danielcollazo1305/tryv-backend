import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { getCreatineToday, getWaterToday, logCreatine, logWater } from '@/services/waterCreatine';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

const QUICK_WATER_ML = 250;
const WATER_CHIP_OPTIONS_ML = [100, 500, 750, 1000];

function formatWater(totalMl: number): string {
  if (totalMl < 1000) return `${totalMl} ml`;
  return `${String(Number((totalMl / 1000).toFixed(2))).replace('.', ',')} L`;
}

/**
 * Agua e Creatina de hoje -- 2 cards compactos lado a lado, registro rapido
 * (sem modal, sem IA).
 *
 * Agua: toque no card soma 250 ml; o botao "..." abre uma fileira de chips
 * (100/500/750/1000 ml) logo abaixo, tambem 1 toque. Creatina: toque marca
 * "tomei hoje" (idempotente no backend).
 *
 * Optimistic update: o visual muda ANTES da resposta; se a chamada falhar,
 * desfaz so o que aquele toque somou (nao reverte pra um snapshot antigo, pra
 * nao apagar toques seguidos que deram certo) e mostra um erro curto. O dado
 * e recarregado a cada foco da aba, como o resto da tela de Refeicoes; falha
 * de carga deixa o valor como "--" (nao trava nada).
 */
export function WaterCreatineCards() {
  const [waterMl, setWaterMl] = useState<number | null>(null);
  const [creatineTaken, setCreatineTaken] = useState<boolean | null>(null);
  const [showChips, setShowChips] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getWaterToday()
        .then((data) => {
          if (active) setWaterMl(data.total_ml);
        })
        .catch(() => {});
      getCreatineToday()
        .then((data) => {
          if (active) setCreatineTaken(data.taken_today);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [])
  );

  const addWater = (amountMl: number) => {
    setError(null);
    setShowChips(false);
    setWaterMl((prev) => (prev ?? 0) + amountMl);
    logWater(amountMl).catch(() => {
      setWaterMl((prev) => Math.max(0, (prev ?? 0) - amountMl));
      setError('Não foi possível registrar a água. Tente de novo.');
    });
  };

  const markCreatine = () => {
    // Ja marcado hoje: nada a fazer (o backend e idempotente, mas nao ha por
    // que gastar uma chamada). null (carregando) tambem nao dispara.
    if (creatineTaken !== false) return;
    setError(null);
    setCreatineTaken(true);
    logCreatine().catch(() => {
      setCreatineTaken(false);
      setError('Não foi possível registrar a creatina. Tente de novo.');
    });
  };

  const creatineDone = creatineTaken === true;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Pressable
            onPress={() => addWater(QUICK_WATER_ML)}
            accessibilityRole="button"
            accessibilityLabel={`Adicionar ${QUICK_WATER_ML} ml de água`}
          >
            <GlassCard variant="glass" style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.iconWrap}>
                  <Ionicons name="water-outline" size={20} color={colors3.primary} />
                </View>
                <Pressable
                  onPress={() => setShowChips((prev) => !prev)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Escolher outra quantidade de água"
                  style={styles.moreButton}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={colors3.onSurfaceVariant} />
                </Pressable>
              </View>
              <Text style={styles.value}>{waterMl == null ? '--' : formatWater(waterMl)}</Text>
              <Text style={styles.label}>Água · toque +{QUICK_WATER_ML} ml</Text>
            </GlassCard>
          </Pressable>
        </View>

        <View style={styles.cell}>
          <Pressable
            onPress={markCreatine}
            disabled={creatineTaken === null}
            accessibilityRole="button"
            accessibilityLabel={creatineDone ? 'Creatina tomada hoje' : 'Marcar creatina como tomada'}
          >
            <GlassCard variant="glass" style={[styles.card, creatineDone && styles.cardDone]}>
              <View style={styles.cardTop}>
                <View style={[styles.iconWrap, creatineDone && styles.iconWrapDone]}>
                  {creatineDone ? (
                    <Ionicons name="checkmark" size={20} color={colors3.onPrimary} />
                  ) : (
                    <MaterialCommunityIcons name="pill" size={20} color={colors3.primary} />
                  )}
                </View>
              </View>
              <Text style={[styles.value, creatineDone && styles.valueDone]}>
                {creatineTaken === null ? '--' : creatineDone ? 'Tomada' : 'Pendente'}
              </Text>
              <Text style={styles.label}>Creatina · {creatineDone ? 'hoje' : 'toque pra marcar'}</Text>
            </GlassCard>
          </Pressable>
        </View>
      </View>

      {showChips && (
        <View style={styles.chipsRow}>
          {WATER_CHIP_OPTIONS_ML.map((amountMl) => (
            <Pressable key={amountMl} onPress={() => addWater(amountMl)} style={styles.chip}>
              <Text style={styles.chipText}>+{amountMl} ml</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing3.sm },
  row: { flexDirection: 'row', gap: spacing3.md },
  cell: { flex: 1 },
  card: { gap: spacing3.xs },
  cardDone: { backgroundColor: 'rgba(0, 107, 95, 0.08)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing3.xs },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius3.sm,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDone: { backgroundColor: colors3.secondary },
  moreButton: { padding: spacing3.xs },
  value: { ...typography3.headlineLg, fontSize: 22, lineHeight: 26 },
  valueDone: { color: colors3.secondary },
  label: { ...typography3.labelSm, textTransform: 'none' },

  chipsRow: { flexDirection: 'row', gap: spacing3.sm },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing3.sm,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
  },
  chipText: { ...typography3.labelMd, color: colors3.primary },
  error: { ...typography3.bodyMd, fontSize: 13, color: colors3.error, textAlign: 'center' },
});
