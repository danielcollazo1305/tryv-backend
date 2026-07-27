import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { getApiErrorMessage } from '@/services/api';
import { Trainer, formatPriceBRL, getTrainer, subscribeToTrainer } from '@/services/trainers';
import { colors, radius, spacing, typography } from '@/constants/theme';

export default function TrainerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const fetchTrainer = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      setTrainer(await getTrainer(id));
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Nao foi possivel carregar este professor.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchTrainer();
    }, [fetchTrainer])
  );

  const handleSubscribe = async () => {
    if (!id) return;
    setSubscribing(true);
    setSubscribeError(null);
    setInfo(null);
    try {
      const { checkout_url } = await subscribeToTrainer(id);
      await WebBrowser.openBrowserAsync(checkout_url);
      // Nao ha endpoint de "minhas assinaturas" ainda para confirmar de fato —
      // so informamos que o pagamento deve ter sido processado.
      setInfo('Se voce concluiu o pagamento, sua assinatura ja deve estar ativa.');
    } catch (err) {
      setSubscribeError(getApiErrorMessage(err, 'Nao foi possivel iniciar a assinatura, tente novamente.'));
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Professor</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {!!loadError && <Text style={styles.error}>{loadError}</Text>}

        {!loading && trainer && (
          <>
            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={32} color={colors.accent} />
              </View>
              <Text style={styles.name}>{trainer.user_name}</Text>
              <Text style={styles.cref}>CREF {trainer.cref_number}</Text>
            </View>

            <Card style={styles.priceCard}>
              <Text style={styles.priceLabel}>Mensalidade</Text>
              <Text style={styles.price}>{formatPriceBRL(trainer.price)}</Text>
            </Card>

            {!!trainer.bio && <Text style={styles.bio}>{trainer.bio}</Text>}

            {!!subscribeError && <Text style={styles.error}>{subscribeError}</Text>}

            {!!info && (
              <Card style={styles.infoCard}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.infoText}>{info}</Text>
              </Card>
            )}

            <Button label="Assinar" onPress={handleSubscribe} loading={subscribing} />
          </>
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
  centered: { alignItems: 'center', marginTop: spacing.xl },
  error: { color: colors.danger, textAlign: 'center' },

  profileHeader: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  name: { ...typography.h2 },
  cref: { ...typography.caption },

  priceCard: { alignItems: 'center', gap: spacing.xs },
  priceLabel: { ...typography.caption },
  price: { ...typography.statNumber, fontSize: 28 },

  bio: { ...typography.body, color: colors.textSecondary },

  infoCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoText: { ...typography.bodySecondary, flex: 1 },
});
