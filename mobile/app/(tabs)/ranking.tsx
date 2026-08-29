import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/Avatar';
import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { useAuth } from '@/context/AuthContext';
import { getInitials } from '@/utils/text';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_HEIGHT } from './_layout';

type RankingViewMode = 'individual' | 'squad';

interface MockIndividualRanking {
  position: number;
  name: string;
  squadName: string | null;
  weeklyXp: number;
}

interface MockSquadRanking {
  position: number;
  name: string;
  memberCount: number;
  territoryPercent: number;
  weeklyXp: number;
}

/**
 * Tela nova "Ranking" — substitui Desafios na tab bar (Desafios continua
 * existindo como rota, ver (tabs)/_layout.tsx, so nao aparece mais na
 * barra). O backend de squad/pontos/territorio AINDA NAO EXISTE — toda a
 * estrutura visual abaixo (nivel/XP do usuario, stats de squad, listas de
 * ranking) usa dados de exemplo fixos, claramente marcados como MOCK.
 * Quando o backend existir, trocar os mocks por chamadas reais mantendo a
 * mesma estrutura visual.
 *
 * MOCK_HAS_SQUAD fica travado em `false`: nenhum usuario real tem squad
 * hoje (o sistema nao existe), entao a tela sempre abre no estado "Solo"
 * pra quem realmente usa o app. O estado "com squad" abaixo (mockUserSquad/
 * mockUserProgress/mockSquadStats) so serve pra visualizar o layout
 * durante o desenvolvimento — nunca deve vir de dado real ainda.
 */
const MOCK_HAS_SQUAD = false;

// MOCK — trocar por dado real quando o backend de squad/pontos existir.
const mockUserProgress = {
  level: 4,
  xpCurrent: 320,
  xpNextLevel: 500,
};

// MOCK — trocar por dado real quando o backend de squad/pontos existir.
const mockUserSquad = {
  name: 'Squad Fênix',
  memberCount: 6,
  maxMembers: 9,
};

// MOCK — trocar por dado real quando o backend de squad/pontos existir.
const mockSquadStats = {
  cityPosition: 12,
  streakDays: 14,
  weeklyXp: 1240,
  territoryPercent: 8,
};

// MOCK — trocar por dado real quando o backend de squad/pontos existir.
const MOCK_INDIVIDUAL_RANKING: MockIndividualRanking[] = [
  { position: 1, name: 'Marina Alves', squadName: 'Squad Fênix', weeklyXp: 2840 },
  { position: 2, name: 'Rafael Nunes', squadName: 'Lobos do Ipiranga', weeklyXp: 2715 },
  { position: 3, name: 'Camila Torres', squadName: 'Trovão Vermelho', weeklyXp: 2603 },
  { position: 4, name: 'Bruno Castro', squadName: 'Squad Fênix', weeklyXp: 2410 },
  { position: 5, name: 'Juliana Prado', squadName: null, weeklyXp: 2298 },
  { position: 6, name: 'Diego Farias', squadName: 'Alcateia Sul', weeklyXp: 2150 },
  { position: 7, name: 'Larissa Gomes', squadName: 'Lobos do Ipiranga', weeklyXp: 1987 },
  { position: 8, name: 'Thiago Batista', squadName: null, weeklyXp: 1902 },
  { position: 9, name: 'Fernanda Melo', squadName: 'Trovão Vermelho', weeklyXp: 1845 },
  { position: 10, name: 'Pedro Lacerda', squadName: 'Alcateia Sul', weeklyXp: 1790 },
];

// MOCK — trocar por dado real quando o backend de squad/pontos existir.
const MOCK_SQUAD_RANKING: MockSquadRanking[] = [
  { position: 1, name: 'Squad Fênix', memberCount: 9, territoryPercent: 14, weeklyXp: 18420 },
  { position: 2, name: 'Trovão Vermelho', memberCount: 8, territoryPercent: 11, weeklyXp: 17205 },
  { position: 3, name: 'Lobos do Ipiranga', memberCount: 7, territoryPercent: 9, weeklyXp: 15980 },
  { position: 4, name: 'Alcateia Sul', memberCount: 6, territoryPercent: 7, weeklyXp: 13640 },
  { position: 5, name: 'Guardiões da Zona Leste', memberCount: 5, territoryPercent: 6, weeklyXp: 11290 },
  { position: 6, name: 'Falcões Noturnos', memberCount: 8, territoryPercent: 5, weeklyXp: 10475 },
  { position: 7, name: 'Correntes de Aço', memberCount: 4, territoryPercent: 3, weeklyXp: 8920 },
  { position: 8, name: 'Vento Norte', memberCount: 6, territoryPercent: 2, weeklyXp: 7615 },
];

