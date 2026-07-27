import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/TextField';
import { getApiErrorMessage } from '@/services/api';
import {
  StripeStatus,
  Trainer,
  createStripeOnboardingLink,
  formatPriceBRL,
  getMyTrainerProfile,
  getStripeStatus,
  updateMyTrainerProfile,
} from '@/services/trainers';
import { colors, spacing, typography } from '@/constants/theme';

export default function TrainerDashboardScreen() {
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const [connectingStripe, setConnectingStripe] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [trainerData, stripeData] = await Promise.all([getMyTrainerProfile(), getStripeStatus()]);
      setTrainer(trainerData);
      setStripeStatus(stripeData);
      setBio(trainerData.bio ?? '');
      setPrice(String(trainerData.price));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar seu painel.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMyTrainerProfile({
        bio: bio.trim(),
        price: Number(price) || undefined,
      });
      setTrainer(updated);
      setEditing(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar as alteracoes.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setBio(trainer?.bio ?? '');
    setPrice(trainer ? String(trainer.price) : '');
    setEditing(false);
  };

  const handleConnectStripe = async () => {
    setConnectingStripe(true);
    setError(null);
    try {
      const { onboarding_url } = await createStripeOnboardingLink();
      await WebBrowser.openBrowserAsync(onboarding_url);
      await fetchAll();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel iniciar a configuracao de pagamentos.'));
    } finally {
      setConnectingStripe(false);
    }
  };

  const stripeReady = !!stripeStatus?.charges_enabled && !!stripeStatus?.payouts_enabled;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Meu painel de professor</Text>
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

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!loading && trainer && (
          <>
            <Card style={styles.statusCard}>
              <View style={styles.statusRow}>
                <Ionicons
                  name={trainer.cref_verified ? 'checkmark-circle' : 'time-outline'}
                  size={20}
                  color={trainer.cref_verified ? colors.success : colors.textSecondary}
                />
                <View style={styles.statusInfo}>
                  <Text style={styles.statusTitle}>
                    {trainer.cref_verified ? 'CREF verificado' : 'Seu CREF esta em analise'}
                  </Text>
                  <Text style={styles.statusSubtitle}>
                    {trainer.cref_verified
                      ? `CREF ${trainer.cref_number}`
                      : 'Seu perfil so aparece na busca de professores apos a verificacao.'}
                  </Text>
                </View>
              </View>
            </Card>

            <Card style={styles.statusCard}>
              <View style={styles.statusRow}>
                <Ionicons
                  name={stripeReady ? 'checkmark-circle' : 'card-outline'}
                  size={20}
                  color={stripeReady ? colors.success : colors.textSecondary}
                />
                <View style={styles.statusInfo}>
                  <Text style={styles.statusTitle}>
                    {stripeReady ? 'Pagamentos configurados' : 'Recebimento de pagamentos pendente'}
                  </Text>
                  <Text style={styles.statusSubtitle}>
                    {stripeReady
                      ? 'Voce ja pode receber assinaturas de alunos.'
                      : 'Configure sua conta Stripe para poder receber pagamentos.'}
                  </Text>
                </View>
              </View>
              {!stripeReady && (
                <Button
                  label="Configurar recebimento de pagamentos"
                  variant="secondary"
                  onPress={handleConnectStripe}
                  loading={connectingStripe}
                />
              )}
            </Card>

            <Card style={styles.editCard}>
              <View style={styles.editHeader}>
                <Text style={styles.editTitle}>Perfil</Text>
                {!editing && (
                  <Pressable onPress={() => setEditing(true)} hitSlop={8}>
                    <Ionicons name="pencil" size={18} color={colors.accent} />
                  </Pressable>
                )}
              </View>

              {editing ? (
                <>
                  <TextField
                    label="Bio"
                    value={bio}
                    onChangeText={setBio}
                    multiline
                    numberOfLines={5}
                    style={styles.bioInput}
                  />
                  <TextField
                    label="Preco mensal (R$)"
                    keyboardType="decimal-pad"
                    value={price}
                    onChangeText={setPrice}
                  />
                  <Button label="Salvar" onPress={handleSave} loading={saving} />
                  <Button label="Cancelar" variant="secondary" onPress={handleCancelEdit} disabled={saving} />
                </>
              ) : (
                <>
                  <Text style={styles.price}>{formatPriceBRL(trainer.price)}/mes</Text>
                  <Text style={styles.bio}>{trainer.bio || 'Nenhuma bio cadastrada ainda.'}</Text>
                </>
              )}
            </Card>
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

  statusCard: { gap: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusInfo: { flex: 1, gap: spacing.xs },
  statusTitle: { ...typography.body, fontWeight: '600' },
  statusSubtitle: { ...typography.bodySecondary },

  editCard: { gap: spacing.sm },
  editHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editTitle: { ...typography.h3 },
  bioInput: { minHeight: 110, textAlignVertical: 'top' },
  price: { ...typography.h3, color: colors.accent },
  bio: { ...typography.bodySecondary },
});
