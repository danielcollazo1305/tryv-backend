import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { AiWorkoutSection } from '@/components/AiWorkoutSection';
import { GlassCard } from '@/components/GlassCard';
import { ProGate } from '@/components/ProGate';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { VitalityMonitor } from '@/components/VitalityMonitor';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { WorkoutPlan, listWorkoutPlans } from '@/services/workouts';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/**
 * Botao "+" da aba Treino: abre a tela "Treinar" (/treinar, menu retro de 2 niveis). Ela substitui o antigo
 * modal "Iniciar atividade"; Corrida/Caminhada/Bike, Halter e Luta viraram modalidades de la, e a selecao
 * antiga (natacao, HIIT, outro) continua em "Outras atividades" (/activity/new sem parametros).
 */
function StartActivityFab() {
  return (
    <Pressable
      style={styles.fab}
      onPress={() => router.push('/treinar')}
      accessibilityRole="button"
      accessibilityLabel="Iniciar treino"
    >
      <Ionicons name="add" size={28} color={colors3.onPrimary} />
    </Pressable>
  );
}

/**
 * Aba Treino. O acesso e por ITEM, nao pela tela inteira:
 * - gratuitos (sempre disponiveis): Vitalidade, historico de atividades, botao "+" (Treinar: treino livre, GPS e demais
 *   modalidades);
 * - Pro: so a geracao de plano de treino por IA (workout_plans.py: POST /workout-plans/generate usa require_pro_subscription).
 *   Sem Pro, essa secao aparece como um cartao com o convite ao Pro (ProGate), sem esconder o resto da aba.
 */
export default function WorkoutScreen() {
  const { user, isPro } = useAuth();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setPlans(await listWorkoutPlans());
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar seu treino.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Recarrega toda vez que a aba ganha foco (ex: ao voltar de "Gerar treino")
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  if (loading) {
    return (
      <ScreenBackground3 style={styles.centeredFlex}>
        <ActivityIndicator size="large" color={colors3.primary} />
      </ScreenBackground3>
    );
  }

  // O plano mais recente gerado por IA (sem trainer_id) e tratado como o "ativo" atual.
  const aiPlan = plans.find((plan) => !plan.trainer_id) ?? null;

  return (
    <ScreenBackground3>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <View style={styles.headerWrap}>
          <Text style={styles.logo}>Tryv Fit</Text>
          <View style={styles.header}>
            <Text style={styles.title}>Treino</Text>
            <View style={styles.headerActions}>
              {/* Unico ponto de entrada dedicado pra lista de atividades
                  na aba Treino -- antes so era alcancavel via "Veja mais do
                  seu progresso" (ActivityProgressCard, Home), que continua
                  existindo tambem (nao concorrente, so mais um caminho). */}
              <Pressable onPress={() => router.push('/activity')} hitSlop={12} accessibilityLabel="Histórico de atividades">
                <Ionicons name="time-outline" size={22} color={colors3.onSurfaceVariant} />
              </Pressable>
              {/* Entrada pro Perfil (Perfil saiu da tab bar, ver (tabs)/_layout.tsx). */}
              <ProfileAvatarButton isPro={isPro ?? undefined} size={36} />
            </View>
          </View>
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}

        {/* Vitalidade (gratuita): logo abaixo do cabecalho, antes da secao de IA; o botao de iniciar e o FAB flutuante. */}
        <VitalityMonitor />

        {/* Pro: secao de IA completa. */}
        {isPro === true && <AiWorkoutSection plan={aiPlan} />}

        {/* Sem Pro: so a geracao de treino por IA fica bloqueada (cartao com convite ao Pro); o resto da aba continua livre. */}
        {isPro === false && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Treino gerado por IA</Text>
            <ProGate variant="card" borderRadius={radius3.xl}>
              <GlassCard variant="glass" style={styles.lockedPreview}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="barbell" size={24} color={colors3.primary} />
                </View>
                <Text style={styles.lockedPreviewText}>Gere um plano semanal personalizado com IA</Text>
              </GlassCard>
            </ProGate>
          </View>
        )}
      </ScrollView>
      <StartActivityFab />
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centeredFlex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing3.containerMargin, paddingTop: spacing3.xl, paddingBottom: spacing3.xl, gap: spacing3.lg },
  headerWrap: { gap: spacing3.xs },
  logo: { ...typography3.displayLg, fontSize: 36, fontWeight: '800', color: colors3.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  title: { ...typography3.headlineLgMobile, fontSize: 26 },
  error: { color: colors3.error, textAlign: 'center' },

  section: { gap: spacing3.md },
  sectionTitle: { ...typography3.headlineMd, fontSize: 18 },
  lockedPreview: { alignItems: 'center', gap: spacing3.sm },
  lockedPreviewText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing3.xl,
    gap: spacing3.sm,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius3.lg,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing3.md,
  },
  emptyTitle: { ...typography3.headlineMd, textAlign: 'center' },

  fab: {
    position: 'absolute',
    right: spacing3.lg,
    bottom: spacing3.lg,
    width: 56,
    height: 56,
    borderRadius: radius3.pill,
    backgroundColor: colors3.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors3.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
});
