import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/Avatar';
import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { TrainingStreaks, getTrainingStreaks } from '@/services/dashboard';
import {
  IndividualRankingEntry,
  SquadMe,
  SquadRankingEntry,
  TerritoryCity,
  createSquad,
  deleteSquad,
  getIndividualRanking,
  getMySquad,
  getSquadRanking,
  getTerritory,
  joinSquad,
  leaveSquad,
} from '@/services/squads';
import { getInitials } from '@/utils/text';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_HEIGHT } from './_layout';

type RankingViewMode = 'individual' | 'squad';

function formatXp(value: number): string {
  return value.toLocaleString('pt-BR');
}

/** "ago" (sem ponto) a partir de um Date — mesma convencao ja usada em outras telas (ex: HomeScreen.todayLabel). */
function monthAbbrev(date: Date): string {
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

/**
 * Periodo/reset do ranking — calculado de verdade a partir da semana atual
 * (segunda a domingo), mesmo criterio usado no backend (routers/ranking.py
 * _week_start) pro corte de XP semanal.
 */
function getWeekPeriodInfo(): { rangeLabel: string; daysUntilReset: number } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = domingo .. 6 = sabado
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const nextMonday = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 1);

  const daysUntilReset = Math.max(
    1,
    Math.ceil((nextMonday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );
  const rangeLabel =
    monday.getMonth() === sunday.getMonth()
      ? `${monday.getDate()} a ${sunday.getDate()} de ${monthAbbrev(sunday)}`
      : `${monday.getDate()} de ${monthAbbrev(monday)} a ${sunday.getDate()} de ${monthAbbrev(sunday)}`;

  return { rangeLabel, daysUntilReset };
}

/**
 * Avatar stack — fileira de avatares sobrepostos representando membros de
 * um squad, mesmo componente Avatar (iniciais + gradiente) ja usado no
 * resto do app, so em tamanho reduzido. So usado no card do proprio squad
 * do usuario (GET /squads/me retorna a lista de membros de verdade) — a
 * lista de ranking de squads (GET /ranking/squads) nao devolve membros
 * individuais, so member_count, entao nao da pra montar isso la.
 */
const AVATAR_STACK_MAX_VISIBLE = 4;
const AVATAR_STACK_SIZE = 22;

function AvatarStack({ memberNames, totalMembers }: { memberNames: string[]; totalMembers: number }) {
  const visible = memberNames.slice(0, AVATAR_STACK_MAX_VISIBLE);
  const remaining = totalMembers - visible.length;

  return (
    <View style={styles.avatarStack}>
      {visible.map((name, index) => (
        <Avatar
          key={name}
          initials={getInitials(name)}
          size={AVATAR_STACK_SIZE}
          style={[
            styles.avatarStackItem,
            { marginLeft: index === 0 ? 0 : -AVATAR_STACK_SIZE * 0.35, zIndex: visible.length - index },
          ]}
        />
      ))}
      {remaining > 0 && (
        <View style={[styles.avatarStackMore, { marginLeft: -AVATAR_STACK_SIZE * 0.35 }]}>
          <Text style={styles.avatarStackMoreText}>+{remaining}</Text>
        </View>
      )}
    </View>
  );
}

export default function RankingScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<RankingViewMode>('individual');

  const [mySquad, setMySquad] = useState<SquadMe | null>(null);
  const [loadingMySquad, setLoadingMySquad] = useState(true);
  const [errorMySquad, setErrorMySquad] = useState<string | null>(null);

  const [streaks, setStreaks] = useState<TrainingStreaks | null>(null);

  const [individualRanking, setIndividualRanking] = useState<IndividualRankingEntry[]>([]);
  const [loadingIndividual, setLoadingIndividual] = useState(true);
  const [errorIndividual, setErrorIndividual] = useState<string | null>(null);

  const [squadRanking, setSquadRanking] = useState<SquadRankingEntry[]>([]);
  const [loadingSquadRanking, setLoadingSquadRanking] = useState(true);
  const [errorSquadRanking, setErrorSquadRanking] = useState<string | null>(null);

  const [territory, setTerritory] = useState<TerritoryCity[]>([]);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [squadNameInput, setSquadNameInput] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [squadActionSubmitting, setSquadActionSubmitting] = useState(false);
  const [squadActionError, setSquadActionError] = useState<string | null>(null);

  const fetchMySquad = useCallback(async () => {
    setLoadingMySquad(true);
    setErrorMySquad(null);
    try {
      setMySquad(await getMySquad());
    } catch (err) {
      setErrorMySquad(getApiErrorMessage(err, 'Não foi possível carregar seu squad.'));
    } finally {
      setLoadingMySquad(false);
    }
  }, []);

  const fetchIndividualRanking = useCallback(async () => {
    setLoadingIndividual(true);
    setErrorIndividual(null);
    try {
      setIndividualRanking(await getIndividualRanking(50, 0));
    } catch (err) {
      setErrorIndividual(getApiErrorMessage(err, 'Não foi possível carregar o ranking.'));
    } finally {
      setLoadingIndividual(false);
    }
  }, []);

  const fetchSquadRanking = useCallback(async () => {
    setLoadingSquadRanking(true);
    setErrorSquadRanking(null);
    try {
      // limit alto (nao so os N exibidos na lista) pra tambem conseguir
      // localizar a posicao do PROPRIO squad do usuario nas stats do topo
      // (nao existe um endpoint dedicado "meu squad no ranking").
      setSquadRanking(await getSquadRanking(100, 0));
    } catch (err) {
      setErrorSquadRanking(getApiErrorMessage(err, 'Não foi possível carregar o ranking de squads.'));
    } finally {
      setLoadingSquadRanking(false);
    }
  }, []);

  const fetchTerritory = useCallback(async () => {
    try {
      setTerritory(await getTerritory());
    } catch {
      // Card de territorio so some/vira "--" se falhar -- mesmo padrao do
      // ReadinessCard/InsightCard (nunca trava a tela por causa disso).
      setTerritory([]);
    }
  }, []);

  const fetchStreaks = useCallback(async () => {
    try {
      setStreaks(await getTrainingStreaks());
    } catch {
      setStreaks(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMySquad();
      fetchIndividualRanking();
      fetchSquadRanking();
      fetchTerritory();
      fetchStreaks();
    }, [fetchMySquad, fetchIndividualRanking, fetchSquadRanking, fetchTerritory, fetchStreaks])
  );

  const squad = mySquad?.squad ?? null;
  const hasSquad = squad != null;
  const levelInfo = mySquad?.level_info;
  const xpProgress =
    levelInfo && levelInfo.xp_next_level > 0
      ? Math.max(0, Math.min(1, levelInfo.xp_current / levelInfo.xp_next_level))
      : 0;
  const weekPeriod = getWeekPeriodInfo();

  // Linha do proprio squad dentro do ranking geral (ver comentario em
  // fetchSquadRanking) -- pode nao ser encontrada se o squad estiver fora
  // do limit buscado; nesse caso as stats que dependem disso viram "--".
  const mySquadRankingRow = hasSquad ? squadRanking.find((row) => row.squad_id === squad!.id) ?? null : null;

  const myCityTerritory = user?.city ? territory.find((t) => t.city === user.city) ?? null : null;
  const isDominantInCity = !!(hasSquad && myCityTerritory && myCityTerritory.dominant_squad_id === squad!.id);
  const isSquadOwner = !!(hasSquad && user && squad!.created_by === user.id);

  function openCreateModal() {
    setModalError(null);
    setSquadNameInput('');
    setCreateModalVisible(true);
  }

  function openJoinModal() {
    setModalError(null);
    setInviteCodeInput('');
    setJoinModalVisible(true);
  }

  async function handleCreateSquad() {
    const name = squadNameInput.trim();
    if (!name) return;
    setSubmitting(true);
    setModalError(null);
    try {
      await createSquad(name);
      setCreateModalVisible(false);
      fetchMySquad();
      fetchSquadRanking();
    } catch (err) {
      setModalError(getApiErrorMessage(err, 'Não foi possível criar o squad.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinSquad() {
    const code = inviteCodeInput.trim();
    if (code.length !== 6) return;
    setSubmitting(true);
    setModalError(null);
    try {
      await joinSquad(code);
      setJoinModalVisible(false);
      fetchMySquad();
      fetchSquadRanking();
    } catch (err) {
      setModalError(getApiErrorMessage(err, 'Não foi possível entrar no squad.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function performLeaveSquad() {
    setSquadActionSubmitting(true);
    setSquadActionError(null);
    try {
      await leaveSquad();
      await fetchMySquad();
      fetchSquadRanking();
    } catch (err) {
      setSquadActionError(getApiErrorMessage(err, 'Não foi possível sair do squad.'));
    } finally {
      setSquadActionSubmitting(false);
    }
  }

  function confirmLeaveSquad() {
    if (!squad) return;
    Alert.alert('Sair do squad', `Tem certeza que quer sair de ${squad.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: performLeaveSquad },
    ]);
  }

  async function performDeleteSquad() {
    if (!squad) return;
    setSquadActionSubmitting(true);
    setSquadActionError(null);
    try {
      await deleteSquad(squad.id);
      await fetchMySquad();
      fetchSquadRanking();
    } catch (err) {
      setSquadActionError(getApiErrorMessage(err, 'Não foi possível deletar o squad.'));
    } finally {
      setSquadActionSubmitting(false);
    }
  }

  function confirmDeleteSquad() {
    if (!squad) return;
    const memberWord = squad.member_count === 1 ? 'membro' : 'membros';
    Alert.alert(
      'Deletar squad',
      `Isso vai remover o squad para todos os ${squad.member_count} ${memberWord}. Tem certeza?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Deletar', style: 'destructive', onPress: performDeleteSquad },
      ]
    );
  }

  return (
    <ScreenBackground3 style={styles.flex}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + spacing3.lg },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv Fit</Text>
          <View style={styles.headerTop}>
            <Text style={styles.title}>Ranking</Text>
            <ProfileAvatarButton size={36} />
          </View>
        </View>

        <GlassCard variant="glass" style={styles.userCard}>
          {loadingMySquad ? (
            <ActivityIndicator color={colors3.primary} style={styles.loading} />
          ) : errorMySquad ? (
            <Text style={styles.error}>{errorMySquad}</Text>
          ) : (
            <>
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
                        ? `${squad!.name} · ${squad!.member_count} de ${squad!.max_members} membros`
                        : 'Solo · sem squad'}
                    </Text>
                  </View>
                  {hasSquad && (
                    <AvatarStack
                      memberNames={squad!.members.map((m) => m.name)}
                      totalMembers={squad!.member_count}
                    />
                  )}
                </View>
              </View>

              {levelInfo && (
                <>
                  <View style={styles.levelRow}>
                    <Text style={styles.levelLabel}>Nível {levelInfo.level}</Text>
                    <Text style={styles.levelXp}>
                      {formatXp(levelInfo.xp_current)} / {formatXp(levelInfo.xp_next_level)} XP
                    </Text>
                  </View>
                  <View style={styles.levelProgressTrack}>
                    <View style={[styles.levelProgressFill, { width: `${xpProgress * 100}%` }]} />
                  </View>
                </>
              )}

              {hasSquad && (
                <Pressable
                  onPress={isSquadOwner ? confirmDeleteSquad : confirmLeaveSquad}
                  disabled={squadActionSubmitting}
                  hitSlop={8}
                  style={styles.squadActionRow}
                >
                  <Ionicons name={isSquadOwner ? 'trash-outline' : 'exit-outline'} size={14} color={colors3.error} />
                  <Text style={styles.squadActionText}>{isSquadOwner ? 'Deletar squad' : 'Sair do squad'}</Text>
                </Pressable>
              )}
              {!!squadActionError && <Text style={styles.error}>{squadActionError}</Text>}
            </>
          )}
        </GlassCard>

        {!loadingMySquad && !errorMySquad && (
          <>
            {hasSquad ? (
              <>
                <View style={styles.statsGrid}>
                  <GlassCard variant="card" style={styles.statTile}>
                    <Text style={styles.statLabel}>Posição geral</Text>
                    <Text style={styles.statValue}>
                      {mySquadRankingRow ? `#${mySquadRankingRow.position}` : '--'}
                    </Text>
                  </GlassCard>
                  <GlassCard variant="card" style={styles.statTile}>
                    <Text style={styles.statLabel}>Sequência (você)</Text>
                    <Text style={styles.statValue}>
                      {streaks ? streaks.current_streak_days : '--'}
                      {streaks && (
                        <Text style={styles.statUnit}> {streaks.current_streak_days === 1 ? 'dia' : 'dias'}</Text>
                      )}
                    </Text>
                    {streaks && (
                      <Text style={styles.statRecord}>
                        Recorde: <Text style={styles.statRecordValue}>{streaks.best_streak_days} dias</Text>
                      </Text>
                    )}
                  </GlassCard>
                  <GlassCard variant="card" style={styles.statTile}>
                    <Text style={styles.statLabel}>XP na semana</Text>
                    <Text style={styles.statValue}>
                      {mySquadRankingRow ? formatXp(mySquadRankingRow.weekly_xp) : '--'}
                    </Text>
                  </GlassCard>
                  <GlassCard variant="card" style={styles.statTile}>
                    <Text style={styles.statLabel}>Território</Text>
                    <Text style={styles.statValue}>
                      {user?.city ? (isDominantInCity ? myCityTerritory!.dominant_squad_percent : 0) : '--'}
                      {user?.city && <Text style={styles.statUnit}>%</Text>}
                    </Text>
                    {user?.city && !isDominantInCity && (
                      <Text style={styles.statRecord}>Não domina {user.city}</Text>
                    )}
                  </GlassCard>
                </View>
                {!user?.city && (
                  <GlassCard variant="glass" style={styles.cityHintCard}>
                    <Text style={styles.cityHintText}>
                      Configure sua cidade no perfil pra participar da disputa de território.
                    </Text>
                  </GlassCard>
                )}
              </>
            ) : (
              <GlassCard variant="glass" style={styles.soloCard}>
                <Text style={styles.soloTitle}>Você ainda joga solo</Text>
                <Text style={styles.soloText}>
                  Entre num squad pra somar XP com outras pessoas, disputar território na cidade e aparecer no
                  ranking de squads — ou crie o seu e chame quem treina com você.
                </Text>
                <View style={styles.soloButtons}>
                  <View style={styles.soloButtonWrap}>
                    <Button3 label="Criar squad" onPress={openCreateModal} />
                  </View>
                  <View style={styles.soloButtonWrap}>
                    <Button3 label="Entrar em um" variant="secondary" onPress={openJoinModal} />
                  </View>
                </View>
              </GlassCard>
            )}
          </>
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

        <View style={styles.periodLine}>
          <Ionicons name="time-outline" size={13} color={colors3.onSurfaceVariant} />
          <Text style={styles.periodText}>
            Semana de {weekPeriod.rangeLabel} ·{' '}
            <Text style={styles.periodTextStrong}>
              reseta em {weekPeriod.daysUntilReset} {weekPeriod.daysUntilReset === 1 ? 'dia' : 'dias'}
            </Text>
          </Text>
        </View>

        {viewMode === 'individual' ? (
          <>
            {loadingIndividual && <ActivityIndicator color={colors3.primary} style={styles.loading} />}
            {!!errorIndividual && <Text style={styles.error}>{errorIndividual}</Text>}
            {!loadingIndividual && !errorIndividual && (
              <View style={styles.list}>
                {individualRanking.map((person) => (
                  <GlassCard key={person.position} variant="card" style={styles.listRow}>
                    <View style={styles.listPositionWrap}>
                      <Text style={styles.listPosition}>{person.position}</Text>
                    </View>
                    <Avatar initials={getInitials(person.name)} size={36} />
                    <View style={styles.listInfo}>
                      <Text style={styles.listName} numberOfLines={1}>
                        {person.name}
                      </Text>
                      <Text style={styles.listSubInfo} numberOfLines={1}>
                        {person.squad_name ?? 'Solo'}
                      </Text>
                    </View>
                    <Text style={styles.listXp}>{formatXp(person.weekly_xp)} XP</Text>
                  </GlassCard>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            {loadingSquadRanking && <ActivityIndicator color={colors3.primary} style={styles.loading} />}
            {!!errorSquadRanking && <Text style={styles.error}>{errorSquadRanking}</Text>}
            {!loadingSquadRanking && !errorSquadRanking && (
              <View style={styles.list}>
                {squadRanking.map((row) => (
                  <GlassCard key={row.position} variant="card" style={styles.listRow}>
                    <View style={styles.listPositionWrap}>
                      <Text style={styles.listPosition}>{row.position}</Text>
                    </View>
                    <View style={styles.squadIconWrap}>
                      <Ionicons name="shield" size={18} color={colors3.primary} />
                    </View>
                    <View style={styles.listInfo}>
                      <Text style={styles.listName} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <Text style={styles.listSubInfo} numberOfLines={1}>
                        {row.member_count} {row.member_count === 1 ? 'membro' : 'membros'}
                      </Text>
                    </View>
                    <Text style={styles.listXp}>{formatXp(row.weekly_xp)} XP</Text>
                  </GlassCard>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={createModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Criar squad</Text>
              <Pressable onPress={() => setCreateModalVisible(false)} hitSlop={12} accessibilityLabel="Fechar">
                <Ionicons name="close" size={24} color={colors3.onSurface} />
              </Pressable>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Nome do squad"
              placeholderTextColor={colors3.onSurfaceVariant}
              value={squadNameInput}
              onChangeText={setSquadNameInput}
              maxLength={60}
              autoFocus
            />
            {!!modalError && <Text style={styles.modalError}>{modalError}</Text>}
            <Button3
              label="Criar"
              onPress={handleCreateSquad}
              loading={submitting}
              disabled={!squadNameInput.trim() || submitting}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={joinModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setJoinModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Entrar em um squad</Text>
              <Pressable onPress={() => setJoinModalVisible(false)} hitSlop={12} accessibilityLabel="Fechar">
                <Ionicons name="close" size={24} color={colors3.onSurface} />
              </Pressable>
            </View>
            <TextInput
              style={[styles.modalInput, styles.modalInviteInput]}
              placeholder="Código de convite"
              placeholderTextColor={colors3.onSurfaceVariant}
              value={inviteCodeInput}
              onChangeText={(text) => setInviteCodeInput(text.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
            />
            {!!modalError && <Text style={styles.modalError}>{modalError}</Text>}
            <Button3
              label="Entrar"
              onPress={handleJoinSquad}
              loading={submitting}
              disabled={inviteCodeInput.trim().length !== 6 || submitting}
            />
          </View>
        </View>
      </Modal>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing3.containerMargin, paddingTop: spacing3.xl, gap: spacing3.md },

  header: { gap: spacing3.md, marginBottom: spacing3.md },
  logo: { ...typography3.displayLg, fontSize: 36, fontFamily: 'Inter_800ExtraBold', color: colors3.primary },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography3.headlineLgMobile, fontSize: 26 },

  loading: { marginVertical: spacing3.lg },
  error: { color: colors3.error, textAlign: 'center', marginVertical: spacing3.sm },

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
  squadBadgeTextActive: { color: colors3.primary, fontFamily: 'Inter_700Bold' },

  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  levelLabel: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },
  levelXp: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  levelProgressTrack: {
    height: 8,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceVariant,
    overflow: 'hidden',
  },
  levelProgressFill: { height: '100%', borderRadius: radius3.pill, backgroundColor: colors3.primary },

  squadActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: -spacing3.xs,
  },
  squadActionText: { ...typography3.labelSm, textTransform: 'none', color: colors3.error },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing3.sm },
  statTile: { flexBasis: '47%', flexGrow: 1, gap: spacing3.xs },
  statLabel: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
  statValue: { ...typography3.headlineLg, fontSize: 20, lineHeight: 24, color: colors3.onSurface },
  statUnit: { ...typography3.bodyMd, fontSize: 12, color: colors3.onSurfaceVariant },
  statRecord: {
    ...typography3.labelSm,
    textTransform: 'none',
    fontSize: 10.5,
    color: colors3.onSurfaceVariant,
    marginTop: -2,
  },
  statRecordValue: { fontFamily: 'Inter_700Bold', color: colors3.onSurface },

  cityHintCard: { paddingVertical: spacing3.sm },
  cityHintText: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },

  avatarStack: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  avatarStackItem: { borderWidth: 2, borderColor: colors3.background },
  avatarStackMore: {
    width: AVATAR_STACK_SIZE,
    height: AVATAR_STACK_SIZE,
    borderRadius: AVATAR_STACK_SIZE / 2,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 2,
    borderColor: colors3.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStackMoreText: { fontSize: 8.5, fontFamily: 'Inter_700Bold', color: colors3.onSurfaceVariant },

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
  pillTextSelected: { color: colors3.white, fontFamily: 'Inter_700Bold' },

  periodLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  periodText: { ...typography3.labelSm, textTransform: 'none', fontSize: 11.5, color: colors3.onSurfaceVariant },
  periodTextStrong: { fontFamily: 'Inter_700Bold', color: colors3.onSurface },

  list: { gap: spacing3.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  listPositionWrap: { width: 24, alignItems: 'center', gap: 1 },
  listPosition: {
    ...typography3.bodyMd,
    fontFamily: 'Inter_700Bold',
    color: colors3.onSurfaceVariant,
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
  listName: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },
  listSubInfo: { ...typography3.bodyMd, fontSize: 12, color: colors3.onSurfaceVariant },
  listXp: { ...typography3.headlineMd, fontSize: 13, lineHeight: 16, color: colors3.onSurface },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors3.background,
    borderTopLeftRadius: radius3.xl,
    borderTopRightRadius: radius3.xl,
    padding: spacing3.lg,
    paddingBottom: spacing3.xl,
    gap: spacing3.md,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { ...typography3.headlineMd, fontSize: 18 },
  modalInput: {
    ...typography3.bodyMd,
    borderRadius: radius3.md,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    backgroundColor: colors3.surfaceVariant,
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm + 2,
    color: colors3.onSurface,
  },
  modalInviteInput: { textTransform: 'uppercase', letterSpacing: 4, textAlign: 'center' },
  modalError: { color: colors3.error, fontSize: 13 },
});