function formatXp(value: number): string {
  return value.toLocaleString('pt-BR');
}

function handleComingSoon() {
  Alert.alert('Em breve', 'Squads ainda não existem no Tryv — essa funcionalidade está chegando em breve.');
}

export default function RankingScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<RankingViewMode>('individual');

  const hasSquad = MOCK_HAS_SQUAD;
  const xpProgress = Math.max(0, Math.min(1, mockUserProgress.xpCurrent / mockUserProgress.xpNextLevel));

  return (
    <ScreenBackground3 style={styles.flex}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + spacing3.lg },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv</Text>
          <View style={styles.headerTop}>
            <Text style={styles.title}>Ranking</Text>
            <ProfileAvatarButton size={36} />
          </View>
        </View>

        <GlassCard variant="glass" style={styles.userCard}>
          <View style={styles.userCardTop}>
            <Avatar initials={user ? getInitials(user.name) : '?'} size={56} />
            <View style={styles.userCardInfo}>
              <Text style={styles.userName}>{user?.name}</Text>
              <View style={[styles.squadBadge, hasSquad ? styles.squadBadgeActive : styles.squadBadgeSolo]}>
                <Ionicons
                  name={hasSquad ? 'shield' : 'person'}
                  size={12}
                  color={hasSquad ? colors3.primary : colors3.onSurfaceVariant}
                />
                <Text style={[styles.squadBadgeText, hasSquad && styles.squadBadgeTextActive]}>
                  {hasSquad
                    ? `${mockUserSquad.name} · ${mockUserSquad.memberCount} de ${mockUserSquad.maxMembers} membros`
                    : 'Solo · sem squad'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.levelRow}>
            <Text style={styles.levelLabel}>Nível {mockUserProgress.level}</Text>
            <Text style={styles.levelXp}>
              {formatXp(mockUserProgress.xpCurrent)} / {formatXp(mockUserProgress.xpNextLevel)} XP
            </Text>
          </View>
          <View style={styles.levelProgressTrack}>
            <View style={[styles.levelProgressFill, { width: `${xpProgress * 100}%` }]} />
          </View>
        </GlassCard>

        {hasSquad ? (
          <View style={styles.statsGrid}>
            <GlassCard variant="card" style={styles.statTile}>
              <Text style={styles.statLabel}>Posição na cidade</Text>
              <Text style={styles.statValue}>#{mockSquadStats.cityPosition}</Text>
            </GlassCard>
            <GlassCard variant="card" style={styles.statTile}>
              <Text style={styles.statLabel}>Sequência</Text>
              <Text style={styles.statValue}>
                {mockSquadStats.streakDays}
                <Text style={styles.statUnit}> {mockSquadStats.streakDays === 1 ? 'dia' : 'dias'}</Text>
              </Text>
            </GlassCard>
            <GlassCard variant="card" style={styles.statTile}>
              <Text style={styles.statLabel}>XP na semana</Text>
              <Text style={styles.statValue}>{formatXp(mockSquadStats.weeklyXp)}</Text>
            </GlassCard>
            <GlassCard variant="card" style={styles.statTile}>
              <Text style={styles.statLabel}>Território</Text>
              <Text style={styles.statValue}>
                {mockSquadStats.territoryPercent}
                <Text style={styles.statUnit}>%</Text>
              </Text>
            </GlassCard>
          </View>
        ) : (
          <GlassCard variant="glass" style={styles.soloCard}>
            <Text style={styles.soloTitle}>Você ainda joga solo</Text>
            <Text style={styles.soloText}>
              Entre num squad pra somar XP com outras pessoas, disputar território na cidade e aparecer no ranking
              de squads — ou crie o seu e chame quem treina com você.
            </Text>
            <View style={styles.soloButtons}>
              <View style={styles.soloButtonWrap}>
                <Button3 label="Criar squad" onPress={handleComingSoon} />
              </View>
              <View style={styles.soloButtonWrap}>
                <Button3 label="Entrar em um" variant="secondary" onPress={handleComingSoon} />
              </View>
            </View>
          </GlassCard>
        )}

        <View style={styles.pillsRow}>
          <Pressable
            style={[styles.pill, viewMode === 'individual' && styles.pillSelected]}
            onPress={() => setViewMode('individual')}
          >
            <Text style={[styles.pillText, viewMode === 'individual' && styles.pillTextSelected]}>Individual</Text>
          </Pressable>
          <Pressable
            style={[styles.pill, viewMode === 'squad' && styles.pillSelected]}
            onPress={() => setViewMode('squad')}
          >
            <Text style={[styles.pillText, viewMode === 'squad' && styles.pillTextSelected]}>Squad</Text>
          </Pressable>
        </View>

        <View style={styles.list}>
          {viewMode === 'individual'
            ? MOCK_INDIVIDUAL_RANKING.map((person) => (
                <GlassCard key={person.position} variant="card" style={styles.listRow}>
                  <Text style={styles.listPosition}>{person.position}</Text>
                  <Avatar initials={getInitials(person.name)} size={36} />
                  <View style={styles.listInfo}>
                    <Text style={styles.listName} numberOfLines={1}>
                      {person.name}
                    </Text>
                    <Text style={styles.listSubInfo} numberOfLines={1}>
                      {person.squadName ?? 'Solo'}
                    </Text>
                  </View>
                  <Text style={styles.listXp}>{formatXp(person.weeklyXp)} XP</Text>
                </GlassCard>
              ))
            : MOCK_SQUAD_RANKING.map((squad) => (
                <GlassCard key={squad.position} variant="card" style={styles.listRow}>
                  <Text style={styles.listPosition}>{squad.position}</Text>
                  <View style={styles.squadIconWrap}>
                    <Ionicons name="shield" size={18} color={colors3.primary} />
                  </View>
                  <View style={styles.listInfo}>
                    <Text style={styles.listName} numberOfLines={1}>
                      {squad.name}
                    </Text>
                    <Text style={styles.listSubInfo} numberOfLines={1}>
                      {squad.memberCount} membros · {squad.territoryPercent}% território
                    </Text>
                  </View>
                  <Text style={styles.listXp}>{formatXp(squad.weeklyXp)} XP</Text>
                </GlassCard>
              ))}
        </View>
      </ScrollView>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing3.containerMargin, paddingTop: spacing3.xl, gap: spacing3.md },

  header: { gap: spacing3.md, marginBottom: spacing3.md },
  logo: { ...typography3.displayLg, fontSize: 36, fontWeight: '800', color: colors3.primary },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography3.headlineLgMobile, fontSize: 26 },

  userCard: { gap: spacing3.md },
  userCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  userCardInfo: { flex: 1, gap: spacing3.xs },
  userName: { ...typography3.headlineMd, fontSize: 18 },
  squadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing3.sm,
    paddingVertical: 4,
    borderRadius: radius3.pill,
    borderWidth: 1,
  },
  squadBadgeActive: { backgroundColor: 'rgba(107, 56, 212, 0.1)', borderColor: 'rgba(107, 56, 212, 0.25)' },
  squadBadgeSolo: { backgroundColor: colors3.surfaceContainerHigh, borderColor: colors3.outlineVariant },
  squadBadgeText: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
  squadBadgeTextActive: { color: colors3.primary, fontWeight: '700' },

  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  levelLabel: { ...typography3.bodyMd, fontWeight: '700' },
  levelXp: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  levelProgressTrack: {
    height: 8,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceVariant,
    overflow: 'hidden',
  },
  levelProgressFill: { height: '100%', borderRadius: radius3.pill, backgroundColor: colors3.primary },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing3.sm },
  statTile: { flexBasis: '47%', flexGrow: 1, gap: spacing3.xs },
  statLabel: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
  statValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 20, color: colors3.onSurface },
  statUnit: { ...typography3.bodyMd, fontSize: 12, color: colors3.onSurfaceVariant },

  soloCard: { gap: spacing3.sm },
  soloTitle: { ...typography3.headlineMd, fontSize: 18 },
  soloText: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant },
  soloButtons: { flexDirection: 'row', gap: spacing3.sm, marginTop: spacing3.xs },
  soloButtonWrap: { flex: 1 },

  pillsRow: { flexDirection: 'row', gap: spacing3.xs },
  pill: {
    flex: 1,
    paddingVertical: spacing3.sm,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    alignItems: 'center',
  },
  pillSelected: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  pillText: { ...typography3.labelSm, fontSize: 13 },
  pillTextSelected: { color: colors3.white, fontWeight: '700' },

  list: { gap: spacing3.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  listPosition: {
    ...typography3.bodyMd,
    fontWeight: '700',
    color: colors3.onSurfaceVariant,
    width: 20,
    textAlign: 'center',
  },
  squadIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius3.pill,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listInfo: { flex: 1, gap: 2, minWidth: 0 },
  listName: { ...typography3.bodyMd, fontWeight: '700' },
  listSubInfo: { ...typography3.bodyMd, fontSize: 12, color: colors3.onSurfaceVariant },
  listXp: { fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 13, color: colors3.onSurface },
});
