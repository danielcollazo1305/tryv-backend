import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { EquipmentFormModal } from '@/components/EquipmentFormModal';
import { EquipmentUsageBar } from '@/components/EquipmentUsageBar';
import {
  Equipment,
  EquipmentCategory,
  deleteEquipment,
  getEquipment,
  markMaintenanceDone,
  updateEquipment,
} from '@/services/equipment';
import { getApiErrorMessage } from '@/services/api';
import { DEFAULT_ELIGIBLE_CATEGORIES, EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABELS } from '@/utils/equipmentCategories';
import { formatKm, lastUsedLabel } from '@/utils/equipmentUsage';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

type Stage = 'loading' | 'ready' | 'error';

/**
 * Inventario de equipamentos (v2) -- push normal a partir de profile.tsx, fora de (auth)/(tabs). Tela
 * simples e SEM icones: secoes por categoria (Tenis, Bike, Relogio, Fita cardiaca), cada item e uma linha
 * com nome e acoes em texto.
 *  - Tenis: barra de vida util; Bike: barra de manutencao + "Revisao feita"; Relogio/Fita: so o nome.
 *  - Padrao (tenis/bike): entra sozinho nas atividades. Aposentar esconde e mantem o historico; Apagar so
 *    quando o item nunca foi usado (uses_count === 0).
 */
