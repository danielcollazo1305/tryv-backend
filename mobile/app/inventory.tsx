import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { TextField2 } from '@/components/TextField2';
import { Equipment, EquipmentCategory, createEquipment, deleteEquipment, getEquipment } from '@/services/equipment';
import { getApiErrorMessage } from '@/services/api';
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_ICONS, EQUIPMENT_CATEGORY_LABELS } from '@/utils/equipmentCategories';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

type Stage = 'loading' | 'ready' | 'error';

/**
 * Inventario de equipamentos (Fase equipamento/XP bonus) -- push normal a
 * partir de profile.tsx, fora de (auth)/(tabs) (so faz sentido logado,
 * registrada no grupo protegido de app/_layout.tsx), mesmo padrao de
 * territory-map.tsx. Lista agrupada pelas 5 categorias fixas
 * (EQUIPMENT_CATEGORIES), sempre todas visiveis (com "Nenhum item ainda"
 * pras vazias) -- nao esconde categoria sem item, pra deixar claro que as
 * 5 existem e podem ser preenchidas.
 */
export default function InventoryScreen() {
  const [stage, setStage] = useState<Stage>('loading');
  const [items, setItems] = useState<Equipment[]>([]);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<EquipmentCategory | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStage('loading');
    try {
      const data = await getEquipment();
      setItems(data);
      setStage('ready');
    } catch {
      setStage('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const itemsByCategory = useMemo(() => {
    const grouped: Record<EquipmentCategory, Equipment[]> = {
      tenis: [],
      luva_faixa: [],
      bike: [],
      suplemento: [],
      faixa_cardiaca: [],
    };
    for (const item of items) {
      grouped[item.category]?.push(item);
    }
    return grouped;
  }, [items]);

  const handleOpenAdd = () => {
    setSelectedCategory(null);
    setNameInput('');
    setSubmitError(null);
    setAddModalVisible(true);
  };

  const handleCloseAdd = () => {
    if (submitting) return;
    setAddModalVisible(false);
  };

  const handleSubmitAdd = async () => {
    if (!selectedCategory) {
      setSubmitError('Selecione uma categoria.');
      return;
    }
    if (!nameInput.trim()) {
      setSubmitError('Informe um nome pro item.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createEquipment({ category: selectedCategory, name: nameInput.trim() });
      setAddModalVisible(false);
      await load();
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, 'Não foi possível adicionar o item, tente novamente.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (item: Equipment) => {
    Alert.alert('Remover item?', `"${item.name}" será removido do seu inventário.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEquipment(item.id);
            setItems((prev) => prev.filter((i) => i.id !== item.id));
          } catch (err) {
            Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível remover o item, tente novamente.'));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Meu equipamento</Text>
        <Pressable onPress={handleOpenAdd} hitSlop={12}>
          <Ionicons name="add" size={26} color={colors3.primary} />
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
          <Button3 label="Tentar de novo" onPress={load} />
        </View>
      )}

      {stage === 'ready' && (
        <ScrollView contentContainerStyle={styles.content}>
          {EQUIPMENT_CATEGORIES.map((category) => (
            <View key={category} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name={EQUIPMENT_CATEGORY_ICONS[category]} size={18} color={colors3.primary} />
                <Text style={styles.sectionTitle}>{EQUIPMENT_CATEGORY_LABELS[category]}</Text>
              </View>

              {itemsByCategory[category].length === 0 ? (
                <Text style={styles.emptyText}>Nenhum item ainda.</Text>
              ) : (
                itemsByCategory[category].map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Pressable onPress={() => handleDelete(item)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors3.onSurfaceVariant} />
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={addModalVisible} animationType="slide" transparent onRequestClose={handleCloseAdd}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo item</Text>
              <Pressable onPress={handleCloseAdd} hitSlop={12} disabled={submitting}>
                <Ionicons name="close" size={24} color={colors3.onSurface} />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Categoria</Text>
            <View style={styles.categoryOptions}>
              {EQUIPMENT_CATEGORIES.map((category) => {
                const selected = selectedCategory === category;
                return (
                  <Pressable
                    key={category}
                    style={[styles.categoryOption, selected && styles.categoryOptionSelected]}
                    onPress={() => setSelectedCategory(category)}
                  >
                    <Ionicons
                      name={EQUIPMENT_CATEGORY_ICONS[category]}
                      size={16}
                      color={selected ? colors3.onPrimary : colors3.primary}
                    />
                    <Text style={[styles.categoryOptionText, selected && styles.categoryOptionTextSelected]}>
                      {EQUIPMENT_CATEGORY_LABELS[category]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextField2
              variant="light"
              label="Nome"
              placeholder="Ex: Pegasus 40"
              value={nameInput}
              onChangeText={setNameInput}
            />

            {!!submitError && <Text style={styles.errorText}>{submitError}</Text>}

            <Button3 label="Adicionar" onPress={handleSubmitAdd} loading={submitting} />
          </View>
        </View>
      </Modal>
    </View>
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

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing3.md, padding: spacing3.lg },
  errorText: { ...typography3.bodyMd, color: colors3.error, textAlign: 'center' },

  content: { padding: spacing3.containerMargin, paddingTop: 0, gap: spacing3.lg },
  section: { gap: spacing3.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  sectionTitle: { ...typography3.headlineMd, fontSize: 16 },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, fontStyle: 'italic' },

  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    borderRadius: radius3.md,
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm,
  },
  itemName: { ...typography3.bodyMd, flex: 1, marginRight: spacing3.sm },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors3.background,
    borderTopLeftRadius: radius3.xl,
    borderTopRightRadius: radius3.xl,
    padding: spacing3.lg,
    paddingBottom: spacing3.xl,
    gap: spacing3.md,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { ...typography3.headlineMd, fontSize: 18 },
  fieldLabel: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginLeft: spacing3.xs },

  categoryOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing3.sm },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
  },
  categoryOptionSelected: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  categoryOptionText: { ...typography3.labelSm, textTransform: 'none', color: colors3.primary },
  categoryOptionTextSelected: { color: colors3.onPrimary },
});
