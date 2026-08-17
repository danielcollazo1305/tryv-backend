import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { TextField2 } from '@/components/TextField2';
import { getApiErrorMessage } from '@/services/api';
import {
  DietPlan,
  DietPlanData,
  createDietPlan,
  listStudentDietPlans,
  updateDietPlan,
} from '@/services/dietPlans';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

const MEAL_NAME_SUGGESTIONS = ['Cafe da manha', 'Almoco', 'Lanche', 'Jantar', 'Ceia'];

interface ItemForm {
  food: string;
  quantity: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

interface MealForm {
  name: string;
  time: string;
  items: ItemForm[];
}

function emptyItem(): ItemForm {
  return { food: '', quantity: '', calories: '', protein: '', carbs: '', fat: '' };
}

function emptyMeal(): MealForm {
  return { name: '', time: '', items: [emptyItem()] };
}

function toMealForms(planData: DietPlanData | null): MealForm[] {
  const meals = planData?.meals ?? [];
  if (meals.length === 0) return [emptyMeal()];
  return meals.map((meal) => ({
    name: meal.name,
    time: meal.time ?? '',
    items:
      meal.items.length > 0
        ? meal.items.map((item) => ({
            food: item.food,
            quantity: item.quantity,
            calories: item.calories != null ? String(item.calories) : '',
            protein: item.protein != null ? String(item.protein) : '',
            carbs: item.carbs != null ? String(item.carbs) : '',
            fat: item.fat != null ? String(item.fat) : '',
          }))
        : [emptyItem()],
  }));
}

function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Soma dos macros dos itens ja preenchidos na refeicao — dado real
// calculado em cima do que o nutricionista ja digitou, nada inventado.
function sumMealMacros(items: ItemForm[]) {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + (toNumberOrUndefined(item.calories) ?? 0),
      protein: acc.protein + (toNumberOrUndefined(item.protein) ?? 0),
      carbs: acc.carbs + (toNumberOrUndefined(item.carbs) ?? 0),
      fat: acc.fat + (toNumberOrUndefined(item.fat) ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export default function DietPlanFormScreen() {
  const { studentId, studentName } = useLocalSearchParams<{ studentId: string; studentName?: string }>();

  const [existingPlan, setExistingPlan] = useState<DietPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [meals, setMeals] = useState<MealForm[]>([emptyMeal()]);
  const [calorieTarget, setCalorieTarget] = useState('');
  const [proteinTarget, setProteinTarget] = useState('');
  const [carbsTarget, setCarbsTarget] = useState('');
  const [fatTarget, setFatTarget] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExisting = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const plans = await listStudentDietPlans(studentId);
      const active = plans.find((plan) => plan.status === 'active') ?? null;
      setExistingPlan(active);
      if (active) {
        setMeals(toMealForms(active.plan_data));
        setCalorieTarget(active.daily_calorie_target != null ? String(active.daily_calorie_target) : '');
        setProteinTarget(active.daily_protein_target != null ? String(active.daily_protein_target) : '');
        setCarbsTarget(active.daily_carbs_target != null ? String(active.daily_carbs_target) : '');
        setFatTarget(active.daily_fat_target != null ? String(active.daily_fat_target) : '');
        setNotes(active.notes ?? '');
      }
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Nao foi possivel carregar o plano deste aluno.'));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      fetchExisting();
    }, [fetchExisting])
  );

  const updateMeal = (index: number, patch: Partial<MealForm>) => {
    setMeals((prev) => prev.map((meal, i) => (i === index ? { ...meal, ...patch } : meal)));
  };

  const updateItem = (mealIndex: number, itemIndex: number, patch: Partial<ItemForm>) => {
    setMeals((prev) =>
      prev.map((meal, i) =>
        i === mealIndex
          ? { ...meal, items: meal.items.map((item, j) => (j === itemIndex ? { ...item, ...patch } : item)) }
          : meal
      )
    );
  };

