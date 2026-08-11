import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '@/components/Card';
import { getApiErrorMessage } from '@/services/api';
import { Student, Trainer, getMyTrainerProfile, listMyStudents } from '@/services/trainers';
import { colors, radius, spacing, typography } from '@/constants/theme';

// Enquanto a tela esta aberta, atualiza quem esta "ao vivo" agora — o
// professor pode estar olhando a lista bem quando um aluno comeca a treinar.
// So faz sentido pra personal trainer (ver isNutritionist abaixo).
const REFRESH_INTERVAL_MS = 10000;

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
    if (!student.is_live || !student.live_activity_id) return;
    router.push({
      pathname: '/trainers/live/[id]',
      params: { id: student.live_activity_id, name: student.name },
    });
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>{isNutritionist ? 'Meus pacientes' : 'Meus alunos'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {!loading && students.length === 0 && !error && (
          <View style={styles.centered}>
            <Ionicons name="people-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {isNutritionist ? 'Voce ainda nao tem pacientes assinantes.' : 'Voce ainda nao tem alunos assinantes.'}
            </Text>
          </View>
        )}

        {!loading &&
          students.map((student) => (
            <Pressable
              key={student.user_id}
              onPress={() => handleSelectStudent(student)}
              disabled={!isNutritionist && !student.is_live}
            >
              <Card style={styles.studentCard}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={20} color={colors.accent} />
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  {isNutritionist ? (
                    <Text style={styles.offlineText}>Ver ou editar plano alimentar</Text>
                  ) : student.is_live ? (
                    <View style={styles.liveRow}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>Treinando agora</Text>
                    </View>
                  ) : (
                    <Text style={styles.offlineText}>Sem atividade no momento</Text>
                  )}
                </View>
                {(isNutritionist || student.is_live) && (
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                )}
              </Card>
            </Pressable>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h2 },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm },
  error: { color: colors.danger, textAlign: 'center' },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { ...typography.bodySecondary, textAlign: 'center' },

  studentCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentInfo: { flex: 1, gap: spacing.xs },
  studentName: { ...typography.body, fontWeight: '600' },
  offlineText: { ...typography.caption },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.success },
  liveText: { ...typography.caption, color: colors.success, fontWeight: '700' },
});
