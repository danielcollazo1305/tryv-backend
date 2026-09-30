import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Equipment, EquipmentCategory, getEquipment } from '@/services/equipment';
import { EQUIPMENT_CATEGORY_ICONS } from '@/utils/equipmentCategories';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

interface EquipmentPickerProps {
  allowedCategories: EquipmentCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Default cobre o caso generico -- chamadores podem customizar (ex: "Tênis usado"). */
  label?: string;
}

/**
 * Seletor reutilizavel de equipamento, encaixado nos pontos de registro de
 * atividade (activity/new.tsx, FreeWorkoutLogView.tsx, WorkoutPlanView.tsx).
 * Busca o inventario inteiro do usuario e filtra por allowedCategories --
 * cada chamador passa so as categorias que fazem sentido pro tipo de
 * atividade (mesmo recorte de ALLOWED_CATEGORIES_BY_ACTIVITY_MODEL no
 * backend). Pill "Nenhum" sempre presente, já que equipamento é opcional.
 * Reaproveita o padrao visual de pill de app/inventory.tsx.
 */
export function EquipmentPicker({ allowedCategories, value, onChange, label = 'Equipamento usado (opcional)' }: EquipmentPickerProps) {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getEquipment()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, []);

  const options = useMemo(
    () => items.filter((item) => allowedCategories.includes(item.category)),
    [items, allowedCategories]
  );

  // Evita "piscar" so o pill "Nenhum" sozinho enquanto o fetch ainda esta em voo.
  if (!loaded) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
        <Pressable style={[styles.option, value === null && styles.optionSelected]} onPress={() => onChange(null)}>
          <Text style={[styles.optionText, value === null && styles.optionTextSelected]}>Nenhum</Text>
        </Pressable>
        {options.map((item) => {
          const selected = value === item.id;
          return (
            <Pressable
              key={item.id}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => onChange(item.id)}
            >
              <Ionicons
                name={EQUIPMENT_CATEGORY_ICONS[item.category]}
                size={16}
                color={selected ? colors3.onPrimary : colors3.primary}
              />
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{item.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {options.length === 0 && (
        <Pressable onPress={() => router.push('/inventory')} hitSlop={8}>
          <Text style={styles.registerLink}>+ Cadastrar equipamento</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing3.sm },
  label: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  options: { flexDirection: 'row', gap: spacing3.sm },
  option: {
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
  optionSelected: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  optionText: { ...typography3.labelSm, textTransform: 'none', color: colors3.primary },
  optionTextSelected: { color: colors3.onPrimary },
  registerLink: {
    ...typography3.labelSm,
    textTransform: 'none',
    color: colors3.onSurfaceVariant,
    textDecorationLine: 'underline',
  },
});
