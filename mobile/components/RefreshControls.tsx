import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncExternalStore } from 'react';

import { colors3, typography3 } from '@/constants/theme';
import { getRefreshState, refreshEverything, subscribeRefresh } from '@/services/refreshAll';
import { getVitalitySnapshot, subscribeVitality } from '@/services/vitalityService';
import { formatUpdatedAt } from '@/services/vitalityView';

/** Estado da atualizacao manual (para quem precisa so de refreshing/lastRefreshAt). */
export function useRefreshState() {
  return useSyncExternalStore(subscribeRefresh, getRefreshState, getRefreshState);
}

/**
 * Icone de atualizar: importa treinos do Apple Saude, sincroniza a FC, recalcula a Vitalidade e grava o resumo do widget (services/refreshAll.ts).
 * Mostra um spinner enquanto atualiza e nao deixa disparar duas vezes. (O "Importar treinos" de Atividades e outra coisa: selecao manual treino a treino.)
 */
export function RefreshButton({ size = 20 }: { size?: number }) {
  const { refreshing } = useRefreshState();
  return (
    <Pressable
      onPress={() => void refreshEverything()}
      disabled={refreshing}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={refreshing ? 'Atualizando' : 'Atualizar'}
      accessibilityState={{ busy: refreshing, disabled: refreshing }}
    >
      {refreshing ? <ActivityIndicator size="small" color={colors3.primary} /> : <Ionicons name="refresh-outline" size={size} color={colors3.onSurfaceVariant} />}
    </Pressable>
  );
}

/** "Atualizado às HH:mm": o mais recente entre a ultima atualizacao manual e a ultima atualizacao da Vitalidade; "Atualizando…" enquanto roda. */
export function UpdatedAtText() {
  const { refreshing, lastRefreshAt } = useRefreshState();
  const vitality = useSyncExternalStore(subscribeVitality, getVitalitySnapshot, getVitalitySnapshot).vitality;
  const latest = Math.max(lastRefreshAt ?? 0, vitality?.updatedAt ?? 0);
  const label = refreshing ? 'Atualizando…' : latest > 0 ? formatUpdatedAt(latest) : '';
  if (!label) return null;
  return (
    <Text style={styles.text} accessibilityLiveRegion="polite">
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
});
