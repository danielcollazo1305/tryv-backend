import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button3 } from '@/components/Button3';
import { TextField2 } from '@/components/TextField2';
import {
  Equipment,
  EquipmentCategory,
  EquipmentUpdate,
  ShoeModel,
  createEquipment,
  searchShoeModels,
  updateEquipment,
} from '@/services/equipment';
import { getApiErrorMessage } from '@/services/api';
import { DEFAULT_ELIGIBLE_CATEGORIES, EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABELS } from '@/utils/equipmentCategories';
import { parseKmInput } from '@/utils/equipmentUsage';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

// Padroes sugeridos (os mesmos do servidor: settings default_shoe_lifespan_km / default_bike_maintenance_km).
const DEFAULT_SHOE_LIFESPAN_KM = '600';
const DEFAULT_BIKE_INTERVAL_KM = '1000';
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_CHARS = 2;

type ShoeSelection = 'none' | 'catalog' | 'other';

interface EquipmentFormModalProps {
  visible: boolean;
  mode: 'create' | 'edit';
  /** Obrigatorio em mode='edit'. */
  item?: Equipment | null;
  /** Em create: ja existe item ATIVO nessa categoria? (se nao, o novo vira padrao sozinho). */
  hasActiveInCategory: (category: EquipmentCategory) => boolean;
  onClose: () => void;
  /** Chamado depois de salvar com sucesso (o modal ja se fecha sozinho). */
  onSaved: () => void;
}

function serverStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } } | null)?.response?.status;
}

/**
 * Cadastro (create) e edicao (edit) de equipamento, no estilo do app (tema claro *3, sem icones).
 * - Tenis: busca no catalogo (marca + familia de modelo) com debounce, ou "Outro (digitar)"; catalogo
 *   vazio mostra so "Outro", sem erro.
 * - Bike: nome, km inicial, intervalo de revisao.
 * - Relogio / Fita cardiaca: so o nome.
 */
