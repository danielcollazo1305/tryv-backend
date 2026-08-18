import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { getApiErrorMessage } from '@/services/api';
import { Student, Trainer, getMyTrainerProfile, listMyStudents } from '@/services/trainers';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

// Enquanto a tela esta aberta, atualiza quem esta "ao vivo" agora — o
// professor pode estar olhando a lista bem quando um aluno comeca a treinar.
// So faz sentido pra personal trainer (ver isNutritionist abaixo).
const REFRESH_INTERVAL_MS = 10000;

function LiveDot() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.liveDotWrap}>
      <Animated.View
        style={[
          styles.liveDotRing,
          { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }] },
        ]}
      />
      <View style={styles.liveDot} />
    </View>
  );
}

export default function TrainerStudentsScreen() {
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live Activity e um contexto especifico de personal trainer — pra
  // nutricionista, o card do aluno abre o plano alimentar em vez disso.
  const isNutritionist = trainer?.professional_type === 'nutritionist';

  const fetchStudents = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [trainerData, studentsData] = await Promise.all([getMyTrainerProfile(), listMyStudents()]);
      setTrainer(trainerData);
      setStudents(studentsData);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar seus alunos.'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStudents(true);
    }, [fetchStudents])
  );

  // Live Activity muda a cada poucos segundos; plano alimentar nao precisa
  // de polling — evita chamada desnecessaria enquanto a tela do nutricionista
  // esta aberta.
  useEffect(() => {
    if (isNutritionist) return;
    const interval = setInterval(() => fetchStudents(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStudents, isNutritionist]);

  const handleSelectStudent = (student: Student) => {
    if (isNutritionist) {
      router.push({
        pathname: '/diet-plan/[studentId]',
        params: { studentId: student.user_id, studentName: student.name },
      });
      return;
    }
    // Acao principal do card, pra personal trainer, deixou de ser so "ver
    // ao vivo se estiver treinando agora" (a lacuna que esta tarefa
    // fecha) — agora sempre leva pro builder de plano manual. Status "ao
    // vivo" continua acessivel, mas como um botao separado dentro do card
    // (ver handleViewLive), nao mais a unica acao possivel.
    router.push({
      pathname: '/trainers/students/[studentId]/workout-plan',
      params: { studentId: student.user_id, studentName: student.name },
    });
  };

  const handleViewLive = (student: Student) => {
    if (!student.live_activity_id) return;
    router.push({
      pathname: '/trainers/live/[id]',
      params: { id: student.live_activity_id, name: student.name },
    });
  };

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>{isNutritionist ? 'Meus pacientes' : 'Meus alunos'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors2.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors2.violet} />
          </View>
        )}

        {!loading && students.length === 0 && !error && (
          <View style={styles.centered}>
            <Ionicons name="people-outline" size={32} color={colors2.onSurfaceVariant} />
            <Text style={styles.emptyText}>
              {isNutritionist ? 'Voce ainda nao tem pacientes assinantes.' : 'Voce ainda nao tem alunos assinantes.'}
            </Text>
          </View>
        )}

        {!loading &&
          students.map((student) => (
            <Pressable key={student.user_id} onPress={() => handleSelectStudent(student)}>
              <LiquiglassCard style={styles.studentCard} padding={spacing2.md}>
                <Avatar initials={getInitials(student.name)} size={48} />
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  {/*
                    Lacuna de dado: o mockup marketplace-meus-alunos.html
                    mostra "Desde <data>" (inicio da assinatura). O tipo
                    Student (services/trainers.ts) nao tem esse campo hoje
                    (so user_id/name/is_live/live_activity_id) — omitido
                    aqui em vez de inventar uma data.
                  */}
                  <Text style={styles.offlineText}>
                    {isNutritionist ? 'Ver ou editar plano alimentar' : 'Toque para montar o plano de treino'}
                  </Text>
                </View>
                {isNutritionist ? (
                  <View style={styles.dietPlanButton}>
                    <Text style={styles.dietPlanButtonText}>Ver plano</Text>
                  </View>
                ) : (
                  <View style={styles.trainerActions}>
                    {/*
                      "Ao vivo" continua acessivel, mas agora como um botao
                      proprio dentro do card, nao mais a unica acao
                      possivel — o card inteiro leva pro builder de plano
                      (handleSelectStudent), montar plano nao depende do
                      aluno estar treinando agora.
                    */}
                    {student.is_live && student.live_activity_id && (
                      <Pressable
                        style={styles.liveButton}
                        onPress={() => handleViewLive(student)}
                        hitSlop={8}
                      >
                        <LiveDot />
                        <Text style={styles.liveButtonText}>Ao vivo</Text>
                      </Pressable>
                    )}
                    <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
                  </View>
                )}
              </LiquiglassCard>
            </Pressable>
          ))}
      </ScrollView>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  title: { ...typography2.headlineMd, fontSize: 20 },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.sm },
  error: { color: colors2.danger, textAlign: 'center' },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing2.xl, gap: spacing2.sm },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },

  studentCard: { flexDirection: 'row', alignItems: 'center', gap: spacing2.md },
  studentInfo: { flex: 1, gap: spacing2.xs },
  studentName: { ...typography2.bodyMd, fontWeight: '600' },
  offlineText: { ...typography2.labelCaps, textTransform: 'none' },
  liveDotWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  liveDotRing: { position: 'absolute', width: 10, height: 10, borderRadius: radius2.pill, backgroundColor: colors2.success },
  liveDot: { width: 8, height: 8, borderRadius: radius2.pill, backgroundColor: colors2.success },

  trainerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  liveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.xs,
    paddingHorizontal: spacing2.sm,
    paddingVertical: spacing2.xs,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderWidth: 1,
    borderColor: colors2.success,
  },
  liveButtonText: { ...typography2.labelCaps, color: colors2.success, textTransform: 'none' },

  dietPlanButton: {
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.xs,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderWidth: 1,
    borderColor: colors2.violet,
  },
  dietPlanButtonText: { ...typography2.labelCaps, textTransform: 'none', color: colors2.primary },
});
