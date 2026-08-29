import React, { useMemo, useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  ExerciseLibraryEntry,
  getPrimaryMuscleGroupLabel,
  searchExerciseLibrary,
} from '@/constants/exerciseLibrary';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

interface ExercisePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (entry: ExerciseLibraryEntry) => void;
  /** Nomes ja adicionados na sessao em andamento — mostra "Adicionado" no lugar do botao, pra evitar duplicata acidental do mesmo exercicio na lista. */
  addedNames?: string[];
}

interface ExerciseSection {
  title: string;
  data: ExerciseLibraryEntry[];
}

function buildSections(entries: ExerciseLibraryEntry[]): ExerciseSection[] {
  const byGroup = new Map<string, ExerciseLibraryEntry[]>();
  entries.forEach((entry) => {
    const label = getPrimaryMuscleGroupLabel(entry);
    const list = byGroup.get(label) ?? [];
    list.push(entry);
    byGroup.set(label, list);
  });
  return Array.from(byGroup.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .map(([title, data]) => ({ title, data }));
}

/**
 * Modal de busca/selecao manual de exercicio — ponto de entrada da sessao
 * "livre" (sem plano). Reabrivel quantas vezes forem necessarias durante o
 * registro (nao fecha sozinho ao adicionar, so quando o usuario toca em
 * fechar) — pensado pra usuario ir adicionando varios exercicios em
 * sequencia sem precisar reabrir o modal a cada um.
 */
export function ExercisePickerModal({ visible, onClose, onAdd, addedNames = [] }: ExercisePickerModalProps) {
  const [query, setQuery] = useState('');
  const sections = useMemo(() => buildSections(searchExerciseLibrary(query)), [query]);
  const addedSet = useMemo(() => new Set(addedNames), [addedNames]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Adicionar exercício</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fechar">
              <Ionicons name="close" size={24} color={colors3.onSurface} />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors3.onSurfaceVariant} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar exercício..."
              placeholderTextColor={colors3.onSurfaceVariant}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <SectionList
            sections={sections}
            keyExtractor={(item) => item.name}
            stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
            renderItem={({ item }) => {
              const added = addedSet.has(item.name);
              return (
                <View style={styles.row}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Pressable
                    style={[styles.addButton, added && styles.addButtonDone]}
                    onPress={() => onAdd(item)}
                    disabled={added}
                  >
                    <Ionicons name={added ? 'checkmark' : 'add'} size={16} color={added ? colors3.primary : '#ffffff'} />
                    <Text style={[styles.addButtonText, added && styles.addButtonTextDone]}>
                      {added ? 'Adicionado' : 'Adicionar'}
                    </Text>
                  </Pressable>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>Nenhum exercício encontrado.</Text>}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors3.background,
    borderTopLeftRadius: radius3.xl,
    borderTopRightRadius: radius3.xl,
    maxHeight: '80%',
    paddingTop: spacing3.md,
    paddingBottom: spacing3.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.lg,
    marginBottom: spacing3.sm,
  },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    marginHorizontal: spacing3.lg,
    marginBottom: spacing3.sm,
    paddingHorizontal: spacing3.md,
    paddingVertical: 10,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceVariant,
  },
  searchInput: { ...typography3.bodyMd, flex: 1, padding: 0, color: colors3.onSurface },
  listContent: { paddingHorizontal: spacing3.lg },
  sectionHeader: {
    ...typography3.labelSm,
    textTransform: 'uppercase',
    color: colors3.primary,
    marginTop: spacing3.md,
    marginBottom: spacing3.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors3.surfaceVariant,
  },
  rowName: { ...typography3.bodyMd, color: colors3.onSurface, flex: 1, marginRight: spacing3.sm },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: spacing3.sm + 2,
    borderRadius: radius3.pill,
    backgroundColor: colors3.primary,
  },
  addButtonDone: { backgroundColor: colors3.primaryFixed },
  addButtonText: { ...typography3.labelSm, color: '#ffffff' },
  addButtonTextDone: { color: colors3.primary },
  empty: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center', marginTop: spacing3.xl },
});
