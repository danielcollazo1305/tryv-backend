import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Avatar } from '@/components/Avatar';
import { Button2 } from '@/components/Button2';
import { ChallengeCard2 } from '@/components/ChallengeCard2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { getApiErrorMessage } from '@/services/api';
import { Challenge, listTrainerChallenges } from '@/services/challenges';
import {
  PROFESSIONAL_TYPE_LABELS,
  TrainerPublic,
  formatPriceBRL,
  getTrainer,
  licenseLabel,
  specialtyLabel,
  subscribeToTrainer,
} from '@/services/trainers';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

export default function TrainerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [trainer, setTrainer] = useState<TrainerPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [challenges, setChallenges] = useState<Challenge[]>([]);

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
      setLoadError(getApiErrorMessage(err, 'Nao foi possivel carregar este profissional.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchTrainer();
    }, [fetchTrainer])
  );

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      listTrainerChallenges(id)
        .then(setChallenges)
        .catch(() => {});
    }, [id])
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
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors2.violet} />
          </View>
        )}

        {!!loadError && <Text style={styles.error}>{loadError}</Text>}

        {!loading && trainer && (
          <>
            <View style={styles.profileHeader}>
              <View>
                <Avatar initials={getInitials(trainer.user_name)} size={100} />
                {trainer.cref_verified && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark" size={14} color={colors2.background} />
                  </View>
                )}
              </View>
              <Text style={styles.name}>{trainer.user_name}</Text>
              <View style={styles.credentialRow}>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors2.outline} />
                <Text style={styles.cref}>
                  {licenseLabel(trainer.professional_type)} {trainer.license_number}
                </Text>
              </View>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{PROFESSIONAL_TYPE_LABELS[trainer.professional_type]}</Text>
              </View>

              {trainer.years_experience != null && (
                <View style={styles.experienceRow}>
                  <Ionicons name="ribbon-outline" size={14} color={colors2.onSurfaceVariant} />
                  <Text style={styles.experienceText}>
                    {trainer.years_experience} {trainer.years_experience === 1 ? 'ano' : 'anos'} de experiencia
                  </Text>
                </View>
              )}

              <View style={styles.priceInline}>
                <Text style={styles.priceInlineValue}>{formatPriceBRL(trainer.price)}</Text>
                <Text style={styles.priceInlineUnit}> /mes</Text>
              </View>
            </View>

            {!!trainer.bio && (
              <LiquiglassCard style={styles.section}>
                <Text style={styles.sectionTitle}>Sobre mim</Text>
                <Text style={styles.bio}>{trainer.bio}</Text>
              </LiquiglassCard>
            )}

            {trainer.specialties.length > 0 && (
              <LiquiglassCard style={styles.section}>
                <Text style={styles.sectionTitle}>Especialidades</Text>
                <View style={styles.specialtiesRow}>
                  {trainer.specialties.map((specialty) => (
                    <View key={specialty} style={styles.specialtyPill}>
                      <Text style={styles.specialtyPillText}>{specialtyLabel(specialty)}</Text>
                    </View>
                  ))}
                </View>
              </LiquiglassCard>
            )}

            {!!trainer.certifications && (
              <LiquiglassCard style={styles.section}>
                <Text style={styles.sectionTitle}>Formacao e certificacoes</Text>
                <Text style={styles.bio}>{trainer.certifications}</Text>
              </LiquiglassCard>
            )}

            {trainer.professional_type === 'personal_trainer' && (
              <LiquiglassCard style={styles.differentialSection}>
                <View style={styles.differentialIcon}>
                  <Ionicons name="videocam" size={20} color={colors2.onPrimaryContainer} />
                </View>
                <View style={styles.differentialText}>
                  <Text style={styles.differentialTitle}>Acompanhamento de treino ao vivo</Text>
                  <Text style={styles.differentialSubtitle}>
                    Sessoes online para correcao de postura e motivacao em tempo real.
                  </Text>
                </View>
              </LiquiglassCard>
            )}

            {/*
              Nota de lacuna de dado (atualizada — registro profissional
              expandido): o mockup marketplace-perfil.html mostra um grid
              de estatisticas (Alunos Ativos, Avaliacao, Planilhas, Anos de
              Experiencia). "Anos de Experiencia" agora e dado real
              (trainer.years_experience, mostrado acima do preco) — os
              outros 3 (Alunos Ativos, Avaliacao, Planilhas) continuam sem
              nenhum campo/endpoint que os popule com dado real, entao
              continuam omitidos em vez de inventados.
            */}

            {!!subscribeError && <Text style={styles.error}>{subscribeError}</Text>}

            {!!info && (
              <LiquiglassCard style={styles.infoCard}>
                <Ionicons name="checkmark-circle" size={18} color={colors2.success} />
                <Text style={styles.infoText}>{info}</Text>
              </LiquiglassCard>
            )}

            {challenges.length > 0 && (
              <View style={styles.challengesSection}>
                <Text style={styles.sectionTitle}>Desafios</Text>
                {challenges.map((challenge) => (
                  <ChallengeCard2 key={challenge.id} challenge={challenge} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {!loading && trainer && (
        <View style={styles.footer}>
          <Button2
            label={`Assinar por ${formatPriceBRL(trainer.price)}/mes`}
            onPress={handleSubscribe}
            loading={subscribing}
          />
        </View>
      )}
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
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  content: { padding: spacing2.containerMargin, paddingTop: 0, paddingBottom: 140, gap: spacing2.md },
  centered: { alignItems: 'center', marginTop: spacing2.xl },
  error: { color: colors2.danger, textAlign: 'center' },

  profileHeader: { alignItems: 'center', gap: spacing2.xs, marginBottom: spacing2.sm },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: radius2.pill,
    backgroundColor: colors2.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors2.background,
  },
  name: { ...typography2.headlineLgMobile, fontSize: 24, marginTop: spacing2.sm },
  credentialRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  cref: { ...typography2.labelCaps, textTransform: 'none', color: colors2.outline },
  typeBadge: {
    marginTop: spacing2.xs,
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.xs,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainer,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  typeBadgeText: { ...typography2.labelCaps, color: colors2.primary },
  experienceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs, marginTop: spacing2.xs },
  experienceText: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
  priceInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing2.sm,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderRadius: radius2.md,
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.sm,
  },
  priceInlineValue: { ...typography2.metricMono, fontSize: 20 },
  priceInlineUnit: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },

  section: { gap: spacing2.sm },
  sectionTitle: { ...typography2.headlineMd, fontSize: 18 },
  bio: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, lineHeight: 24 },
  specialtiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing2.sm },
  specialtyPill: {
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.xs,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  specialtyPillText: { ...typography2.labelCaps, textTransform: 'none', color: colors2.primary },

  differentialSection: { flexDirection: 'row', alignItems: 'center', gap: spacing2.md },
  differentialIcon: {
    width: 44,
    height: 44,
    borderRadius: radius2.pill,
    backgroundColor: colors2.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  differentialText: { flex: 1, gap: spacing2.xs },
  differentialTitle: { ...typography2.bodyMd, fontWeight: '600' },
  differentialSubtitle: { ...typography2.labelCaps, textTransform: 'none' },

  infoCard: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  infoText: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant, flex: 1 },

  challengesSection: { gap: spacing2.sm, marginTop: spacing2.sm },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing2.containerMargin,
    backgroundColor: 'rgba(19, 19, 19, 0.9)',
    borderTopWidth: 1,
    borderTopColor: colors2.outlineVariant,
  },
});
