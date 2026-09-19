import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { WeightChart } from '@/components/WeightChart';
import { getApiErrorMessage } from '@/services/api';
import { parseLocalDate } from '@/services/dashboard';
import { WeightLog, deleteWeightLog, listWeightLogs, updateWeightLog } from '@/services/weightLogs';
import { notifyDashboardChanged, subscribeToDashboardChanges } from '@/utils/dashboardEvents';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

function formatFullDate(dateStr: string): string {
  const label = parseLocalDate(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Tela de historico/evolucao de peso — antes so existia o formulario de
 * criacao (weight/new.tsx) e o WeightChart solto, sem toque, dentro da
 * Home. Reaproveita WeightChart.tsx (grafico) e os services ja existentes
 * (listWeightLogs/updateWeightLog/deleteWeightLog) — so a tela em si e nova.
 *
 * WeightChart espera WeightPoint[] (services/dashboard.ts: {date,
 * weight_kg}), nao WeightLog[] (services/weightLogs.ts: {id, user_id,
 * weight_kg, logged_at, created_at}) -- mapeado abaixo (logged_at -> date).
 *
 * Periodo fixo em 30d (mesmo default do backend, GET /weight-logs/?period=30d)
 * -- WeightChart nao tem prop de periodo/toggle, so `data`, entao nao ha
 * period selector nesta tela (nada pra expor).
 *
 * Lista mostra mais recente primeiro (reversa do array que a API devolve,
 * que vem ascendente/mais antigo primeiro -- ordem que o grafico usa sem
 * alteracao, ja que ele espera cronologico esquerda->direita).
 *
 * Editar abre uma folha simples propria (Modal + TextInput, mesmo padrao
 * ja usado no modal de criar/entrar em squad de ranking.tsx) em vez de
 * reaproveitar weight/new.tsx: aquela tela ainda esta no tema antigo
 * (colors/Button/TextField, geracao 1) e so cria (createWeightLog), nao
 * edita -- mudar ela pra suportar edicao e/ou tema novo estava fora do
 * pedido ("nao mexer na logica de weight/new.tsx").
 */
export default function WeightHistoryScreen() {
  const [logs, setLogs] = useState<WeightLog[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingLog, setEditingLog] = useState<WeightLog | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await listWeightLogs('30d'));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar seu histórico de peso.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [fetchLogs])
  );

  // Mesmo sinal explicito ja usado na Home -- voltar do modal weight/new.tsx
  // (apos criar um registro) nem sempre dispara o foco a tempo em todo
  // dispositivo, ver utils/dashboardEvents.ts.
  useEffect(() => subscribeToDashboardChanges(fetchLogs), [fetchLogs]);

  const openEdit = (log: WeightLog) => {
    setEditError(null);
    setEditWeight(String(log.weight_kg));
    setEditingLog(log);
  };

  const closeEdit = () => {
    if (editSubmitting) return;
    setEditingLog(null);
  };

  const handleSaveEdit = async () => {
    if (!editingLog) return;
    const parsed = Number(editWeight.replace(',', '.'));
    if (!(parsed > 0)) {
      setEditError('Informe um peso válido.');
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateWeightLog(editingLog.id, { weight_kg: parsed });
      setEditingLog(null);
      notifyDashboardChanged();
      fetchLogs();
    } catch (err) {
      setEditError(getApiErrorMessage(err, 'Não foi possível salvar essa alteração.'));
    } finally {
      setEditSubmitting(false);
    }
  };

  const confirmDelete = (log: WeightLog) => {
    Alert.alert(
      'Excluir registro',
      `Remover o registro de ${formatFullDate(log.logged_at)} (${log.weight_kg.toFixed(1)} kg)?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(log.id);
            try {
              await deleteWeightLog(log.id);
              notifyDashboardChanged();
              fetchLogs();
            } catch (err) {
              Alert.alert('Não foi possível excluir', getApiErrorMessage(err, 'Tente novamente mais tarde.'));
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const chartData = (logs ?? []).map((log) => ({ date: log.logged_at, weight_kg: log.weight_kg }));
  // Lista mais recente primeiro -- API devolve ascendente (ordem que o
  // grafico precisa), lista de historico e mais natural ao contrario.
  const listData = [...(logs ?? [])].reverse();

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors3.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.headerTitle}>Evolução de peso</Text>
        <Pressable onPress={() => router.push('/weight/new')} hitSlop={12}>
          <Ionicons name="add-circle-outline" size={24} color={colors3.primary} />
        </Pressable>
      </View>

      {loading && !logs ? (
        <ActivityIndicator color={colors3.primary} style={styles.loading} />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {!!error && <Text style={styles.error}>{error}</Text>}
              <GlassCard style={styles.chartCard}>
                <WeightChart data={chartData} />
              </GlassCard>
              {listData.length > 0 && <Text style={styles.sectionTitle}>Registros</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <GlassCard variant="card" style={styles.logRow}>
              <View style={styles.logInfo}>
                <Text style={styles.logWeight}>{item.weight_kg.toFixed(1)} kg</Text>
                <Text style={styles.logDate}>{formatFullDate(item.logged_at)}</Text>
              </View>
              <View style={styles.logActions}>
                <Pressable onPress={() => openEdit(item)} hitSlop={8} style={styles.logActionButton}>
                  <Ionicons name="pencil-outline" size={18} color={colors3.onSurfaceVariant} />
                </Pressable>
                {deletingId === item.id ? (
                  <ActivityIndicator size="small" color={colors3.error} style={styles.logActionButton} />
                ) : (
                  <Pressable onPress={() => confirmDelete(item)} hitSlop={8} style={styles.logActionButton}>
                    <Ionicons name="trash-outline" size={18} color={colors3.error} />
                  </Pressable>
                )}
              </View>
            </GlassCard>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing3.sm }} />}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Ionicons name="trending-down-outline" size={32} color={colors3.onSurfaceVariant} />
                <Text style={styles.emptyText}>Nenhum registro de peso ainda.</Text>
                <Button3 label="Registrar primeiro peso" onPress={() => router.push('/weight/new')} />
              </View>
            ) : null
          }
        />
      )}

      <Modal visible={!!editingLog} animationType="slide" transparent onRequestClose={closeEdit}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingLog ? `Editar registro de ${formatFullDate(editingLog.logged_at)}` : 'Editar registro'}
              </Text>
              <Pressable onPress={closeEdit} hitSlop={12} accessibilityLabel="Fechar">
                <Ionicons name="close" size={24} color={colors3.onSurface} />
              </Pressable>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Peso (kg)"
              placeholderTextColor={colors3.onSurfaceVariant}
              keyboardType="decimal-pad"
              value={editWeight}
              onChangeText={setEditWeight}
              autoFocus
            />
            {!!editError && <Text style={styles.modalError}>{editError}</Text>}
            <Button3 label="Salvar" onPress={handleSaveEdit} loading={editSubmitting} disabled={!editWeight.trim()} />
          </View>
        </View>
      </Modal>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
  },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  loading: { marginTop: spacing3.xl },

  listContent: { padding: spacing3.containerMargin, paddingTop: 0, paddingBottom: spacing3.xl * 2 },
  listHeader: { gap: spacing3.md, marginBottom: spacing3.sm },
  error: { color: colors3.error, textAlign: 'center' },
  chartCard: { gap: spacing3.sm },
  sectionTitle: { ...typography3.headlineMd, fontSize: 16 },

  logRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logInfo: { gap: 2 },
  logWeight: { ...typography3.bodyMd, fontSize: 16, fontWeight: '700' },
  logDate: { ...typography3.labelSm, textTransform: 'none' },
  logActions: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  logActionButton: { width: 28, alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing3.xl, gap: spacing3.md },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors3.background,
    borderTopLeftRadius: radius3.xl,
    borderTopRightRadius: radius3.xl,
    padding: spacing3.lg,
    paddingBottom: spacing3.xl,
    gap: spacing3.md,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing3.md },
  modalTitle: { ...typography3.headlineMd, fontSize: 18, flex: 1 },
  modalInput: {
    ...typography3.bodyMd,
    borderRadius: radius3.md,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    backgroundColor: colors3.surfaceVariant,
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm + 2,
    color: colors3.onSurface,
  },
  modalError: { color: colors3.error, fontSize: 13 },
});
