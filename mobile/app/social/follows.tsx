import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { EmptyFollowingState } from '@/components/EmptyFollowingState';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { UserListRow } from '@/components/UserListRow';
import { useAuth } from '@/context/AuthContext';
import {
  UserBrief,
  UserSearchResult,
  followUser,
  getSuggestions,
  listFollowers,
  listFollowing,
  unfollowUser,
} from '@/services/social';
import { shareProfile } from '@/utils/invite';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

type Tab = 'followers' | 'following' | 'suggestions';

const TABS: { value: Tab; label: string }[] = [
  { value: 'followers', label: 'Seguidores' },
  { value: 'following', label: 'Seguindo' },
  { value: 'suggestions', label: 'Sugestoes' },
];

function isTab(value: unknown): value is Tab {
  return TABS.some((t) => t.value === value);
}

/**
 * Seguidores / Seguindo / Sugestoes do proprio usuario -- ponto de entrada
 * a partir do Perfil (contadores clicaveis). Param opcional `tab` abre
 * direto numa aba (usado pelo botao "Revisar sugestoes" do estado vazio
 * do Feed, ver EmptyFollowingState).
 */
export default function FollowsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(isTab(tab) ? tab : 'followers');

  const [followers, setFollowers] = useState<UserBrief[]>([]);
  const [following, setFollowing] = useState<UserBrief[]>([]);
  const [suggestions, setSuggestions] = useState<UserSearchResult[]>([]);
  const [myFollowingIds, setMyFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [followersData, followingData, suggestionsData] = await Promise.all([
        listFollowers(user.id),
        listFollowing(user.id),
        getSuggestions(),
      ]);
      setFollowers(followersData);
      setFollowing(followingData);
      setSuggestions(suggestionsData);
      setMyFollowingIds(new Set(followingData.map((u) => u.id)));
    } catch {
      setError('Nao foi possivel carregar essa lista.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const handleToggleFollow = async (userId: string, isFollowing: boolean) => {
    setBusy((prev) => ({ ...prev, [userId]: true }));
    try {
      if (isFollowing) await unfollowUser(userId);
      else await followUser(userId);
      await fetchAll();
    } catch {
      // Silencioso -- lista so nao atualiza, usuario pode tentar de novo.
    } finally {
      setBusy((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const renderList = () => {
    if (loading) return <ActivityIndicator color={colors2.violet} style={styles.loading} />;
    if (error) return <Text style={styles.error}>{error}</Text>;

    if (activeTab === 'followers') {
      if (followers.length === 0) {
        return (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="person-add-outline" size={28} color={colors2.onSurfaceVariant} />
            </View>
            <Text style={styles.emptyTitle}>Nenhum seguidor</Text>
            <Text style={styles.emptySubtitle}>
              Voce pode compartilhar seu perfil com outras pessoas para comecar.
            </Text>
            <Button2 label="Compartilhar perfil" onPress={() => shareProfile(user?.name ?? 'eu')} />
          </View>
        );
      }
      return (
        <FlatList
          data={followers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isFollowing = myFollowingIds.has(item.id);
            return (
              <UserListRow
                name={item.name}
                actionLabel={isFollowing ? 'Seguindo' : 'Seguir de volta'}
                actionActive={isFollowing}
                actionLoading={!!busy[item.id]}
                onPressAction={() => handleToggleFollow(item.id, isFollowing)}
                onPress={() => router.push({ pathname: '/social/[userId]', params: { userId: item.id } })}
              />
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing2.md }} />}
        />
      );
    }

    if (activeTab === 'following') {
      if (following.length === 0) return <EmptyFollowingState />;
      return (
        <FlatList
          data={following}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <UserListRow
              name={item.name}
              actionLabel="Seguindo"
              actionActive
              actionLoading={!!busy[item.id]}
              onPressAction={() => handleToggleFollow(item.id, true)}
              onPress={() => router.push({ pathname: '/social/[userId]', params: { userId: item.id } })}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing2.md }} />}
        />
      );
    }

    // suggestions
    if (suggestions.length === 0) {
      return (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="sparkles-outline" size={28} color={colors2.onSurfaceVariant} />
          </View>
          <Text style={styles.emptyTitle}>Sem sugestoes</Text>
          <Text style={styles.emptySubtitle}>
            Nao ha sugestoes de amigos neste momento. Volte mais tarde para verificar se ha novas sugestoes.
          </Text>
        </View>
      );
    }
    return (
      <FlatList
        data={suggestions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <UserListRow
            name={item.name}
            actionLabel={item.is_following ? 'Seguindo' : 'Seguir'}
            actionActive={item.is_following}
            actionLoading={!!busy[item.id]}
            onPressAction={() => handleToggleFollow(item.id, item.is_following)}
            onPress={() => router.push({ pathname: '/social/[userId]', params: { userId: item.id } })}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing2.md }} />}
      />
    );
  };

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.tabRow}>
        {TABS.map((t) => {
          const selected = t.value === activeTab;
          return (
            <Pressable
              key={t.value}
              onPress={() => setActiveTab(t.value)}
              style={[styles.tabPill, selected && styles.tabPillSelected]}
            >
              <Text style={[styles.tabPillText, selected && styles.tabPillTextSelected]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.content}>{renderList()}</View>
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

  tabRow: { flexDirection: 'row', gap: spacing2.sm, paddingHorizontal: spacing2.containerMargin, marginBottom: spacing2.md },
  tabPill: {
    flex: 1,
    paddingVertical: spacing2.sm + 2,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    alignItems: 'center',
  },
  tabPillSelected: {
    backgroundColor: colors2.violet,
    borderColor: colors2.violet,
  },
  tabPillText: { ...typography2.labelCaps, textTransform: 'none', fontSize: 12 },
  tabPillTextSelected: { color: colors2.white, fontWeight: '700' },

  content: { flex: 1, paddingHorizontal: spacing2.containerMargin },
  listContent: { paddingBottom: spacing2.xl },
  loading: { marginTop: spacing2.xl },
  error: { color: colors2.danger, textAlign: 'center', marginTop: spacing2.xl },

  empty: { alignItems: 'center', justifyContent: 'center', gap: spacing2.sm, paddingVertical: spacing2.xl },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing2.xs,
  },
  emptyTitle: { ...typography2.headlineMd, fontSize: 17, textAlign: 'center' },
  emptySubtitle: {
    ...typography2.bodyMd,
    color: colors2.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: spacing2.sm,
    maxWidth: 260,
  },
});
