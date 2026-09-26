import React, { useEffect, useMemo, useState } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button3 } from '@/components/Button3';
import { ExercisePickerModal } from '@/components/ExercisePickerModal';
import { GlassCard } from '@/components/GlassCard';
import { ExerciseVideoBlock, SetEntry, SetLogSection } from '@/components/WorkoutDayCard';
import { FreeSessionExerciseDraft, useElapsedLabel, useWorkoutSessionDraft } from '@/context/WorkoutSessionDraftContext';
import { ExerciseLibraryEntry, getExerciseInfo } from '@/constants/exerciseLibrary';
import { logFreeWorkoutSession } from '@/services/workouts';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/** Re-exportado por conveniencia (o formato "de verdade" mora em WorkoutSessionDraftContext.tsx — ver comentario la sobre por que o Context nao importa de um componente de tela). */
export type FreeSessionExercise = FreeSessionExerciseDraft;

const DEFAULT_SET_COUNT = 3;
/** Distancia minima de arraste (px) pra contar como swipe de navegacao, em vez de um toque acidental/scroll vertical dentro da SetLogSection. */
const SWIPE_THRESHOLD = 100;
/**
 * Velocidade minima (px/ms, gesture.vx) pra um arraste CURTO ainda contar
 * como swipe intencional -- cobre o flick rapido e decidido que nao teve
 * tempo de percorrer SWIPE_THRESHOLD inteiro. Sem isso, so a distancia
 * faria a troca de exercicio parecer "pesada" pra quem arrasta rapido de
 * proposito.
 */
const SWIPE_VELOCITY_THRESHOLD = 0.5;
/** Distancia minima (px) mesmo com velocidade alta -- um pico de vx por ruido do toque, quase sem deslocar o dedo, nao deveria contar. */
const MIN_FLICK_DISTANCE = 30;

function buildDefaultSets(): SetEntry[] {
  return Array.from({ length: DEFAULT_SET_COUNT }, () => ({ weightKg: '', reps: '', completed: false }));
}

interface FreeWorkoutLogViewProps {
  /** Chamado apos salvar a sessao com sucesso (ex: navegar de volta). */
  onDone: () => void;
}

/**
 * Registro de treino "livre" — sem plano nenhum associado. Ponto de
 * entrada universal do card "Começar treino" (TodayWorkoutCard.tsx) quando
 * nao ha plano de IA ativo pra hoje: a pessoa escolhe exercicios
 * manualmente (ExercisePickerModal, biblioteca local em
 * constants/exerciseLibrary.ts) e registra peso/reps livremente,
 * reaproveitando o mesmo SetLogSection ja usado no registro de plano
 * (WorkoutDayCard.tsx) — mesma UI de series, sem duplicar layout.
 *
 * Migrado pro tema claro "prism-glass" (colors3/GlassCard/Button3,
 * SetLogSection variant="light") seguindo o mockup aprovado — essa tela e
 * deliberadamente mais neutra que o resto do app: o botao tracejado
 * "Adicionar exercício" fica em tom cinza/neutro (colors3.onSurfaceVariant)
 * em vez do roxo de destaque, pra nao competir visualmente com o fluxo de
 * "Gerar treino com IA". ExercisePickerModal ja estava 100% migrado antes
 * desta tarefa (nao mexido aqui).
 *
 * FLUXO DE CAROUSEL (um exercicio por vez): so mostra `exercises[currentIndex]`
 * em vez de empilhar todos numa ScrollView vertical -- ajuda quem esta
 * registrando serie por serie durante o treino a nao se perder rolando uma
 * lista longa. Navegacao por swipe (PanResponder, ja nativo do RN core --
 * NAO ha nenhum carrossel/paginador nem reanimated/gesture-handler
 * instalado no projeto hoje, ver investigacao; trazer uma lib nativa nova
 * exigiria rebuild do dev client so pra isso, sem necessidade) + setas e
 * bolinhas de posicao (redundantes de proposito: bolinha fica minuscula
 * demais pra tocar com precisao quando ha muitos exercicios, a seta
 * garante um passo confiavel independente da quantidade).
 *
 * Exercicio "finalizado" NAO tranca nada -- o botao so avanca pro proximo
 * (currentIndex+1); dar swipe/tocar seta/bolinha de volta continua editando
 * livremente qualquer exercicio ja visitado (decisao explicita: mais
 * seguro permitir corrigir um peso/rep digitado errado do que travar).
 *
 * `currentIndex` e local (useState), NAO persistido no draft/disco -- sair
 * da tela e voltar preserva os dados de peso/reps de cada exercicio (isso
 * continua vindo do Context, sem mudanca), mas a posicao no carrossel
 * volta pro exercicio 0. Escolha deliberada pra nao mexer no formato do
 * WorkoutSessionDraft por causa de um detalhe de navegacao de UI.
 */
