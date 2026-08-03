import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '@/components/Card';
import { getApiErrorMessage } from '@/services/api';
import { Student, listMyStudents } from '@/services/trainers';
import { colors, radius, spacing, typography } from '@/constants/theme';

// Enquanto a tela esta aberta, atualiza quem esta "ao vivo" agora — o
// professor pode estar olhando a lista bem quando um aluno comeca a treinar.
const REFRESH_INTERVAL_MS = 10000;

export default function TrainerStudentsScreen() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStudents = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      setStudents(await listMyStudents());
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

  useEffect(() => {
    const interval = setInterval(() => fetchStudents(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStudents]);

  const handleSelectStudent = (student: Student) => {
    if (!student.is_live || !student.live_activity_id) return;
    router.push({
      pathname: '/trainers/live/[id]',
      params: { id: student.live_activity_id, name: student.name },
    });
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Meus alunos</Text>
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
            <Text style={styles.emptyText}>Voce ainda nao tem alunos assinantes.</Text>
          </View>
        )}

        {!loading &&
          students.map((student) => (
            <Pressable
              key={student.user_id}
              onPress={() => handleSelectStudent(student)}
              disabled={!student.is_live}
            >
              <Card style={styles.studentCard}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={20} color={colors.accent} />
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  {student.is_live ? (
                    <View style={styles.liveRow}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>Treinando agora</Text>
                    </View>
                  ) : (
                    <Text style={styles.offlineText}>Sem atividade no momento</Text>
                  )}
                </View>
                {student.is_live && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
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
