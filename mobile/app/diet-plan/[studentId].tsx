import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/TextField';
import { getApiErrorMessage } from '@/services/api';
import {
  DietPlan,
  DietPlanData,
  createDietPlan,
  listStudentDietPlans,
  updateDietPlan,
} from '@/services/dietPlans';
import { colors, radius, spacing, typography } from '@/constants/theme';

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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{existingPlan ? 'Editar plano alimentar' : 'Novo plano alimentar'}</Text>
          {!!studentName && <Text style={styles.subtitle}>{studentName}</Text>}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!!loadError && <Text style={styles.error}>{loadError}</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}

          <Card style={styles.targetsCard}>
            <Text style={styles.sectionTitle}>Metas diarias (opcional)</Text>
            <View style={styles.targetsRow}>
              <TextField
                label="Kcal"
                placeholder="Ex: 2200"
                keyboardType="decimal-pad"
                value={calorieTarget}
                onChangeText={setCalorieTarget}
                style={styles.targetInput}
              />
              <TextField
                label="Proteina (g)"
                placeholder="Ex: 140"
                keyboardType="decimal-pad"
                value={proteinTarget}
                onChangeText={setProteinTarget}
                style={styles.targetInput}
              />
            </View>
            <View style={styles.targetsRow}>
              <TextField
                label="Carbo (g)"
                placeholder="Ex: 220"
                keyboardType="decimal-pad"
                value={carbsTarget}
                onChangeText={setCarbsTarget}
                style={styles.targetInput}
              />
              <TextField
                label="Gordura (g)"
                placeholder="Ex: 70"
                keyboardType="decimal-pad"
                value={fatTarget}
                onChangeText={setFatTarget}
                style={styles.targetInput}
              />
            </View>
          </Card>

          <Text style={styles.sectionTitle}>Refeicoes</Text>

          {meals.map((meal, mealIndex) => (
            <Card key={mealIndex} style={styles.mealCard}>
              <View style={styles.mealHeader}>
                <Text style={styles.mealHeaderTitle}>Refeicao {mealIndex + 1}</Text>
                {meals.length > 1 && (
                  <Pressable onPress={() => removeMeal(mealIndex)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                )}
              </View>

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

              <TextField
                label="Nome da refeicao"
                placeholder="Ex: Cafe da manha"
                value={meal.name}
                onChangeText={(value) => updateMeal(mealIndex, { name: value })}
              />
              <TextField
                label="Horario (opcional)"
                placeholder="Ex: 07:30"
                value={meal.time}
                onChangeText={(value) => updateMeal(mealIndex, { time: value })}
              />

              {meal.items.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.itemBlock}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemHeaderTitle}>Item {itemIndex + 1}</Text>
                    {meal.items.length > 1 && (
                      <Pressable onPress={() => removeItem(mealIndex, itemIndex)} hitSlop={8}>
                        <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                  <TextField
                    label="Alimento"
                    placeholder="Ex: Peito de frango"
                    value={item.food}
                    onChangeText={(value) => updateItem(mealIndex, itemIndex, { food: value })}
                  />
                  <TextField
                    label="Quantidade"
                    placeholder="Ex: 150g"
                    value={item.quantity}
                    onChangeText={(value) => updateItem(mealIndex, itemIndex, { quantity: value })}
                  />
                  <View style={styles.macroRow}>
                    <TextField
                      label="Kcal"
                      keyboardType="decimal-pad"
                      value={item.calories}
                      onChangeText={(value) => updateItem(mealIndex, itemIndex, { calories: value })}
                      style={styles.macroInput}
                    />
                    <TextField
                      label="Prot (g)"
                      keyboardType="decimal-pad"
                      value={item.protein}
                      onChangeText={(value) => updateItem(mealIndex, itemIndex, { protein: value })}
                      style={styles.macroInput}
                    />
                    <TextField
                      label="Carbo (g)"
                      keyboardType="decimal-pad"
                      value={item.carbs}
                      onChangeText={(value) => updateItem(mealIndex, itemIndex, { carbs: value })}
                      style={styles.macroInput}
                    />
                    <TextField
                      label="Gord (g)"
                      keyboardType="decimal-pad"
                      value={item.fat}
                      onChangeText={(value) => updateItem(mealIndex, itemIndex, { fat: value })}
                      style={styles.macroInput}
                    />
                  </View>
                </View>
              ))}

              <Button label="Adicionar item" variant="secondary" onPress={() => addItem(mealIndex)} />
            </Card>
          ))}

          <Button label="Adicionar refeicao" variant="secondary" onPress={addMeal} />

          <TextField
            label="Observacoes (opcional)"
            placeholder="Orientacoes gerais, substituicoes permitidas, etc."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            style={styles.notesInput}
          />

          <Button
            label={existingPlan ? 'Salvar alteracoes' : 'Criar plano'}
            onPress={handleSubmit}
            loading={saving}
            disabled={!canSubmit}
          />

          {!!existingPlan && existingPlan.status === 'active' && (
            <Button label="Arquivar plano" variant="secondary" onPress={handleArchive} loading={archiving} />
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h2 },
  subtitle: { ...typography.bodySecondary, marginTop: spacing.xs },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
  error: { color: colors.danger, textAlign: 'center' },
  sectionTitle: { ...typography.h3 },

  targetsCard: { gap: spacing.xs },
  targetsRow: { flexDirection: 'row', gap: spacing.sm },
  targetInput: { flex: 1 },

  mealCard: { gap: spacing.xs },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealHeaderTitle: { ...typography.body, fontWeight: '600' },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
  suggestionPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  suggestionText: { ...typography.caption, color: colors.accent, fontWeight: '700' },

  itemBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    gap: 0,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemHeaderTitle: { ...typography.caption, color: colors.textSecondary },
  macroRow: { flexDirection: 'row', gap: spacing.xs },
  macroInput: { flex: 1 },

  notesInput: { minHeight: 90, textAlignVertical: 'top' },
});
