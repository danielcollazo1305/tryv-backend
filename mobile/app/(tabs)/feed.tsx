import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { ChallengesView } from '@/components/social/ChallengesView';
import { ClubsView } from '@/components/social/ClubsView';
import { FeedView } from '@/components/social/FeedView';
import { RankingView } from '@/components/social/RankingView';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

type SocialTab = 'feed' | 'ranking' | 'clubs' | 'challenges';

const TABS: { key: SocialTab; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'ranking', label: 'Ranking' },
  { key: 'clubs', label: 'Clubes' },
  { key: 'challenges', label: 'Desafios' },
];

function parseTab(value: string | string[] | undefined): SocialTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'ranking' || raw === 'clubs' || raw === 'challenges' ? raw : 'feed';
}

/**
 * Social (rota `feed`, nome mantido para nao quebrar referencias). Cabecalho unico (logo, titulo, busca de pessoas e
 * avatar) + pilulas das abas com rolagem horizontal + a view da aba ativa. Abas: Feed, Ranking, Clubes e Desafios
 * (Seguindo/Explorar entram depois).
 *
 * Montagem sob demanda: uma aba so e montada na 1a vez que e selecionada (o Ranking nao busca nada enquanto o
 * usuario so olha o Feed); depois de visitada continua montada e a inativa fica com `display: 'none'`, o que preserva
 * rolagem, alternador individual/squad, modais e dados ao voltar. Sem biblioteca de pager: a troca e por toque.
 * Param de rota opcional `tab` (`feed` | `ranking` | `clubs` | `challenges`) abre direto numa aba.
 */
export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<SocialTab>(parseTab(tabParam));
  const [visited, setVisited] = useState<Record<SocialTab, boolean>>(() => {
    const initial = parseTab(tabParam);
    return { feed: true, ranking: initial === 'ranking', clubs: initial === 'clubs', challenges: initial === 'challenges' };
  });
  // Incrementado pela aba Clubes quando o squad muda; a aba Ranking se atualiza (ver RankingView.refreshKey).
  const [squadVersion, setSquadVersion] = useState(0);

  const selectTab = (tab: SocialTab) => {
    setActiveTab(tab);
    setVisited((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  };

  // Param `tab` mudou com a tela ja montada (ex.: router.navigate com outro tab): acompanha.
  useEffect(() => {
    if (tabParam !== undefined) selectTab(parseTab(tabParam));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={[styles.header, { paddingTop: insets.top + spacing3.md }]}>
        <Text style={styles.logo}>Tryv Fit</Text>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Social</Text>
          <View style={styles.headerActions}>
            {/* Entrada pro Descobrir: icone de busca no topo (padrao de apps sociais para encontrar pessoas). */}
            <Pressable onPress={() => router.push('/social/discover')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Descobrir pessoas">
              <Ionicons name="search" size={22} color={colors3.onSurfaceVariant} />
            </Pressable>
            <ProfileAvatarButton size={32} />
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScroll}
          contentContainerStyle={styles.pillsContent}
          accessibilityRole="tablist"
        >
          {TABS.map(({ key, label }) => {
            const selected = key === activeTab;
            return (
              <Pressable
                key={key}
                onPress={() => selectTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.pill, selected && styles.pillSelected]}
              >
                <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.flex}>
        {visited.feed && (
          <View style={[styles.flex, activeTab !== 'feed' && styles.hidden]}>
            <FeedView active={activeTab === 'feed'} />
          </View>
        )}
        {visited.ranking && (
          <View style={[styles.flex, activeTab !== 'ranking' && styles.hidden]}>
            <RankingView active={activeTab === 'ranking'} refreshKey={squadVersion} />
          </View>
        )}
        {visited.clubs && (
          <View style={[styles.flex, activeTab !== 'clubs' && styles.hidden]}>
            <ClubsView active={activeTab === 'clubs'} onSquadChanged={() => setSquadVersion((v) => v + 1)} />
          </View>
        )}
        {visited.challenges && (
          <View style={[styles.flex, activeTab !== 'challenges' && styles.hidden]}>
            <ChallengesView active={activeTab === 'challenges'} />
          </View>
        )}
      </View>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hidden: { display: 'none' },
  header: { gap: spacing3.xs, paddingHorizontal: spacing3.containerMargin, marginBottom: spacing3.xs },
  logo: { ...typography3.displayLg, fontSize: 36, fontWeight: '800', color: colors3.primary },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  title: { ...typography3.headlineLgMobile, fontSize: 26 },
  // Rolagem horizontal das pilulas: margem negativa + padding para ir de borda a borda sem cortar a 1a pilula.
  pillsScroll: { marginHorizontal: -spacing3.containerMargin, flexGrow: 0, marginTop: spacing3.sm },
  pillsContent: { paddingHorizontal: spacing3.containerMargin, gap: spacing3.sm },
  pill: {
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
  },
  pillSelected: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  pillText: { ...typography3.labelSm, fontSize: 13, textTransform: 'none' },
  pillTextSelected: { color: colors3.white, fontFamily: 'Inter_700Bold' },
});