export function EquipmentFormModal({ visible, mode, item, hasActiveInCategory, onClose, onSaved }: EquipmentFormModalProps) {
  const [category, setCategory] = useState<EquipmentCategory | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [selection, setSelection] = useState<ShoeSelection>('none');
  const [shoe, setShoe] = useState<ShoeModel | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShoeModel[]>([]);
  const [searching, setSearching] = useState(false);
  const [initialKm, setInitialKm] = useState('');
  const [lifespanKm, setLifespanKm] = useState(DEFAULT_SHOE_LIFESPAN_KM);
  const [intervalKm, setIntervalKm] = useState(DEFAULT_BIKE_INTERVAL_KM);
  const [makeDefault, setMakeDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const isEdit = mode === 'edit';

  // Reabre limpo (create) ou preenchido com o item (edit).
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setSubmitting(false);
    setQuery('');
    setResults([]);
    setSearching(false);
    setShoe(null);
    setMakeDefault(false);
    if (isEdit && item) {
      setCategory(item.category);
      setName(item.name);
      setBrand(item.brand ?? '');
      setModel(item.model ?? '');
      setSelection('other');
      setInitialKm(item.initial_distance_km ? String(item.initial_distance_km) : '');
      setLifespanKm(item.lifespan_km != null ? String(item.lifespan_km) : DEFAULT_SHOE_LIFESPAN_KM);
      setIntervalKm(item.maintenance_interval_km != null ? String(item.maintenance_interval_km) : DEFAULT_BIKE_INTERVAL_KM);
    } else {
      setCategory(null);
      setName('');
      setBrand('');
      setModel('');
      setSelection('none');
      setInitialKm('');
      setLifespanKm(DEFAULT_SHOE_LIFESPAN_KM);
      setIntervalKm(DEFAULT_BIKE_INTERVAL_KM);
    }
  }, [visible, isEdit, item]);

  // Busca no catalogo: debounce de 300 ms, minimo de 2 letras, e respostas atrasadas sao descartadas
  // (searchSeq so aceita a ultima requisicao disparada).
  useEffect(() => {
    if (!visible || isEdit || category !== 'tenis' || selection !== 'none') return;
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      searchSeq.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchShoeModels(q);
        if (seq === searchSeq.current) setResults(data);
      } catch {
        // Falha na busca (ou catalogo ainda vazio): so a opcao "Outro" continua disponivel, sem erro.
        if (seq === searchSeq.current) setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, category, selection, visible, isEdit]);

  const pickShoe = (picked: ShoeModel) => {
    setShoe(picked);
    setSelection('catalog');
    setBrand(picked.brand);
    setModel(picked.model);
    setName(`${picked.brand} ${picked.model}`);
    setLifespanKm(String(picked.default_lifespan_km));
    setResults([]);
  };

  const pickOther = () => {
    setShoe(null);
    setSelection('other');
    setBrand('');
    setModel('');
    setLifespanKm(DEFAULT_SHOE_LIFESPAN_KM);
  };

  const backToSearch = () => {
    setShoe(null);
    setSelection('none');
    setName('');
    setBrand('');
    setModel('');
  };

  const canPickDefault = category != null && DEFAULT_ELIGIBLE_CATEGORIES.includes(category);
  const firstOfCategory = !isEdit && category != null && canPickDefault && !hasActiveInCategory(category);
  const showFields = category != null && (category !== 'tenis' || isEdit || selection !== 'none');

  const handleSubmit = async () => {
    if (!category) {
      setError('Selecione uma categoria.');
      return;
    }
    if (!name.trim()) {
      setError('Informe um nome pro item.');
      return;
    }
    const initial = parseKmInput(initialKm);
    if (initialKm.trim() && (initial == null || initial < 0)) {
      setError('Quilometragem inicial inválida.');
      return;
    }
    const lifespan = parseKmInput(lifespanKm);
    if (category === 'tenis' && lifespanKm.trim() && (lifespan == null || lifespan <= 0)) {
      setError('A vida útil precisa ser maior que zero.');
      return;
    }
    const interval = parseKmInput(intervalKm);
    if (category === 'bike' && intervalKm.trim() && (interval == null || interval <= 0)) {
      setError('O intervalo de revisão precisa ser maior que zero.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && item) {
        const patch: EquipmentUpdate = {};
        if (name.trim() !== item.name) patch.name = name.trim();
        if (category === 'tenis') {
          if (lifespan != null && lifespan !== item.lifespan_km) patch.lifespan_km = lifespan;
        }
        if (category === 'bike') {
          if (interval != null && interval !== item.maintenance_interval_km) patch.maintenance_interval_km = interval;
        }
        if (DEFAULT_ELIGIBLE_CATEGORIES.includes(category)) {
          const nextInitial = initial ?? 0;
          if (nextInitial !== item.initial_distance_km) patch.initial_distance_km = nextInitial;
        }
        if (Object.keys(patch).length > 0) await updateEquipment(item.id, patch);
      } else {
        await createEquipment({
          category,
          name: name.trim(),
          ...(category === 'tenis'
            ? {
                brand: brand.trim() || null,
                model: model.trim() || null,
                shoe_model_id: shoe?.id ?? null,
                lifespan_km: lifespan ?? null,
              }
            : {}),
          ...(category === 'bike' ? { maintenance_interval_km: interval ?? null } : {}),
          ...(canPickDefault ? { initial_distance_km: initial ?? null, is_default: makeDefault } : {}),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      if (serverStatus(err) === 409) {
        setError('Não foi possível definir o equipamento padrão agora (outra alteração estava em andamento). Toque em Salvar para tentar de novo.');
      } else {
        setError(getApiErrorMessage(err, 'Não foi possível salvar o item, tente novamente.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const title = isEdit ? 'Editar item' : 'Novo item';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => !submitting && onClose()}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.avoider}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={12} disabled={submitting}>
                <Text style={styles.closeText}>Fechar</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {!isEdit && (
                <>
                  <Text style={styles.fieldLabel}>Categoria</Text>
                  <View style={styles.pills}>
                    {EQUIPMENT_CATEGORIES.map((c) => {
                      const selected = category === c;
                      return (
                        <Pressable
                          key={c}
                          style={[styles.pill, selected && styles.pillSelected]}
                          onPress={() => {
                            setCategory(c);
                            setSelection(c === 'tenis' ? 'none' : 'other');
                            setShoe(null);
                            setName('');
                            setBrand('');
                            setModel('');
                          }}
                        >
                          <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{EQUIPMENT_CATEGORY_LABELS[c]}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {/* TENIS: busca no catalogo ou "Outro" */}
              {!isEdit && category === 'tenis' && selection === 'none' && (
                <View style={styles.block}>
                  <TextField2
                    variant="light"
                    label="Buscar modelo (marca ou nome)"
                    placeholder="Ex: Nike Pegasus"
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                  />
                  {results.map((r) => (
                    <Pressable key={r.id} style={styles.resultRow} onPress={() => pickShoe(r)}>
                      <Text style={styles.resultTitle}>
                        {r.brand} {r.model}
                      </Text>
                      <Text style={styles.resultSub}>Vida útil sugerida: {r.default_lifespan_km} km</Text>
                    </Pressable>
                  ))}
                  {searching && <Text style={styles.hint}>Buscando…</Text>}
                  <Pressable style={styles.resultRow} onPress={pickOther}>
                    <Text style={styles.resultTitle}>Outro (digitar)</Text>
                    <Text style={styles.resultSub}>Não achou o modelo? Cadastre com marca e nome livres.</Text>
                  </Pressable>
                </View>
              )}

              {!isEdit && category === 'tenis' && selection !== 'none' && (
                <View style={styles.selectedRow}>
                  <Text style={styles.selectedText}>
                    {selection === 'catalog' ? 'Modelo do catálogo' : 'Outro modelo (texto livre)'}
                  </Text>
                  <Pressable onPress={backToSearch} hitSlop={8}>
                    <Text style={styles.linkText}>Trocar</Text>
                  </Pressable>
                </View>
              )}

              {showFields && (
                <View style={styles.block}>
                  {!isEdit && category === 'tenis' && selection === 'other' && (
                    <>
                      <TextField2 variant="light" label="Marca (opcional)" value={brand} onChangeText={setBrand} placeholder="Ex: Nike" />
                      <TextField2 variant="light" label="Modelo (opcional)" value={model} onChangeText={setModel} placeholder="Ex: Pegasus" />
                    </>
                  )}
                  <TextField2
                    variant="light"
                    label="Nome"
                    placeholder={category === 'tenis' ? 'Ex: Nike Pegasus' : category === 'bike' ? 'Ex: Speed' : 'Ex: Garmin 255'}
                    value={name}
                    onChangeText={setName}
                    maxLength={60}
                  />

                  {canPickDefault && (
                    <TextField2
                      variant="light"
                      label="Quilometragem inicial (opcional)"
                      placeholder="0"
                      value={initialKm}
                      onChangeText={setInitialKm}
                      keyboardType="decimal-pad"
                    />
                  )}
                  {category === 'tenis' && (
                    <TextField2
                      variant="light"
                      label="Vida útil (km)"
                      value={lifespanKm}
                      onChangeText={setLifespanKm}
                      keyboardType="decimal-pad"
                    />
                  )}
                  {category === 'bike' && (
                    <TextField2
                      variant="light"
                      label="Intervalo de revisão (km)"
                      value={intervalKm}
                      onChangeText={setIntervalKm}
                      keyboardType="decimal-pad"
                    />
                  )}

                  {!isEdit && canPickDefault && (
                    <View style={styles.switchRow}>
                      <View style={styles.switchTexts}>
                        <Text style={styles.switchLabel}>Usar como padrão</Text>
                        <Text style={styles.hint}>
                          {firstOfCategory
                            ? 'É o primeiro desta categoria, então já vira o padrão sozinho.'
                            : 'O padrão entra sozinho nas suas atividades (inclusive as importadas).'}
                        </Text>
                      </View>
                      <Switch
                        value={firstOfCategory ? true : makeDefault}
                        onValueChange={setMakeDefault}
                        disabled={firstOfCategory}
                        trackColor={{ true: colors3.primary }}
                      />
                    </View>
                  )}
                </View>
              )}

              {!!error && <Text style={styles.error}>{error}</Text>}
            </ScrollView>

            {showFields && (
              <Button3 label={isEdit ? 'Salvar' : 'Adicionar'} onPress={handleSubmit} loading={submitting} />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'flex-end' },
  avoider: { width: '100%' },
  sheet: {
    backgroundColor: colors3.background,
    borderTopLeftRadius: radius3.xl,
    borderTopRightRadius: radius3.xl,
    padding: spacing3.lg,
    paddingBottom: spacing3.xl,
    gap: spacing3.md,
    maxHeight: '90%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography3.headlineMd, fontSize: 18 },
  closeText: { ...typography3.labelMd, color: colors3.primary },
  body: { gap: spacing3.md, paddingBottom: spacing3.sm },
  block: { gap: spacing3.xs },
  fieldLabel: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginLeft: spacing3.xs },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing3.sm },
  pill: {
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
  },
  pillSelected: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  pillText: { ...typography3.labelSm, textTransform: 'none', color: colors3.primary },
  pillTextSelected: { color: colors3.onPrimary },

  resultRow: {
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    borderRadius: radius3.md,
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm,
    gap: 2,
  },
  resultTitle: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },
  resultSub: { ...typography3.labelSm, textTransform: 'none' },
  hint: { ...typography3.labelSm, textTransform: 'none' },

  selectedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectedText: { ...typography3.labelMd, color: colors3.onSurfaceVariant },
  linkText: { ...typography3.labelMd, color: colors3.primary },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md, marginTop: spacing3.xs },
  switchTexts: { flex: 1, gap: 2 },
  switchLabel: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },

  error: { ...typography3.bodyMd, color: colors3.error, textAlign: 'center' },
});
