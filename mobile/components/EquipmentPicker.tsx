import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Equipment, EquipmentCategory, getEquipment } from '@/services/equipment';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

interface EquipmentPickerProps {
  /** Unica categoria oferecida (a certa pro tipo de atividade: run/walk -> tenis; bike -> bike). */
  category: EquipmentCategory;
  /**
   * Tres estados:
   *  - `undefined` = o usuario NAO mexeu: o padrao da categoria aparece marcado e o chamador deve OMITIR
   *    equipment_id do payload (o servidor aplica o padrao);
   *  - string = item escolhido;
   *  - `null` = "Nenhum" escolhido (o chamador envia null explicito, que DESLIGA o padrao).
   */
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  /** Default cobre o caso generico -- chamadores podem customizar. */
  label?: string;
}

const DEFAULT_LABELS: Partial<Record<EquipmentCategory, string>> = {
  tenis: 'Tênis usado (opcional)',
  bike: 'Bike usada (opcional)',
};

/**
 * Seletor reutilizavel de equipamento, usado no fim de uma corrida/pedalada/caminhada com GPS
 * (activity/new.tsx). Pills so de texto: "Nenhum" + os itens ATIVOS da categoria, com o padrao marcado.
 * Se a lista nao carregar, o seletor some e o estado fica `undefined` (o servidor aplica o padrao).
 */
export function EquipmentPicker({ category, value, onChange, label }: EquipmentPickerProps) {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getEquipment()
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const options = useMemo(() => items.filter((item) => item.category === category), [items, category]);
  const defaultItem = options.find((item) => item.is_default) ?? null;
  // Sem toque do usuario, o padrao (se houver) aparece marcado; "Nenhum" so quando ele escolheu.
  const effective = value === undefined ? defaultItem?.id ?? null : value;

  // Evita "piscar" so o pill "Nenhum" enquanto o fetch esta em voo; em falha, some (estado segue undefined).
  if (!loaded || failed) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label ?? DEFAULT_LABELS[category] ?? 'Equipamento usado (opcional)'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
        <Pressable style={[styles.option, effective === null && styles.optionSelected]} onPress={() => onChange(null)}>
          <Text style={[styles.optionText, effective === null && styles.optionTextSelected]}>Nenhum</Text>
        </Pressable>
        {options.map((item) => {
          const selected = effective === item.id;
          return (
            <Pressable
              key={item.id}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => onChange(item.id)}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {item.name}
                {item.is_default ? ' · padrão' : ''}
              </Text>
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