  const addMeal = () => setMeals((prev) => [...prev, emptyMeal()]);
  const removeMeal = (index: number) => setMeals((prev) => prev.filter((_, i) => i !== index));
  const addItem = (mealIndex: number) =>
    setMeals((prev) =>
      prev.map((meal, i) => (i === mealIndex ? { ...meal, items: [...meal.items, emptyItem()] } : meal))
    );
  const removeItem = (mealIndex: number, itemIndex: number) =>
    setMeals((prev) =>
      prev.map((meal, i) =>
        i === mealIndex ? { ...meal, items: meal.items.filter((_, j) => j !== itemIndex) } : meal
      )
    );

  const buildPlanData = (): DietPlanData => ({
    meals: meals
      .filter((meal) => meal.name.trim().length > 0)
      .map((meal) => ({
        name: meal.name.trim(),
        time: meal.time.trim() || undefined,
        items: meal.items
          .filter((item) => item.food.trim().length > 0)
          .map((item) => ({
            food: item.food.trim(),
            quantity: item.quantity.trim(),
            calories: toNumberOrUndefined(item.calories),
            protein: toNumberOrUndefined(item.protein),
            carbs: toNumberOrUndefined(item.carbs),
            fat: toNumberOrUndefined(item.fat),
          })),
      })),
  });

  const canSubmit = meals.some((meal) => meal.name.trim().length > 0);

