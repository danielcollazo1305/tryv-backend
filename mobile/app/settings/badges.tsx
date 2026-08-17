import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { useAuth } from '@/context/AuthContext';
import { UserBadges, getUserBadges } from '@/services/user';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

const PROFESSIONAL_TYPE_LABEL: Record<string, string> = {
  personal_trainer: 'Personal Trainer',
  nutritionist: 'Nutricionista',
};

/**
 * Tela dedicada pro mockup config-badges-perfil.html ("Meus Selos e
 * Conquistas") — mesmos dados de ProfileBadges2 (getUserBadges), so que em
 * cards grandes e detalhados em vez de pills compactas. Nao reaproveitei
 * ProfileBadges2 diretamente porque o formato visual e fundamentalmente
 * diferente (card com icone+status+descricao vs. pill inline) — criar um
 * componente novo so pra isso seria over-engineering pra uma tela unica.
 *
 * O titulo do mockup fala em "Selos e Conquistas", mas o conteudo real dele
 * so mostra Pro/Team (nao ha nenhuma lista separada de "conquistas" tipo
 * medalhas por PR/streak no mockup nem no backend) — entao nao ha lacuna
 * aqui, o que existe pra mostrar e exatamente is_pro + teams.
 */
export default function BadgesScreen() {
  const { user } = useAuth();
  const [badges, setBadges] = useState<UserBadges | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      setLoading(true);
      getUserBadges(user.id)
        .then((data) => {
          if (active) setBadges(data);
        })
        .catch(() => {
          if (active) setBadges(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [user])
  );

  const isPro = badges?.is_pro ?? false;
  const teams = badges?.teams ?? [];

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.title}>Meus Selos e Conquistas</Text>
          <Text style={styles.subtitle}>Gerencie seu nivel de acesso e vinculos.</Text>
        </View>

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors2.violet} />
          </View>
        )}

        {!loading && (
          <>
            {isPro && (
              <LiquiglassCard style={styles.badgeCard}>
                <View style={styles.badgeIconWrap}>
                  <Ionicons name="diamond" size={28} color={colors2.primary} />
                </View>
                <View style={styles.badgeTexts}>
                  <View style={styles.badgeHeaderRow}>
                    <Text style={styles.badgeTitle}>PRO</Text>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>ATIVO</Text>
                    </View>
                  </View>
                  <Text style={styles.badgeDescription}>
                    Acesso total a IA de treino e nutricao, metricas avancadas e exportacao de relatorios.
                  </Text>
                </View>
              </LiquiglassCard>
            )}

            {teams.map((team) => (
              <LiquiglassCard key={`${team.trainer_name}-${team.professional_type}`} style={styles.badgeCard}>
                <View style={[styles.badgeIconWrap, styles.badgeIconWrapSecondary]}>
                  <Ionicons name="people" size={28} color={colors2.secondary} />
                </View>
                <View style={styles.badgeTexts}>
                  <View style={styles.badgeHeaderRow}>
                    <Text style={styles.badgeTitle}>Team {team.trainer_name}</Text>
                    <View style={[styles.statusPill, styles.statusPillSecondary]}>
                      <Text style={[styles.statusPillText, styles.statusPillTextSecondary]}>VINCULADO</Text>
                    </View>
                  </View>
                  <Text style={styles.badgeDescription}>
                    Assinatura ativa com {PROFESSIONAL_TYPE_LABEL[team.professional_type] ?? team.professional_type}.
                  </Text>
                </View>
              </LiquiglassCard>
            ))}

            {!isPro && (
              <LiquiglassCard style={styles.ctaCard}>
                <View style={styles.ctaHeaderRow}>
                  <Ionicons name="star" size={18} color={colors2.primary} />
                  <Text style={styles.ctaTitle}>Desbloqueie seu Potencial</Text>
                </View>
                <Text style={styles.ctaSubtitle}>
                  Eleve seus resultados com o Tryv Pro. Analise detalhada, IA personalizada e muito mais.
                </Text>
                <Button2 label="Assinar agora" onPress={() => router.push('/subscriptions/pro')} />
              </LiquiglassCard>
            )}
          </>
        )}
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
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.md },
  centered: { alignItems: 'center', paddingVertical: spacing2.xl },

  intro: { gap: spacing2.xs, marginBottom: spacing2.xs },
  title: { ...typography2.headlineLgMobile, fontSize: 24 },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },

  badgeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing2.md },
  badgeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIconWrapSecondary: { borderColor: 'rgba(221, 183, 255, 0.3)' },
  badgeTexts: { flex: 1, gap: spacing2.xs },
  badgeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm, flexWrap: 'wrap' },
  badgeTitle: { ...typography2.headlineMd, fontSize: 18 },
  badgeDescription: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },
  statusPill: {
    paddingHorizontal: spacing2.sm,
    paddingVertical: 2,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.2)',
  },
  statusPillText: { ...typography2.labelCaps, fontSize: 10, color: colors2.primary },
  statusPillSecondary: { backgroundColor: 'rgba(221, 183, 255, 0.1)', borderColor: 'rgba(221, 183, 255, 0.2)' },
  statusPillTextSecondary: { color: colors2.secondary },

  ctaCard: { gap: spacing2.sm },
  ctaHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  ctaTitle: { ...typography2.headlineMd, fontSize: 18 },
  ctaSubtitle: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },
});
