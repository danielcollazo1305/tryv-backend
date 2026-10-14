import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { PostGrid2 } from '@/components/PostGrid2';
import { ProfileBadges2 } from '@/components/ProfileBadges2';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { TrainingFrequencyCard } from '@/components/TrainingFrequencyCard';
import { WeeklyActivityChart } from '@/components/WeeklyActivityChart';
import { useAuth } from '@/context/AuthContext';
import { blockUser, classifyModerationError, unblockUser } from '@/services/moderation';
import { getApiErrorMessage } from '@/services/api';
import {
  Post,
  PublicProfile,
  UserBrief,
  followUser,
  getPublicProfile,
  listFollowers,
  listFollowing,
  listUserPosts,
  unfollowUser,
} from '@/services/social';
import { UserBadges, getUserBadges } from '@/services/user';
import { colors2, spacing2, typography2 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user: currentUser } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [followers, setFollowers] = useState<UserBrief[]>([]);
  const [following, setFollowing] = useState<UserBrief[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [badges, setBadges] = useState<UserBadges | null>(null);
  // Nome e avatar vem de GET /users/{id}/profile; se a chamada falhar, o nome cai no autor dos posts ou, se ja
  // seguimos essa pessoa, na entrada correspondente da nossa lista de "following" (sem avatar: iniciais).
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  // 404 no perfil = "Perfil indisponivel" (inclui quem me bloqueou, sem revelar o motivo). blockedByMe = eu bloqueei esta pessoa.
  const [unavailable, setUnavailable] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se por algum motivo o proprio usuario cair aqui, manda pro tab de Perfil.
  useEffect(() => {
    if (userId && currentUser?.id === userId) {
      router.replace('/(tabs)/profile');
    }
  }, [userId, currentUser?.id]);

  const fetchAll = useCallback(async () => {
    if (!userId || !currentUser) return;
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      // Perfil primeiro: 404 do backend (usuario inexistente ou que me bloqueou) = tela "Perfil indisponivel"; se EU
      // bloqueei, so o cabecalho com Desbloquear (posts/seguidores dessa pessoa dao 404 para mim). Outros erros mantem o
      // comportamento antigo (a tela carrega sem o perfil).
      let profileData: PublicProfile | null = null;
      try {
        profileData = await getPublicProfile(userId);
      } catch (profileErr) {
        const detail = axios.isAxiosError(profileErr) ? (profileErr.response?.data as { detail?: unknown } | undefined)?.detail : undefined;
        // So 404 com `detail` PROPRIO do backend (string diferente de "Not Found") = indisponivel; 404 sem detail ou com o
        // "Not Found" padrao (rota inexistente numa API antiga) mantem o comportamento antigo (a tela carrega).
        if (axios.isAxiosError(profileErr) && profileErr.response?.status === 404 && typeof detail === 'string' && detail !== 'Not Found') {
          setUnavailable(true);
          return;
        }
      }
      if (profileData?.is_blocked_by_me) {
        setBlockedByMe(true);
        setProfile(profileData);
        setDisplayName(profileData.name);
        setPosts([]);
        setFollowers([]);
        setFollowing([]);
        setBadges(null);
        return;
      }
      setBlockedByMe(false);
      const [postsData, followersData, followingData, myFollowingData, badgesData] = await Promise.all([
        listUserPosts(userId),
        listFollowers(userId),
        listFollowing(userId),
        listFollowing(currentUser.id),
        getUserBadges(userId).catch(() => null),
      ]);
      setPosts(postsData);
      setFollowers(followersData);
      setFollowing(followingData);
      setIsFollowing(myFollowingData.some((u) => u.id === userId));
      setProfile(profileData);
      setDisplayName(
        profileData?.name ?? postsData[0]?.author ?? myFollowingData.find((u) => u.id === userId)?.name ?? null
      );
      setBadges(badgesData);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar este perfil.'));
    } finally {
      setLoading(false);
    }
  }, [userId, currentUser]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const handleToggleFollow = async () => {
    if (!userId) return;
    setFollowBusy(true);
    setError(null);
    try {
      if (isFollowing) await unfollowUser(userId);
      else await followUser(userId);
      await fetchAll();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel atualizar o status de seguir.'));
    } finally {
      setFollowBusy(false);
    }
  };

  const personName = displayName ?? 'esta pessoa';

  const doBlock = async () => {
    setModerationBusy(true);
    try {
      await blockUser(userId);
      router.back();
    } catch (err) {
      Alert.alert('Não foi possível bloquear', classifyModerationError(err, 'Tente novamente.').message);
    } finally {
      setModerationBusy(false);
    }
  };

  const doUnblock = async () => {
    setModerationBusy(true);
    try {
      await unblockUser(userId);
      setBlockedByMe(false);
      await fetchAll();
    } catch (err) {
      Alert.alert('Não foi possível desbloquear', classifyModerationError(err, 'Tente novamente.').message);
    } finally {
      setModerationBusy(false);
    }
  };

  const handleOpenMenu = () => {
    if (blockedByMe) {
      Alert.alert('Opções', undefined, [
        { text: `Desbloquear ${personName}`, onPress: doUnblock },
        { text: 'Cancelar', style: 'cancel' },
      ]);
      return;
    }
    Alert.alert('Opções', undefined, [
      {
        text: `Bloquear ${personName}`,
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            `Bloquear ${personName}?`,
            'Você não verá mais os posts dessa pessoa e ela não verá os seus. Você pode desbloquear depois em Perfil > Usuários bloqueados.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Bloquear', style: 'destructive', onPress: doBlock },
            ]
          ),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={22} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv Fit</Text>
        {!loading && !unavailable ? (
          <Pressable
            onPress={handleOpenMenu}
            disabled={moderationBusy}
            hitSlop={8}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Mais opções"
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors2.onSurface} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors2.violet} />
        </View>
      ) : unavailable ? (
        <View style={styles.centered}>
          <Ionicons name="person-remove-outline" size={36} color={colors2.onSurfaceVariant} />
          <Text style={styles.unavailableTitle}>Perfil indisponível</Text>
          <Text style={styles.emptyText}>Este perfil não está disponível no momento.</Text>
          <Button2 label="Voltar" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : blockedByMe ? (
        <ScrollView contentContainerStyle={styles.content}>
          <LiquiglassCard style={styles.profileCard}>
            <Avatar
              initials={displayName ? getInitials(displayName) : '?'}
              imageUrl={profile?.avatar_url}
              thumbUrl={profile?.avatar_thumb_url}
              size={100}
            />
            <Text style={styles.name}>{displayName ?? 'Perfil'}</Text>
            <Text style={styles.emptyText}>Você bloqueou esta pessoa.</Text>
            <Button2 label="Desbloquear" onPress={doUnblock} loading={moderationBusy} />
          </LiquiglassCard>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {!!error && <Text style={styles.error}>{error}</Text>}

          <LiquiglassCard style={styles.profileCard}>
            <Avatar
              initials={displayName ? getInitials(displayName) : '?'}
              imageUrl={profile?.avatar_url}
              thumbUrl={profile?.avatar_thumb_url}
              size={100}
            />
            <Text style={styles.name}>{displayName ?? 'Perfil'}</Text>

            <ProfileBadges2 badges={badges} />

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{followers.length}</Text>
                <Text style={styles.statLabel}>Seguidores</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{following.length}</Text>
                <Text style={styles.statLabel}>Seguindo</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{posts.length}</Text>
                <Text style={styles.statLabel}>Posts</Text>
              </View>
            </View>

            <Button2
              label={isFollowing ? 'Seguindo' : 'Seguir'}
              variant={isFollowing ? 'secondary' : 'primary'}
              onPress={handleToggleFollow}
              loading={followBusy}
            />
          </LiquiglassCard>

          <View style={styles.postsSection}>
            <Text style={styles.sectionTitle}>Posts</Text>
            {posts.length > 0 ? (
              <PostGrid2 posts={posts} />
            ) : (
              <View style={styles.empty}>
                <Ionicons name="images-outline" size={28} color={colors2.onSurfaceVariant} />
                <Text style={styles.emptyText}>Nenhum post visivel ainda.</Text>
              </View>
            )}
          </View>

          {/*
            Km semanal + frequencia de treino (item 2) — mesmos componentes
            da Home, agora buscando o dado do usuario visitado (userId) em
            vez do proprio. Visivel por padrao pra qualquer um, sem gate de
            seguidor (decisao ja tomada, diferente da regra de posts do
            item 1) — os proprios componentes ja tratam o estado vazio em
            3a pessoa quando recebem userId.
          */}
          {!!userId && (
            <View style={styles.activitySection}>
              <Text style={styles.sectionTitle}>Atividade</Text>
              <LiquiglassCard style={styles.activityCard}>
                <Text style={styles.activityCardTitle}>Km rodados</Text>
                <WeeklyActivityChart userId={userId} />
              </LiquiglassCard>
              <TrainingFrequencyCard userId={userId} />
            </View>
          )}
        </ScrollView>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing2.md, padding: spacing2.containerMargin },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  unavailableTitle: { ...typography2.headlineMd, fontSize: 18 },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.lg },
  error: { color: colors2.danger, textAlign: 'center' },

  profileCard: { alignItems: 'center', gap: spacing2.md },
  name: { ...typography2.headlineLgMobile, fontSize: 22 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.lg, marginTop: spacing2.xs },
  stat: { alignItems: 'center', minWidth: 64 },
  statDivider: { width: 1, height: 32, backgroundColor: colors2.outlineVariant },
  statNumber: { ...typography2.metricMono, fontSize: 18, color: colors2.primary },
  statLabel: { ...typography2.labelCaps, fontSize: 10, marginTop: 2 },

  postsSection: { gap: spacing2.md },
  sectionTitle: { ...typography2.headlineMd, fontSize: 18 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing2.xl, gap: spacing2.sm },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },

  activitySection: { gap: spacing2.md },
  activityCard: { gap: spacing2.sm },
  activityCardTitle: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },
});