  const handleSubmit = async () => {
    if (!studentId || !canSubmit) {
      setError('Adicione ao menos uma refeicao com nome antes de salvar.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const plan_data = buildPlanData();
      const payload = {
        plan_data,
        daily_calorie_target: toNumberOrUndefined(calorieTarget),
        daily_protein_target: toNumberOrUndefined(proteinTarget),
        daily_carbs_target: toNumberOrUndefined(carbsTarget),
        daily_fat_target: toNumberOrUndefined(fatTarget),
        notes: notes.trim() || undefined,
      };

      if (existingPlan) {
        await updateDietPlan(existingPlan.id, payload);
      } else {
        await createDietPlan({ user_id: studentId, ...payload });
      }
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o plano alimentar.'));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!existingPlan) return;
    setArchiving(true);
    setError(null);
    try {
      await updateDietPlan(existingPlan.id, { status: 'archived' });
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel arquivar o plano.'));
      setArchiving(false);
    }
  };

  return (
    <ScreenBackground2 style={styles.flex}>
    <KeyboardAvoidingView style={styles.innerFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors2.violet} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>{existingPlan ? 'EDICAO DE PLANO' : 'CRIACAO DE PLANO'}</Text>
            <Text style={styles.title}>Atleta: {studentName || 'Aluno'}</Text>
            <Text style={styles.subtitle}>Ajuste as metas diarias e componha as refeicoes para este plano.</Text>
          </View>

          {!!loadError && <Text style={styles.error}>{loadError}</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}

          <LiquiglassCard style={styles.targetsCard}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="flag" size={18} color={colors2.primary} />
              <Text style={styles.sectionTitle}>Metas diarias</Text>
            </View>
            <View style={styles.targetsGrid}>
              <TextField2
                label="Calorias (kcal)"
                placeholder="Ex: 2200"
                keyboardType="decimal-pad"
                value={calorieTarget}
                onChangeText={setCalorieTarget}
                style={styles.targetInput}
              />
              <TextField2
                label="Proteina (g)"
                placeholder="Ex: 140"
                keyboardType="decimal-pad"
                value={proteinTarget}
                onChangeText={setProteinTarget}
                style={styles.targetInput}
              />
              <TextField2
                label="Carboidrato (g)"
                placeholder="Ex: 220"
                keyboardType="decimal-pad"
                value={carbsTarget}
                onChangeText={setCarbsTarget}
                style={styles.targetInput}
              />
              <TextField2
                label="Gordura (g)"
                placeholder="Ex: 70"
                keyboardType="decimal-pad"
                value={fatTarget}
                onChangeText={setFatTarget}
                style={styles.targetInput}
              />
            </View>
          </LiquiglassCard>

          <View style={styles.mealsHeaderRow}>
            <Text style={styles.mealsTitle}>Refeicoes</Text>
            <Pressable style={styles.addMealButton} onPress={addMeal}>
              <Ionicons name="add-circle" size={18} color={colors2.primary} />
              <Text style={styles.addMealButtonText}>Nova refeicao</Text>
            </Pressable>
          </View>

          {meals.map((meal, mealIndex) => {
            const macros = sumMealMacros(meal.items);
            return (
              <LiquiglassCard key={mealIndex} style={styles.mealCard} padding={0}>
                <View style={styles.mealHeader}>
                  <View style={styles.mealHeaderLeft}>
                    <Ionicons name="restaurant" size={20} color={colors2.tertiary} />
                    <TextInput
                      style={styles.mealNameInput}
                      placeholder="Nome da refeicao"
                      placeholderTextColor={colors2.onSurfaceVariant}
                      value={meal.name}
                      onChangeText={(value) => updateMeal(mealIndex, { name: value })}
                    />
                  </View>
                  <View style={styles.mealHeaderRight}>
                    <View style={styles.macroPill}>
                      <Text style={styles.macroPillText}>{Math.round(macros.calories)} kcal</Text>
                      <Text style={styles.macroPillDot}>{'•'}</Text>
                      <Text style={styles.macroPillText}>P:{Math.round(macros.protein)}</Text>
                      <Text style={styles.macroPillText}>C:{Math.round(macros.carbs)}</Text>
                      <Text style={styles.macroPillText}>G:{Math.round(macros.fat)}</Text>
                    </View>
                    {meals.length > 1 && (
                      <Pressable onPress={() => removeMeal(mealIndex)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={colors2.danger} />
                      </Pressable>
                    )}
                  </View>
                </View>

                <View style={styles.mealBody}>
                  {!meal.name.trim() && (
                    <View style={styles.suggestionRow}>
                      {MEAL_NAME_SUGGESTIONS.map((suggestion) => (
                        <Pressable
                          key={suggestion}
                          style={styles.suggestionPill}
                          onPress={() => updateMeal(mealIndex, { name: suggestion })}
                        >
                          <Text style={styles.suggestionText}>{suggestion}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  <TextField2
                    label="Horario (opcional)"
                    placeholder="Ex: 07:30"
                    value={meal.time}
                    onChangeText={(value) => updateMeal(mealIndex, { time: value })}
                  />

                  {meal.items.map((item, itemIndex) => (
                    <View key={itemIndex} style={styles.itemRow}>
                      <View style={styles.itemRowHeader}>
                        <Text style={styles.itemHeaderTitle}>Item {itemIndex + 1}</Text>
                        {meal.items.length > 1 && (
                          <Pressable onPress={() => removeItem(mealIndex, itemIndex)} hitSlop={8}>
                            <Ionicons name="close-circle-outline" size={18} color={colors2.onSurfaceVariant} />
                          </Pressable>
                        )}
                      </View>
                      <TextField2
                        label="Alimento"
                        placeholder="Ex: Peito de frango"
                        value={item.food}
                        onChangeText={(value) => updateItem(mealIndex, itemIndex, { food: value })}
                      />
                      <TextField2
                        label="Quantidade"
                        placeholder="Ex: 150g"
                        value={item.quantity}
                        onChangeText={(value) => updateItem(mealIndex, itemIndex, { quantity: value })}
                      />
                      <View style={styles.macroRow}>
                        <TextField2
                          label="Kcal"
                          keyboardType="decimal-pad"
                          value={item.calories}
                          onChangeText={(value) => updateItem(mealIndex, itemIndex, { calories: value })}
                          style={styles.macroInput}
                        />
                        <TextField2
                          label="Prot (g)"
                          keyboardType="decimal-pad"
                          value={item.protein}
                          onChangeText={(value) => updateItem(mealIndex, itemIndex, { protein: value })}
                          style={styles.macroInput}
                        />
                        <TextField2
                          label="Carbo (g)"
                          keyboardType="decimal-pad"
                          value={item.carbs}
                          onChangeText={(value) => updateItem(mealIndex, itemIndex, { carbs: value })}
                          style={styles.macroInput}
                        />
                        <TextField2
                          label="Gord (g)"
                          keyboardType="decimal-pad"
                          value={item.fat}
                          onChangeText={(value) => updateItem(mealIndex, itemIndex, { fat: value })}
                          style={styles.macroInput}
                        />
                      </View>
                    </View>
                  ))}

                  <Pressable style={styles.addItemButton} onPress={() => addItem(mealIndex)}>
                    <Ionicons name="add" size={18} color={colors2.onSurfaceVariant} />
                    <Text style={styles.addItemButtonText}>Adicionar alimento</Text>
                  </Pressable>
                </View>
              </LiquiglassCard>
            );
          })}

          <TextField2
            label="Observacoes (opcional)"
            placeholder="Orientacoes gerais, substituicoes permitidas, etc."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            style={styles.notesInput}
          />
        </ScrollView>
      )}

      {!loading && (
        <View style={styles.footer}>
          {!!existingPlan && existingPlan.status === 'active' && (
            <Button2 label="Arquivar plano" variant="secondary" onPress={handleArchive} loading={archiving} />
          )}
          <Button2
            label={existingPlan ? 'Salvar alteracoes' : 'Criar plano'}
            onPress={handleSubmit}
            loading={saving}
            disabled={!canSubmit}
          />
        </View>
      )}
    </KeyboardAvoidingView>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  innerFlex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing2.containerMargin, paddingTop: 0, paddingBottom: 160, gap: spacing2.md },
  error: { color: colors2.danger, textAlign: 'center' },

  intro: { gap: spacing2.xs, marginBottom: spacing2.xs },
  eyebrow: { ...typography2.labelCaps, color: colors2.primary },
  title: { ...typography2.headlineLgMobile, fontSize: 22 },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors2.outlineVariant,
    paddingBottom: spacing2.sm,
  },
  sectionTitle: { ...typography2.headlineMd, fontSize: 16 },
  targetsCard: { gap: spacing2.md },
  targetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing2.sm },
  targetInput: { flexGrow: 1, flexBasis: '45%' },

  mealsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing2.xs,
  },
  mealsTitle: { ...typography2.headlineMd, fontSize: 20 },
  addMealButton: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  addMealButtonText: { ...typography2.bodyMd, fontSize: 14, color: colors2.primary, fontWeight: '600' },

  mealCard: { gap: 0, overflow: 'hidden' },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing2.md,
    borderBottomWidth: 1,
    borderBottomColor: colors2.outlineVariant,
    backgroundColor: 'rgba(42, 42, 42, 0.3)',
  },
  mealHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm, flex: 1 },
  mealNameInput: { ...typography2.bodyMd, fontSize: 16, fontWeight: '600', flex: 1, padding: 0 },
  mealHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  macroPill: {
    flexDirection: 'row',
    gap: spacing2.xs,
    backgroundColor: colors2.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderRadius: radius2.pill,
    paddingHorizontal: spacing2.sm,
    paddingVertical: 4,
  },
  macroPillText: { ...typography2.labelCaps, fontSize: 10, textTransform: 'none' },
  macroPillDot: { ...typography2.labelCaps, fontSize: 10, color: colors2.tertiary },

  mealBody: { padding: spacing2.md, gap: spacing2.xs },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing2.xs, marginBottom: spacing2.xs },
  suggestionPill: {
    paddingHorizontal: spacing2.sm,
    paddingVertical: spacing2.xs,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
  },
  suggestionText: { ...typography2.labelCaps, fontSize: 10, color: colors2.primary, textTransform: 'none' },

  itemRow: {
    borderTopWidth: 1,
    borderTopColor: colors2.outlineVariant,
    paddingTop: spacing2.sm,
    marginTop: spacing2.xs,
    gap: 0,
  },
  itemRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemHeaderTitle: { ...typography2.labelCaps, textTransform: 'none' },
  macroRow: { flexDirection: 'row', gap: spacing2.xs },
  macroInput: { flex: 1 },

  addItemButton: {
    marginTop: spacing2.xs,
    paddingVertical: spacing2.sm + 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors2.outlineVariant,
    borderRadius: radius2.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing2.xs,
  },
  addItemButtonText: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },

  notesInput: { minHeight: 90, textAlignVertical: 'top' },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing2.containerMargin,
    backgroundColor: 'rgba(19, 19, 19, 0.92)',
    borderTopWidth: 1,
    borderTopColor: colors2.outlineVariant,
    gap: spacing2.sm,
  },
});