export function FreeWorkoutLogView({ onDone }: FreeWorkoutLogViewProps) {
  // Le/escreve pelo WorkoutSessionDraftContext (nao um useState local) —
  // sobrevive a navegar pra outra aba/tela e voltar antes de concluir o
  // treino (ex: usuario abre a Home no meio do registro pra conferir algo,
  // depois volta e continua de onde parou). Se ja houver um draft mode:
  // 'free' em andamento (retomando apos navegar embora sem concluir),
  // `exercises` comeca com ele em vez de vazio.
  const { draft, setDraft } = useWorkoutSessionDraft();
  const exercises = draft?.mode === 'free' ? draft.exercises : [];
  const elapsedLabel = useElapsedLabel(draft?.mode === 'free' ? draft.startedAt : null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Rede de seguranca pra remocao de exercicio (ou o proprio draft
  // encolhendo por qualquer outro motivo): sem isso, remover o card atual
  // (ou um antes dele) deixaria currentIndex apontando pra fora do array.
  useEffect(() => {
    if (exercises.length > 0 && currentIndex > exercises.length - 1) {
      setCurrentIndex(exercises.length - 1);
    }
  }, [exercises.length, currentIndex]);

  const goToIndex = (index: number) => {
    if (exercises.length === 0) return;
    setCurrentIndex(Math.max(0, Math.min(index, exercises.length - 1)));
  };
  const goNext = () => goToIndex(currentIndex + 1);
  const goPrev = () => goToIndex(currentIndex - 1);

  // Recriado a cada mudanca de currentIndex/exercises.length pra goNext/
  // goPrev dentro do handler nao ficarem presos a um closure velho.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Limiar de reivindicacao do gesto subido de 20 pra 45px (e a
        // proporcao horizontal/vertical de 1.5 pra 2.2) -- 20px reivindicava
        // o gesto com pouquissimo movimento, o suficiente pra disparar sem
        // querer so tocando num input de peso/reps ou comecando a rolar a
        // tela. So assume "isto e um swipe" quando o arraste ja e claramente
        // horizontal e deliberado.
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > 45 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2.2,
        onPanResponderRelease: (_evt, gesture) => {
          const distance = Math.abs(gesture.dx);
          // Troca de exercicio com um arraste longo o suficiente (SWIPE_THRESHOLD)
          // OU um flick curto mas rapido e decidido (velocidade alta) --
          // um deslize lento e curto (dedo escorregando sem querer) nao
          // bate nenhum dos dois e e ignorado.
          const isIntentional =
            distance >= SWIPE_THRESHOLD ||
            (distance >= MIN_FLICK_DISTANCE && Math.abs(gesture.vx) >= SWIPE_VELOCITY_THRESHOLD);
          if (!isIntentional) return;
          if (gesture.dx < 0) goNext();
          else goPrev();
        },
      }),
    [currentIndex, exercises.length]
  );

  const updateExercises = (updater: (prev: FreeSessionExercise[]) => FreeSessionExercise[]) => {
    setDraft((prevDraft) => {
      const prevExercises = prevDraft?.mode === 'free' ? prevDraft.exercises : [];
      // Mantem o startedAt ja existente (treino em andamento) -- so grava
      // Date.now() na primeira vez que o draft livre passa a existir (nao
      // ha um botao explicito de "iniciar treino" separado do primeiro
      // "Adicionar exercicio", entao esse e o momento real de inicio).
      const startedAt = prevDraft?.mode === 'free' ? prevDraft.startedAt : Date.now();
      return { mode: 'free', exercises: updater(prevExercises), startedAt };
    });
  };

  const handleAddExercise = (entry: ExerciseLibraryEntry) => {
    updateExercises((prev) => {
      if (prev.some((ex) => ex.name === entry.name)) return prev;
      return [...prev, { name: entry.name, sets: buildDefaultSets() }];
    });
    // Fica na pagina atual de proposito -- o novo exercicio entra no fim
    // da sequencia, nao interrompe o que a pessoa estava preenchendo.
  };

  const handleRemoveExercise = (name: string) => {
    updateExercises((prev) => prev.filter((ex) => ex.name !== name));
  };

  const handleSetsChange = (name: string, sets: SetEntry[]) => {
    updateExercises((prev) => prev.map((ex) => (ex.name === name ? { ...ex, sets } : ex)));
  };

  const handleComplete = async () => {
    if (exercises.length === 0) {
      Alert.alert('Nenhum exercício adicionado', 'Adicione ao menos 1 exercício antes de concluir o treino.');
      return;
    }

    setSaving(true);
    try {
      await logFreeWorkoutSession({
        exercises: exercises.map((exercise) => ({
          name: exercise.name,
          planned_sets: exercise.sets.length,
          planned_reps: '',
          // So salva series de fato preenchidas — mesmo criterio ja usado
          // pro registro de plano em WorkoutPlanView.tsx.
          sets: exercise.sets
            .filter((set) => set.completed || set.weightKg.trim() || set.reps.trim())
            .map((set) => ({
              weight_kg: set.weightKg.trim() ? Number(set.weightKg.replace(',', '.')) : null,
              reps: set.reps.trim() ? Number(set.reps) : null,
              completed: set.completed,
            })),
        })),
      });
      setDraft(null);
      onDone();
    } catch {
      Alert.alert('Não foi possível salvar o treino', 'Tente novamente mais tarde.');
    } finally {
      setSaving(false);
    }
  };

  const currentExercise = exercises[currentIndex];
  const isLast = currentIndex === exercises.length - 1;
  const showNav = exercises.length > 1;

  return (
    <View style={styles.container}>
      {draft?.mode === 'free' && (
        <View style={styles.timerRow}>
          <Ionicons name="time-outline" size={16} color={colors3.primary} />
          <Text style={styles.timerText}>{elapsedLabel}</Text>
        </View>
      )}

      <Text style={styles.summary}>
        Escolha os exercícios que você fez e registre peso/reps de cada série — sem depender de nenhum plano.
      </Text>

      {showNav && (
        <View style={styles.navHeader}>
          <Text style={styles.navLabel}>
            Exercício {currentIndex + 1} de {exercises.length}
          </Text>
          <View style={styles.dotsRow}>
            {exercises.map((exercise, index) => (
              <Pressable key={exercise.name} onPress={() => goToIndex(index)} hitSlop={8}>
                <View style={[styles.dot, index === currentIndex && styles.dotActive]} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {currentExercise ? (
        <View style={styles.carouselRow}>
          {showNav && (
            <Pressable
              onPress={goPrev}
              disabled={currentIndex === 0}
              hitSlop={8}
              accessibilityLabel="Exercício anterior"
              style={[styles.navArrow, currentIndex === 0 && styles.navArrowDisabled]}
            >
              <Ionicons name="chevron-back" size={20} color={colors3.onSurfaceVariant} />
            </Pressable>
          )}

          <ScrollView
            style={styles.exerciseScroll}
            contentContainerStyle={styles.exerciseScrollContent}
            {...panResponder.panHandlers}
          >
            <GlassCard key={currentExercise.name} variant="card" style={styles.exerciseCard} padding={spacing3.md}>
              <View style={styles.exerciseHeader}>
                <Text style={styles.exerciseName}>{currentExercise.name}</Text>
                <Pressable
                  hitSlop={8}
                  accessibilityLabel={`Remover ${currentExercise.name}`}
                  onPress={() => handleRemoveExercise(currentExercise.name)}
                >
                  <Ionicons name="trash-outline" size={18} color={colors3.onSurfaceVariant} />
                </Pressable>
              </View>
              <ExerciseVideoBlock videoUrl={getExerciseInfo(currentExercise.name)?.videoUrl} isLight={true} />
              <SetLogSection
                variant="light"
                plannedSets={currentExercise.sets.length}
                sets={currentExercise.sets}
                onChange={(sets) => handleSetsChange(currentExercise.name, sets)}
                exerciseName={currentExercise.name}
              />
              <Button3
                label={isLast ? 'Finalizar treino' : 'Finalizar exercício'}
                onPress={isLast ? handleComplete : goNext}
                loading={isLast && saving}
              />
            </GlassCard>
          </ScrollView>

          {showNav && (
            <Pressable
              onPress={goNext}
              disabled={currentIndex === exercises.length - 1}
              hitSlop={8}
              accessibilityLabel="Próximo exercício"
              style={[styles.navArrow, currentIndex === exercises.length - 1 && styles.navArrowDisabled]}
            >
              <Ionicons name="chevron-forward" size={20} color={colors3.onSurfaceVariant} />
            </Pressable>
          )}
        </View>
      ) : (
        <Text style={styles.emptyText}>Nenhum exercício adicionado ainda.</Text>
      )}

      <Pressable style={styles.addExerciseButton} onPress={() => setPickerOpen(true)}>
        <Ionicons name="add-circle-outline" size={20} color={colors3.onSurfaceVariant} />
        <Text style={styles.addExerciseText}>Adicionar exercício</Text>
      </Pressable>

      <ExercisePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAddExercise}
        addedNames={exercises.map((ex) => ex.name)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing3.md },
  summary: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs, alignSelf: 'flex-start' },
  timerText: { ...typography3.labelMd, color: colors3.primary, fontVariant: ['tabular-nums'] },
  navHeader: { gap: spacing3.xs },
  navLabel: { ...typography3.labelMd, color: colors3.onSurfaceVariant },
  dotsRow: { flexDirection: 'row', gap: spacing3.xs },
  dot: { width: 6, height: 6, borderRadius: radius3.pill, backgroundColor: colors3.outlineVariant },
  dotActive: { backgroundColor: colors3.primary, width: 16 },
  carouselRow: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: spacing3.xs },
  navArrow: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowDisabled: { opacity: 0.3 },
  exerciseScroll: { flex: 1 },
  exerciseScrollContent: { paddingBottom: spacing3.md },
  exerciseCard: { gap: spacing3.sm },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exerciseName: { ...typography3.bodyMd, fontSize: 16, fontWeight: '700' },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing3.xs,
    paddingVertical: spacing3.md,
    borderRadius: radius3.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors3.outlineVariant,
  },
  addExerciseText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, fontWeight: '600' },
});
