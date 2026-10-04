import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { TextField2 } from '@/components/TextField2';
import { getApiErrorMessage } from '@/services/api';
import { Food, logFood, searchFoods } from '@/services/foods';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
const DEFAULT_GRAMS = '100';
const MAX_GRAMS = 5000;

const ATTRIBUTION =
  'Fonte: Tabela Brasileira de Composição de Alimentos - TACO, 4ª edição revisada e ampliada, NEPA/UNICAMP, Campinas, 2011. Dados processados por terceiros.';

type SearchState = 'idle' | 'loading' | 'ready' | 'error';

/** pt-BR com exatamente 1 casa (vírgula decimal): 25.8 -> "25,8", 1 -> "1,0". */
function fmt1(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Mesma regra do backend (POST /foods/{id}/log): valor * gramas / 100, 1 casa, macro nulo conta 0. */
function scaled(valuePer100g: number | null, grams: number): number {
  return Math.round(((valuePer100g ?? 0) * grams) / 100 * 10) / 10;
}

/** "124 kcal · P 2,6 g · C 25,8 g · G 1,0 g · por 100 g" -- só os macros que existem. */
function per100Summary(food: Food): string {
  const kcal = food.kcal == null ? null : `${Math.round(food.kcal)} kcal${food.kcal_estimated ? ' (estimado)' : ''}`;
  const parts = [
    kcal,
    food.protein == null ? null : `P ${fmt1(food.protein)} g`,
    food.carbohydrates == null ? null : `C ${fmt1(food.carbohydrates)} g`,
    food.lipids == null ? null : `G ${fmt1(food.lipids)} g`,
    'por 100 g',
  ].filter((part): part is string => part !== null);
  return parts.join(' · ');
}

/** Gramas válidas: número > 0 e <= 5000 (aceita vírgula). null = inválido. */
function parseGrams(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 && value <= MAX_GRAMS ? value : null;
}

interface FoodRowProps {
  food: Food;
  expanded: boolean;
  onToggle: () => void;
}

function FoodRow({ food, expanded, onToggle }: FoodRowProps) {
  const [gramsText, setGramsText] = useState(DEFAULT_GRAMS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unavailable = food.kcal == null;
  const grams = parseGrams(gramsText);

  const preview = useMemo(() => {
    if (grams == null || food.kcal == null) return null;
    return {
      kcal: scaled(food.kcal, grams),
      protein: scaled(food.protein, grams),
      carbs: scaled(food.carbohydrates, grams),
      fat: scaled(food.lipids, grams),
    };
  }, [grams, food]);

  const handleLog = async () => {
    if (grams == null) {
      setError(`Informe uma quantidade entre 0 e ${MAX_GRAMS} g.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await logFood(food.id, grams);
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível registrar o alimento.'));
      setBusy(false);
    }
  };

  return (
    <View style={[styles.row, unavailable && styles.rowDisabled, expanded && styles.rowExpanded]}>
      <Pressable
        onPress={onToggle}
        disabled={unavailable}
        accessibilityRole="button"
        accessibilityState={{ disabled: unavailable, expanded }}
        accessibilityLabel={unavailable ? `${food.name}, sem dados de calorias` : `Registrar ${food.name}`}
        style={styles.rowHeader}
      >
        <View style={styles.rowTexts}>
          <Text style={styles.rowName}>{food.name}</Text>
          <Text style={styles.rowCategory}>{food.category}</Text>
          {unavailable ? (
            <Text style={styles.rowUnavailable}>Sem dados de calorias — use o registro manual</Text>
          ) : (
            <Text style={styles.rowSummary}>{per100Summary(food)}</Text>
          )}
        </View>
        {!unavailable && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'add-circle-outline'}
            size={expanded ? 20 : 24}
            color={colors3.primary}
          />
        )}
      </Pressable>

      {expanded && !unavailable && (
        <View style={styles.portion}>
          <TextField2
            variant="light"
            label="Quantidade (g)"
            keyboardType="decimal-pad"
            value={gramsText}
            onChangeText={(text) => {
              setGramsText(text);
              setError(null);
            }}
            selectTextOnFocus
            style={styles.gramsInput}
          />
          <Text style={styles.previewLabel}>Vai registrar</Text>
          <Text style={styles.previewValue}>
            {preview
              ? `${fmt1(preview.kcal)} kcal · P ${fmt1(preview.protein)} g · C ${fmt1(preview.carbs)} g · G ${fmt1(preview.fat)} g`
              : '—'}
          </Text>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Button3 label="Registrar" onPress={handleLog} loading={busy} disabled={grams == null || busy} />
        </View>
      )}
    </View>
  );
}

/**
 * Busca de alimento na TACO (GET /foods/search) com registro por gramas (POST
 * /foods/{id}/log). Gratuita (sem ProGate). Dados por 100 g; a prévia usa a
 * mesma regra do backend. Atribuição à fonte fixa no rodapé (exigência da
 * UNICAMP, ver backend/app/data/TACO_ATTRIBUTION.md).
 */
export default function FoodSearchScreen() {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [state, setState] = useState<SearchState>('idle');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Cada busca ganha um número; só a mais recente pode atualizar a tela
  // (descarta resposta atrasada de um texto que já mudou).
  const requestSeq = useRef(0);

  const runSearch = useCallback(async (text: string) => {
    const seq = ++requestSeq.current;
    setState('loading');
    try {
      const data = await searchFoods(text);
      if (seq !== requestSeq.current) return;
      setFoods(data);
      setExpandedId(null);
      setState('ready');
    } catch {
      if (seq !== requestSeq.current) return;
      setState('error');
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestSeq.current++; // invalida qualquer busca em voo
      setFoods([]);
      setExpandedId(null);
      setState('idle');
      return;
    }
    const timer = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const trimmedQuery = query.trim();

  return (
    <ScreenBackground3 style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Buscar alimento</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors3.onSurfaceVariant} />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <TextField2
            variant="light"
            label="Alimento"
            placeholder="Ex: arroz, frango grelhado, banana"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        <FlatList
          data={state === 'ready' ? foods : []}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing3.sm }} />}
          renderItem={({ item }) => (
            <FoodRow
              food={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
            />
          )}
          ListEmptyComponent={
            <View style={styles.stateBox}>
              {state === 'idle' && (
                <Text style={styles.stateText}>Digite pelo menos 2 letras pra buscar.</Text>
              )}
              {state === 'loading' && <ActivityIndicator color={colors3.primary} />}
              {state === 'ready' && (
                <Text style={styles.stateText}>Nenhum alimento encontrado para "{trimmedQuery}".</Text>
              )}
              {state === 'error' && (
                <>
                  <Text style={styles.stateText}>Não foi possível buscar agora.</Text>
                  <Pressable onPress={() => runSearch(trimmedQuery)} hitSlop={8}>
                    <Text style={styles.retry}>Tentar de novo</Text>
                  </Pressable>
                </>
              )}
            </View>
          }
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>{ATTRIBUTION}</Text>
        </View>
      </KeyboardAvoidingView>
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
  title: { ...typography3.headlineMd, fontSize: 22 },
  searchWrap: { paddingHorizontal: spacing3.containerMargin },
  listContent: { padding: spacing3.containerMargin, paddingTop: spacing3.sm, flexGrow: 1 },

  stateBox: { alignItems: 'center', gap: spacing3.sm, paddingVertical: spacing3.xl },
  stateText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
  retry: { ...typography3.labelMd, color: colors3.primary },

  // View simples (não GlassCard): até 50 linhas, e 1 BlurView por linha pesaria na lista.
  row: {
    backgroundColor: colors3.surfaceContainerLowest,
    borderRadius: radius3.lg,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    overflow: 'hidden',
  },
  rowDisabled: { opacity: 0.55 },
  rowExpanded: { borderColor: colors3.primary },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm, padding: spacing3.md },
  rowTexts: { flex: 1, gap: 2 },
  rowName: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },
  rowCategory: { ...typography3.labelSm, textTransform: 'none' },
  rowSummary: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  rowUnavailable: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant, fontStyle: 'italic' },

  portion: { paddingHorizontal: spacing3.md, paddingBottom: spacing3.md, gap: spacing3.xs },
  gramsInput: { marginBottom: 0 },
  previewLabel: { ...typography3.labelSm, textTransform: 'none', marginTop: spacing3.xs },
  previewValue: { ...typography3.bodyMd, fontFamily: 'Inter_600SemiBold', marginBottom: spacing3.xs },
  error: { ...typography3.bodyMd, fontSize: 13, color: colors3.error },

  footer: {
    paddingHorizontal: spacing3.containerMargin,
    paddingVertical: spacing3.sm,
    borderTopWidth: 1,
    borderTopColor: colors3.outlineVariant,
    backgroundColor: colors3.background,
  },
  footerText: { ...typography3.labelSm, textTransform: 'none', textAlign: 'center' },
});