export default function InventoryScreen() {
  const [stage, setStage] = useState<Stage>('loading');
  const [items, setItems] = useState<Equipment[]>([]);
  const [showRetired, setShowRetired] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setStage('loading');
    try {
      // Uma chamada so: ativos e aposentados juntos; a separacao e feita aqui.
      setItems(await getEquipment({ includeRetired: true }));
      setStage('ready');
    } catch {
      if (!silent) setStage('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeItems = useMemo(() => items.filter((item) => !item.retired_at), [items]);
  const retiredItems = useMemo(() => items.filter((item) => !!item.retired_at), [items]);
  const activeByCategory = useMemo(() => {
    const grouped: Record<EquipmentCategory, Equipment[]> = { tenis: [], bike: [], relogio: [], faixa_cardiaca: [] };
    for (const item of activeItems) grouped[item.category]?.push(item);
    return grouped;
  }, [activeItems]);

  // Executa uma acao do item, recarrega a lista em silencio e mostra o erro do servidor (se houver).
  const runAction = async (item: Equipment, action: () => Promise<unknown>, fallbackError: string) => {
    setBusyId(item.id);
    try {
      await action();
      await load(true);
    } catch (err) {
      const status = (err as { response?: { status?: number } } | null)?.response?.status;
      const message =
        status === 409 && item.uses_count === 0
          ? 'Não foi possível concluir agora (outra alteração estava em andamento). Tente de novo.'
          : getApiErrorMessage(err, fallbackError);
      Alert.alert('Erro', message);
    } finally {
      setBusyId(null);
    }
  };

  const handleMakeDefault = (item: Equipment) =>
    runAction(item, () => updateEquipment(item.id, { is_default: true }), 'Não foi possível definir o padrão, tente novamente.');

  const handleRetire = (item: Equipment) => {
    Alert.alert(
      'Aposentar item?',
      `"${item.name}" some das listas e deixa de ser o padrão, mas o histórico de km é mantido. Você pode reativá-lo depois.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aposentar',
          style: 'destructive',
          onPress: () => runAction(item, () => updateEquipment(item.id, { retired: true }), 'Não foi possível aposentar o item.'),
        },
      ]
    );
  };

  const handleReactivate = (item: Equipment) =>
    runAction(item, () => updateEquipment(item.id, { retired: false }), 'Não foi possível reativar o item.');

  const handleDelete = (item: Equipment) => {
    Alert.alert('Apagar item?', `"${item.name}" nunca foi usado e será apagado de vez.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => runAction(item, () => deleteEquipment(item.id), 'Não foi possível apagar o item.'),
      },
    ]);
  };

  const handleMaintenance = (item: Equipment) => {
    Alert.alert('Revisão feita?', `Registrar a revisão de "${item.name}"? A contagem de km desde a revisão volta a zero.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Revisão feita',
        onPress: () => runAction(item, () => markMaintenanceDone(item.id), 'Não foi possível registrar a revisão.'),
      },
    ]);
  };

  const openCreate = () => {
    setEditing(null);
    setFormMode('create');
  };
  const openEdit = (item: Equipment) => {
    setEditing(item);
    setFormMode('edit');
  };

  const renderUsage = (item: Equipment) => {
    if (item.category === 'tenis' && item.wear_percent != null && item.total_distance_km != null && item.lifespan_km != null) {
      return (
        <EquipmentUsageBar
          label={`Vida útil: ${formatKm(item.total_distance_km)} / ${formatKm(item.lifespan_km)} km`}
          percent={item.wear_percent}
          statusTexts={['Quase no fim', 'Hora de trocar']}
        />
      );
    }
    if (
      item.category === 'bike' &&
      item.maintenance_percent != null &&
      item.km_since_maintenance != null &&
      item.maintenance_interval_km != null
    ) {
      return (
        <EquipmentUsageBar
          label={`Manutenção: ${formatKm(item.km_since_maintenance)} / ${formatKm(item.maintenance_interval_km)} km desde a revisão`}
          percent={item.maintenance_percent}
          statusTexts={['Revisão próxima', 'Hora da revisão']}
        />
      );
    }
    return null;
  };

  const renderItem = (item: Equipment) => {
    const busy = busyId === item.id;
    const detail = [item.brand, item.model].filter(Boolean).join(' ');
    const showDetail = !!detail && detail !== item.name;
    const eligible = DEFAULT_ELIGIBLE_CATEGORIES.includes(item.category);

    return (
      <View key={item.id} style={[styles.itemCard, busy && styles.itemBusy]}>
        <View style={styles.itemTop}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          {item.is_default && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Padrão</Text>
            </View>
          )}
        </View>
        {showDetail && <Text style={styles.itemDetail}>{detail}</Text>}

        {renderUsage(item)}

        {eligible && (
          <Text style={styles.itemDetail}>
            {lastUsedLabel(item.last_used_at)}
            {item.uses_count > 0 ? ` · ${item.uses_count} ${item.uses_count === 1 ? 'atividade' : 'atividades'}` : ''}
          </Text>
        )}

        {item.category === 'bike' && (
          <Button3 label="Revisão feita" variant="secondary" onPress={() => handleMaintenance(item)} disabled={busy} />
        )}

        <View style={styles.actions}>
          {eligible && !item.is_default && (
            <ActionLink label="Definir como padrão" onPress={() => handleMakeDefault(item)} disabled={busy} />
          )}
          <ActionLink label="Editar" onPress={() => openEdit(item)} disabled={busy} />
          <ActionLink label="Aposentar" onPress={() => handleRetire(item)} disabled={busy} />
          {item.uses_count === 0 && <ActionLink label="Apagar" onPress={() => handleDelete(item)} disabled={busy} danger />}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.headerAction}>Voltar</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Meu equipamento</Text>
        <Pressable onPress={openCreate} hitSlop={12}>
          <Text style={styles.headerAction}>Adicionar</Text>
        </Pressable>
      </View>

      {stage === 'loading' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors3.primary} />
        </View>
      )}

      {stage === 'error' && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Não foi possível carregar seu inventário.</Text>
          <Button3 label="Tentar de novo" onPress={() => load()} />
        </View>
      )}

      {stage === 'ready' && (
        <ScrollView contentContainerStyle={styles.content}>
          {EQUIPMENT_CATEGORIES.map((category) => (
            <View key={category} style={styles.section}>
              <Text style={styles.sectionTitle}>{EQUIPMENT_CATEGORY_LABELS[category]}</Text>
              {activeByCategory[category].length === 0 ? (
                <Text style={styles.emptyText}>Nenhum item ainda.</Text>
              ) : (
                activeByCategory[category].map(renderItem)
              )}
            </View>
          ))}

          {retiredItems.length > 0 && (
            <View style={styles.section}>
              <Pressable onPress={() => setShowRetired((v) => !v)} hitSlop={8} style={styles.retiredHeader}>
                <Text style={styles.sectionTitle}>Aposentados ({retiredItems.length})</Text>
                <Text style={styles.headerAction}>{showRetired ? 'Ocultar' : 'Mostrar'}</Text>
              </Pressable>
              {showRetired &&
                retiredItems.map((item) => (
                  <View key={item.id} style={[styles.itemCard, busyId === item.id && styles.itemBusy]}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemDetail}>
                      {EQUIPMENT_CATEGORY_LABELS[item.category]}
                      {item.total_distance_km != null ? ` · ${formatKm(item.total_distance_km)} km no total` : ''}
                    </Text>
                    <View style={styles.actions}>
                      <ActionLink label="Reativar" onPress={() => handleReactivate(item)} disabled={busyId === item.id} />
                    </View>
                  </View>
                ))}
            </View>
          )}
        </ScrollView>
      )}

      <EquipmentFormModal
        visible={formMode !== null}
        mode={formMode ?? 'create'}
        item={editing}
        hasActiveInCategory={(category) => activeByCategory[category].length > 0}
        onClose={() => setFormMode(null)}
        onSaved={() => load(true)}
      />
    </View>
  );
}

function ActionLink({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8}>
      <Text style={[styles.actionText, danger && styles.actionTextDanger, disabled && styles.actionDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors3.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
  },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  headerAction: { ...typography3.labelMd, color: colors3.primary },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing3.md, padding: spacing3.lg },
  errorText: { ...typography3.bodyMd, color: colors3.error, textAlign: 'center' },

  content: { padding: spacing3.containerMargin, paddingTop: 0, paddingBottom: spacing3.xl, gap: spacing3.lg },
  section: { gap: spacing3.sm },
  sectionTitle: { ...typography3.headlineMd, fontSize: 16 },
  retiredHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, fontStyle: 'italic' },

  itemCard: {
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    borderRadius: radius3.md,
    padding: spacing3.md,
    gap: spacing3.sm,
  },
  itemBusy: { opacity: 0.5 },
  itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing3.sm },
  itemName: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold', flex: 1 },
  itemDetail: { ...typography3.labelSm, textTransform: 'none' },
  defaultBadge: {
    paddingHorizontal: spacing3.sm,
    paddingVertical: 2,
    borderRadius: radius3.pill,
    backgroundColor: 'rgba(107, 56, 212, 0.14)',
  },
  defaultBadgeText: { ...typography3.labelSm, textTransform: 'none', fontFamily: 'Inter_700Bold', color: colors3.primary },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing3.md },
  actionText: { ...typography3.labelMd, color: colors3.primary },
  actionTextDanger: { color: colors3.error },
  actionDisabled: { opacity: 0.4 },
});
