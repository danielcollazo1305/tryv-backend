import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { MuscleVolumeDiagram } from '@/components/MuscleVolumeDiagram';
import { PillTabs } from '@/components/PillTabs';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { getMuscleVolume } from '@/services/muscleVolume';
import {
  COUNT_RULE_NOTE,
  DEFAULT_PERIOD,
  MuscleRow,
  MuscleVolumeResult,
  PERIOD_OPTIONS,
  PeriodDays,
  barFraction,
  diagramData,
  setsText,
} from '@/services/muscleVolumeState';

const MAX_UNCLASSIFIED_SHOWN = 15;
const TABS = PERIOD_OPTIONS.map((o) => ({ key: String(o.days), label: o.label }));

/**
 * Musculos: series CONCLUIDAS por grupo muscular no periodo (7, 30 ou 90 dias), so do proprio usuario. O servidor (GET /dashboard/exercise-volume)
 * devolve as series por exercicio; o app converte exercicio -> musculos pela biblioteca e soma. Regra: a serie conta inteira em cada musculo do
 * exercicio (nota na tela). Exercicios nao reconhecidos aparecem em "Nao classificados". Sem numero inventado: so o que veio do servidor.
 */
export default function MusclesScreen() {
  const [days, setDays] = useState<PeriodDays>(DEFAULT_PERIOD);
  const [result, setResult] = useState<MuscleVolumeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async (period: PeriodDays) => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(false);
    try {
      const data = await getMuscleVolume(period);
      if (request !== requestRef.current) return; // resposta de um periodo que ja foi trocado: descarta
      setResult(data);
    } catch {
      if (request !== requestRef.current) return;
      setResult(null);
      setError(true);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
    return () => {
      requestRef.current += 1;
    };
  }, [days, load]);

  const maxSets = result && result.muscles.length > 0 ? result.muscles[0].sets : 0;

  const header = (
    <View style={styles.headerBox}>
      <PillTabs tabs={TABS} selected={String(days)} onSelect={(key) => setDays(Number(key) as PeriodDays)} />
      {result && result.hasData && (
        <>
          <MuscleVolumeDiagram data={diagramData(result.muscles)} />
          <View style={styles.summary} accessible accessibilityLabel={`${setsText(result.totalSets)} em ${result.totalSessions} treinos no período`}>
            <Text style={styles.summaryNumber}>{result.totalSets}</Text>
            <Text style={styles.summaryText}>
              {result.totalSets === 1 ? 'série concluída' : 'séries concluídas'} em {result.totalSessions} {result.totalSessions === 1 ? 'treino' : 'treinos'}
            </Text>
          </View>
        </>
      )}
    </View>
  );

  const footer = result && result.hasData ? (
    <View style={styles.footerBox}>
      <Text style={styles.note}>{COUNT_RULE_NOTE}</Text>
      {result.unclassified.length > 0 && (
        <View style={styles.unclassifiedBox}>
          <Text style={styles.sectionTitle}>Não classificados</Text>
          <Text style={styles.note}>
            Exercícios que o app ainda não sabe a qual músculo pertencem ({setsText(result.unclassifiedSets)} no total). Eles contam no total do período, mas
            não em nenhum músculo.
          </Text>
          {result.unclassified.slice(0, MAX_UNCLASSIFIED_SHOWN).map((u) => (
            <View key={u.name} style={styles.unclassifiedRow}>
              <Text style={styles.unclassifiedName} numberOfLines={1}>
                {u.name}
              </Text>
              <Text style={styles.rowSets}>{setsText(u.sets)}</Text>
            </View>
          ))}
          {result.unclassified.length > MAX_UNCLASSIFIED_SHOWN && (
            <Text style={styles.note}>{`e mais ${result.unclassified.length - MAX_UNCLASSIFIED_SHOWN} exercícios`}</Text>
          )}
        </View>
      )}
    </View>
  ) : null;

  let empty: React.ReactElement | null = null;
  if (loading && !result) {
    empty = (
      <View style={styles.center} accessibilityLabel="Carregando" accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors3.primary} />
      </View>
    );
  } else if (error) {
    empty = (
      <View style={styles.center}>
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          Não foi possível carregar seus músculos.
        </Text>
        <Button3 label="Tentar de novo" variant="secondary" onPress={() => void load(days)} accessibilityLabel="Tentar de novo" />
      </View>
    );
  } else if (result && !result.hasData) {
    empty = (
      <View style={styles.center}>
        <Ionicons name="barbell-outline" size={32} color={colors3.onSurfaceVariant} />
        <Text style={styles.emptyTitle}>Nenhuma série concluída neste período</Text>
        <Text style={styles.emptyText}>Conclua séries nos seus treinos para ver aqui quais músculos você mais trabalhou.</Text>
        <Button3 label="Treinar" onPress={() => router.push('/treinar')} accessibilityLabel="Ir para treinar" />
      </View>
    );
  }

  return (
    <ScreenBackground3>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.title}>Músculos</Text>
        <View style={styles.back} />
      </View>
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        data={result && result.hasData && !error ? result.muscles : []}
        keyExtractor={(row) => row.slug}
        renderItem={({ item }) => <MuscleRowView row={item} maxSets={maxSets} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
      />
    </ScreenBackground3>
  );
}

function MuscleRowView({ row, maxSets }: { row: MuscleRow; maxSets: number }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${row.label}: ${setsText(row.sets)}`}>
      <View style={styles.rowTop}>
        <Text style={styles.rowLabel}>{row.label}</Text>
        <Text style={styles.rowSets}>{setsText(row.sets)}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.round(barFraction(row.sets, maxSets) * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography3.headlineMd, fontSize: 18 },
  listContent: { paddingHorizontal: spacing3.containerMargin, paddingBottom: spacing3.xl, gap: spacing3.sm },
  headerBox: { gap: spacing3.md, marginBottom: spacing3.sm },
  summary: { alignItems: 'center', gap: 2 },
  summaryNumber: { ...typography3.headlineMd, fontSize: 32, color: colors3.primary },
  summaryText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  row: { gap: 6, paddingVertical: spacing3.xs },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },
  rowSets: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  barTrack: { height: 8, borderRadius: radius3.pill, backgroundColor: colors3.surfaceContainerHigh, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius3.pill, backgroundColor: colors3.primary },
  footerBox: { gap: spacing3.md, marginTop: spacing3.md },
  note: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  unclassifiedBox: { gap: spacing3.sm },
  sectionTitle: { ...typography3.headlineMd, fontSize: 16 },
  unclassifiedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing3.md },
  unclassifiedName: { ...typography3.bodyMd, flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing3.xl, gap: spacing3.sm },
  error: { ...typography3.bodyMd, color: colors3.error, textAlign: 'center' },
  emptyTitle: { ...typography3.headlineMd, fontSize: 16, textAlign: 'center' },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
});
