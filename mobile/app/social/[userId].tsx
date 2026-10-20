import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Button3 } from '@/components/Button3';
import { PillTabs } from '@/components/PillTabs';
import { PostGrid2 } from '@/components/PostGrid2';
import { ProfileBadges2 } from '@/components/ProfileBadges2';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { TrainingFrequencyCard } from '@/components/TrainingFrequencyCard';
import { WeeklyActivityChart } from '@/components/WeeklyActivityChart';
import { FeedEmpty, FeedError, FeedFooterLoading, FeedLoading } from '@/components/profile/FeedStateViews';
import { GALLERY_COLUMNS, GalleryCell } from '@/components/profile/GalleryCell';
import { IdentityLines } from '@/components/profile/IdentityLines';
import { usePagedFeed } from '@/components/profile/usePagedFeed';
import { useAuth } from '@/context/AuthContext';
import { blockUser, classifyModerationError, unblockUser } from '@/services/moderation';
import { getApiErrorMessage } from '@/services/api';
import { getGallery } from '@/services/profileFeed';
import type { GalleryItem } from '@/services/profileFeedState';
import {
  GALLERY_EMPTY_NEUTRAL,
  PUBLIC_TABS,
  PublicIdentity,
  PublicTab,
  hasIdentityLines,
  isGalleryUnavailable,
  normalizePublicProfile,
  pickDisplayName,
  profileLoadOutcome,
} from '@/services/publicProfileState';
import {
  Post,
  UserBrief,
  followUser,
  getPublicProfile,
  listFollowers,
  listFollowing,
  listUserPosts,
  unfollowUser,
} from '@/services/social';
import { UserBadges, getUserBadges } from '@/services/user';
import { colors2, colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

const galleryKey = (item: GalleryItem) => item.post_id;
const CONTENT_ROW = [{ post_id: 'content' }] as unknown as GalleryItem[];

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user: currentUser } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [followers, setFollowers] = useState<UserBrief[]>([]);
  const [following, setFollowing] = useState<UserBrief[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [badges, setBadges] = useState<UserBadges | null>(null);
  // Nome, @usuario, bio, link e avatar vem de GET /users/{id}/profile (so o que o servidor devolver preenchido); se a chamada falhar, o nome
  // cai no autor dos posts ou, se ja seguimos essa pessoa, na entrada correspondente da nossa lista de "following" (sem avatar: iniciais).
  const [identity, setIdentity] = useState<PublicIdentity | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  // 404/403 no perfil = "Perfil indisponivel" (inclui quem me bloqueou, sem revelar o motivo). blockedByMe = eu bloqueei esta pessoa.
  const [unavailable, setUnavailable] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<PublicTab>('gallery');
  const requestRef = useRef(0);

  // Se por algum motivo o proprio usuario cair aqui, manda pro tab de Perfil.
  useEffect(() => {
    if (userId && currentUser?.id === userId) {
      router.replace('/(tabs)/profile');
    }
  }, [userId, currentUser?.id]);

  const fetchAll = useCallback(async () => {
    if (!userId || !currentUser) return;
    const request = ++requestRef.current;
    const stale = () => request !== requestRef.current;
    setLoading(true);
    setLoadError(null);
    setUnavailable(false);
    try {
      // Perfil primeiro: 404/403 do backend (usuario inexistente ou que me bloqueou) = tela "Perfil indisponivel"; se EU bloqueei, so o
      // cabecalho com Desbloquear (posts/seguidores dessa pessoa dao 404 para mim). Outros erros mantem o comportamento antigo (a tela carrega
      // sem o perfil).
      let profileData: PublicIdentity | null = null;
      try {
        profileData = normalizePublicProfile(await getPublicProfile(userId));
      } catch (profileErr) {
        if (profileLoadOutcome(profileErr) === 'unavailable') {
          if (stale()) return;
          setUnavailable(true);
          return;
        }
      }
      if (stale()) return;
      if (profileData?.blockedByMe) {
        setBlockedByMe(true);
        setIdentity(profileData);
        setDisplayName(profileData.name);
        setPosts([]);
        setFollowers([]);
        setFollowing([]);
        setBadges(null);
        setLoaded(true);
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
      if (stale()) return;
      setPosts(postsData);
      setFollowers(followersData);
      setFollowing(followingData);
      setIsFollowing(myFollowingData.some((u) => u.id === userId));
      setIdentity(profileData);
      setDisplayName(pickDisplayName(profileData?.name, postsData[0]?.author, myFollowingData.find((u) => u.id === userId)?.name));
      setBadges(badgesData);
      setLoaded(true);
    } catch (err) {
      if (stale()) return;
      setLoadError(getApiErrorMessage(err, 'Não foi possível carregar este perfil.'));
    } finally {
      if (!stale()) setLoading(false);
    }
  }, [userId, currentUser]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  // Galeria: a mesma grade e paginacao da E4, com o userId desta pessoa. 404/403 (ex.: bloqueio entre uma chamada e outra) vira lista vazia
  // neutra; so busca quando o perfil carregou, esta disponivel e nao esta bloqueado por mim, e so uma vez (trocar de aba nao refaz).
  const gallery = usePagedFeed<GalleryItem>({
    fetchPage: (request) =>
      getGallery(String(userId), request).catch((err) => {
        if (isGalleryUnavailable(err)) return { items: [], next_cursor: null };
        throw err;
      }),
    keyOf: galleryKey,
    enabled: tab === 'gallery' && !!userId && loaded && !loading && !unavailable && !blockedByMe && !loadError,
    resetKey: String(userId),
  });

  const handleToggleFollow = async () => {
    if (!userId) return;
    setFollowBusy(true);
    setActionError(null);
    try {
      if (isFollowing) await unfollowUser(userId);
      else await followUser(userId);
      await fetchAll();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Não foi possível atualizar o status de seguir.'));
    } finally {
      setFollowBusy(false);
    }
  };

  const personName = displayName ?? 'esta pessoa';

  const doBlock = async () => {
    setModerationBusy(true);
    try {
      await blockUser(String(userId));
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
      await unblockUser(String(userId));
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

  const topBar = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Voltar">
        <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle}>Tryv Fit</Text>
      {!loading && !unavailable && !loadError ? (
        <Pressable
          onPress={handleOpenMenu}
          disabled={moderationBusy}
          hitSlop={8}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Mais opções"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors3.onSurface} />
        </Pressable>
      ) : (
        <View style={styles.headerButton} />
      )}
    </View>
  );

  const avatar = (
    <Avatar
      initials={displayName ? getInitials(displayName) : '?'}
      imageUrl={identity?.avatarUrl}
      thumbUrl={identity?.avatarThumbUrl}
      size={100}
    />
  );

  if (loading && !loaded) {
    return (
      <ScreenBackground3>
        {topBar}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors3.primary} accessibilityLabel="Carregando" />
        </View>
      </ScreenBackground3>
    );
  }

  if (unavailable) {
    return (
      <ScreenBackground3>
        {topBar}
        <View style={styles.centered}>
          <Ionicons name="person-remove-outline" size={36} color={colors3.onSurfaceVariant} />
          <Text style={styles.unavailableTitle}>Perfil indisponível</Text>
          <Text style={styles.mutedText}>Este perfil não está disponível no momento.</Text>
          <Button3 label="Voltar" variant="secondary" onPress={() => router.back()} />
        </View>
      </ScreenBackground3>
    );
  }

  if (loadError && !loaded) {
    return (
      <ScreenBackground3>
        {topBar}
        <View style={styles.centered}>
          <FeedError message={loadError} onRetry={fetchAll} />
          <Button3 label="Voltar" variant="secondary" onPress={() => router.back()} />
        </View>
      </ScreenBackground3>
    );
  }

  if (blockedByMe) {
    return (
      <ScreenBackground3>
        {topBar}
        <View style={styles.blockedBox}>
          {avatar}
          <Text style={styles.name}>{displayName ?? 'Perfil'}</Text>
          <Text style={styles.mutedText}>Você bloqueou esta pessoa.</Text>
          <Button3 label="Desbloquear" onPress={doUnblock} loading={moderationBusy} />
        </View>
      </ScreenBackground3>
    );
  }

  const listHeader = (
    <View style={styles.headerBox}>
      {!!loadError && <Text style={styles.error}>{loadError}</Text>}
      {!!actionError && <Text style={styles.error}>{actionError}</Text>}
      <View style={styles.profileCard}>
        {avatar}
        <Text style={styles.name}>{displayName ?? 'Perfil'}</Text>
        {identity && hasIdentityLines(identity) ? <IdentityLines username={identity.username} bio={identity.bio} link={identity.link} /> : null}

        <ProfileBadges2 badges={badges} variant="light" />

        <View style={styles.statsRow}>
          <View style={styles.stat} accessible accessibilityLabel={`${followers.length} seguidores`}>
            <Text style={styles.statNumber}>{followers.length}</Text>
            <Text style={styles.statLabel}>Seguidores</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat} accessible accessibilityLabel={`${following.length} seguindo`}>
            <Text style={styles.statNumber}>{following.length}</Text>
            <Text style={styles.statLabel}>Seguindo</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat} accessible accessibilityLabel={`${posts.length} posts`}>
            <Text style={styles.statNumber}>{posts.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
        </View>

        <Button3
          label={isFollowing ? 'Seguindo' : 'Seguir'}
          variant={isFollowing ? 'secondary' : 'primary'}
          onPress={handleToggleFollow}
          loading={followBusy}
          accessibilityLabel={isFollowing ? 'Deixar de seguir' : 'Seguir'}
        />
      </View>

      <PillTabs tabs={PUBLIC_TABS} selected={tab} onSelect={setTab} />
    </View>
  );

  const galleryState = gallery.state;
  let listEmpty: React.ReactElement | null = null;
  if (tab === 'gallery') {
    if (galleryState.error && galleryState.items.length === 0) {
      listEmpty = <FeedError message="Não foi possível carregar as fotos." onRetry={gallery.retry} />;
    } else if (galleryState.loaded && galleryState.items.length === 0) {
      listEmpty = <FeedEmpty icon="images-outline" title={GALLERY_EMPTY_NEUTRAL.title} text={GALLERY_EMPTY_NEUTRAL.text} />;
    } else {
      listEmpty = <FeedLoading />;
    }
  }

  // Posts e Atividade sao uma unica linha da lista (nada de ScrollView aninhado); a Galeria e a grade paginada.
  const contentRow = tab === 'posts' ? (
    posts.length > 0 ? (
      <PostGrid2 posts={posts} variant="light" />
    ) : (
      <FeedEmpty icon="images-outline" title="Nenhum post visível ainda" text="Quando houver posts, eles aparecem aqui." />
    )
  ) : (
    !!userId && (
      <View style={styles.activityBox}>
        <Text style={styles.activityTitle}>Km rodados</Text>
        <WeeklyActivityChart userId={userId} />
        <TrainingFrequencyCard userId={userId} />
      </View>
    )
  );

  return (
    <ScreenBackground3>
      {topBar}
      <FlatList
        key={tab === 'gallery' ? 'gallery' : 'content'}
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        data={tab === 'gallery' ? galleryState.items : CONTENT_ROW}
        numColumns={tab === 'gallery' ? GALLERY_COLUMNS : 1}
        keyExtractor={(item) => galleryKey(item)}
        renderItem={({ item }) => (tab === 'gallery' ? <GalleryCell item={item} /> : <View>{contentRow}</View>)}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={<FeedFooterLoading visible={tab === 'gallery' && !!galleryState.loadingMore} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (tab === 'gallery') gallery.loadMore();
        }}
      />
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
  },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing3.md, padding: spacing3.containerMargin },
  blockedBox: { alignItems: 'center', gap: spacing3.md, padding: spacing3.containerMargin },
  unavailableTitle: { ...typography3.headlineMd, fontSize: 18 },
  mutedText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
  listContent: { paddingHorizontal: spacing3.containerMargin, paddingBottom: spacing3.xl },
  headerBox: { gap: spacing3.md, marginBottom: spacing3.md },
  error: { ...typography3.bodyMd, color: colors3.error, textAlign: 'center' },

  profileCard: { alignItems: 'center', gap: spacing3.md },
  name: { ...typography3.headlineMd, fontSize: 22, textAlign: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.lg },
  stat: { alignItems: 'center', minWidth: 64 },
  statDivider: { width: 1, height: 32, backgroundColor: colors3.outlineVariant },
  statNumber: { ...typography3.headlineMd, fontSize: 18, color: colors3.primary },
  statLabel: { ...typography3.labelSm, fontSize: 10, marginTop: 2 },

  // Os graficos de atividade foram feitos para fundo escuro (colors2): ficam num bloco escuro para manter o contraste no tema claro.
  activityBox: { gap: spacing3.sm, padding: spacing3.md, borderRadius: radius3.xl, backgroundColor: colors2.surfaceContainer },
  activityTitle: { ...typography3.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },
});
