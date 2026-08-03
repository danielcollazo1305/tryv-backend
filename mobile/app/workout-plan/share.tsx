import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { Button } from '@/components/Button';
import { WorkoutShareCard } from '@/components/WorkoutShareCard';
import { useAuth } from '@/context/AuthContext';
import { WorkoutDay } from '@/services/workouts';
import { colors, radius, spacing, typography } from '@/constants/theme';

export default function WorkoutShareScreen() {
  const { user } = useAuth();
  const { day: dayParam } = useLocalSearchParams<{ day: string }>();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parametro vem serializado via JSON.stringify na navegacao (expo-router so
  // aceita params como string) — reconstroi o objeto do dia aqui.
  let day: WorkoutDay | null = null;
  try {
    day = dayParam ? JSON.parse(dayParam) : null;
  } catch {
    day = null;
  }

  const handleShare = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    setError(null);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setError('Compartilhamento nao esta disponivel neste dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartilhar treino' });
    } catch {
      setError('Nao foi possivel gerar a imagem para compartilhar, tente novamente.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Compartilhar treino</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {day ? (
          <>
            <View style={styles.cardWrap} ref={cardRef} collapsable={false}>
              <WorkoutShareCard userName={user?.name ?? 'Eu'} day={day} />
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Button label="Compartilhar" onPress={handleShare} loading={sharing} />
          </>
        ) : (
          <Text style={styles.error}>Nao foi possivel carregar esse treino.</Text>
        )}
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
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  error: { color: colors.danger, textAlign: 'center' },
  cardWrap: {
    width: '100%',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
});
