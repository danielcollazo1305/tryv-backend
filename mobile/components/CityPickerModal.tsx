import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { IbgeCity, IbgeState, listIbgeCitiesByState, listIbgeStates } from '@/services/ibge';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

interface CitySelection {
  ibgeCode: number;
  /** Rotulo pronto pra exibir/salvar, ex: "Guarujá - SP". */
  label: string;
}

interface CityPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (city: CitySelection) => void;
}

type Stage = 'state' | 'city';

/**
 * Seletor Estado -> Municipio via API publica do IBGE (services/ibge.ts).
 * Dois estagios dentro do mesmo modal (sem navegacao/rota nova): lista dos
 * 27 estados primeiro, depois os municipios do estado escolhido, com busca
 * local (sem nova chamada de API por letra digitada -- a lista do estado
 * inteiro ja foi baixada de uma vez, no maximo ~650 itens em SP).
 * Mesma estrutura visual de ExercisePickerModal.tsx (bottom sheet + busca
 * + lista), reaproveitada de proposito pra manter o padrao do app.
 */
export function CityPickerModal({ visible, onClose, onSelect }: CityPickerModalProps) {
  const [stage, setStage] = useState<Stage>('state');
  const [states, setStates] = useState<IbgeState[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);

  const [selectedState, setSelectedState] = useState<IbgeState | null>(null);
  const [cities, setCities] = useState<IbgeCity[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Busca os estados so na primeira vez que o modal abre (nao a cada
  // reabertura) -- states.length checa isso sem precisar de outro flag.
  useEffect(() => {
    if (!visible || states.length > 0 || statesLoading) return;
    setStatesLoading(true);
    setStatesError(null);
    listIbgeStates()
      .then(setStates)
      .catch(() => setStatesError('Nao foi possivel carregar os estados. Tente novamente.'))
      .finally(() => setStatesLoading(false));
  }, [visible, states.length, statesLoading]);

  const handleSelectState = (state: IbgeState) => {
    setSelectedState(state);
    setStage('city');
    setQuery('');
    setCitiesLoading(true);
    setCitiesError(null);
    listIbgeCitiesByState(state.sigla)
      .then(setCities)
      .catch(() => setCitiesError('Nao foi possivel carregar os municipios. Tente novamente.'))
      .finally(() => setCitiesLoading(false));
  };

  const handleSelectCity = (city: IbgeCity) => {
    if (!selectedState) return;
    const label = `${city.nome} - ${selectedState.sigla}`;
    // Mesmo reset de handleClose -- o pai (register-body.tsx) fecha o modal
    // chamando setShowCityPicker(false) direto, sem passar pelo onClose
    // daqui, entao a selecao bem-sucedida precisa resetar o estagio ela
    // mesma. Sem isso, reabrir o modal depois de escolher uma cidade caia
    // direto na lista de municipios do estado anterior, nao em "Estado".
    setStage('state');
    setSelectedState(null);
    setCities([]);
    setQuery('');
    onSelect({ ibgeCode: city.id, label });
  };

  const handleBack = () => {
    setStage('state');
    setSelectedState(null);
    setCities([]);
    setQuery('');
  };

  const handleClose = () => {
    // Reseta pro estagio inicial ao fechar -- reabrir o modal depois de
    // escolher (ou desistir) sempre comeca em "Estado" de novo, nao no
    // meio da lista de municipios de uma escolha anterior.
    setStage('state');
    setSelectedState(null);
    setCities([]);
    setQuery('');
    onClose();
  };

  // So busca local a partir de 3 letras -- com a lista inteira do estado
  // baixada de uma vez (ate ~650 municipios em SP), mostrar tudo por ordem
  // alfabetica assim que o estagio 'city' abre (ou com 1-2 letras digitadas)
  // deixava a lista grande e pouco util antes da pessoa digitar algo que
  // realmente filtre.
  const normalizedQuery = query.trim();
  const hasMinQueryLength = normalizedQuery.length >= 3;

  const filteredCities = useMemo(() => {
    if (!hasMinQueryLength) return [];
    const normalized = normalizedQuery.toLowerCase();
    return cities.filter((city) => city.nome.toLowerCase().includes(normalized));
  }, [cities, normalizedQuery, hasMinQueryLength]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            {stage === 'city' ? (
              <Pressable onPress={handleBack} hitSlop={12} accessibilityLabel="Voltar">
                <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
              </Pressable>
            ) : (
              <View style={styles.headerSpacer} />
            )}
            <Text style={styles.headerTitle}>{stage === 'state' ? 'Selecionar estado' : selectedState?.nome}</Text>
            <Pressable onPress={handleClose} hitSlop={12} accessibilityLabel="Fechar">
              <Ionicons name="close" size={24} color={colors3.onSurface} />
            </Pressable>
          </View>

          {stage === 'city' && (
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color={colors3.onSurfaceVariant} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar município..."
                placeholderTextColor={colors3.onSurfaceVariant}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
          )}

          {stage === 'state' ? (
            statesLoading ? (
              <ActivityIndicator color={colors3.primary} style={styles.loading} />
            ) : statesError ? (
              <Text style={styles.error}>{statesError}</Text>
            ) : (
              <FlatList
                data={states}
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <Pressable style={styles.row} onPress={() => handleSelectState(item)}>
                    <Text style={styles.rowName}>{item.nome}</Text>
                    <Text style={styles.rowUf}>{item.sigla}</Text>
                  </Pressable>
                )}
              />
            )
          ) : citiesLoading ? (
            <ActivityIndicator color={colors3.primary} style={styles.loading} />
          ) : citiesError ? (
            <Text style={styles.error}>{citiesError}</Text>
          ) : !hasMinQueryLength ? (
            <Text style={styles.searchHint}>Digite pelo menos 3 letras pra buscar.</Text>
          ) : (
            <FlatList
              data={filteredCities}
              keyExtractor={(item) => String(item.id)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Pressable style={styles.row} onPress={() => handleSelectCity(item)}>
                  <Text style={styles.rowName}>{item.nome}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>Nenhum município encontrado.</Text>}
            />
          )}
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
    minHeight: '50%',
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
  headerSpacer: { width: 22 },
  headerTitle: { ...typography3.headlineMd, fontSize: 18, flex: 1, textAlign: 'center' },
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
  loading: { marginTop: spacing3.xl },
  error: { ...typography3.bodyMd, color: colors3.error, textAlign: 'center', marginTop: spacing3.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors3.surfaceVariant,
  },
  rowName: { ...typography3.bodyMd, color: colors3.onSurface, flex: 1, marginRight: spacing3.sm },
  rowUf: { ...typography3.labelSm, color: colors3.onSurfaceVariant },
  empty: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center', marginTop: spacing3.xl },
  searchHint: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center', marginTop: spacing3.xl },
});
