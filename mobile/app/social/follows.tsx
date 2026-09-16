import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { EmptyFollowingState } from '@/components/EmptyFollowingState';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
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
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

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
 *
 * Migrado pro tema claro "prism-glass" nesta tarefa (ScreenBackground2 ->
 * ScreenBackground3, Button2 -> Button3, colors2 -> colors3) — so troca de
 * tokens/componentes visuais, nenhuma logica de seguir/deixar de seguir ou
 * navegacao foi alterada. UserListRow e EmptyFollowingState ja tinham
 * variant="light" pronto (de discover.tsx e do Feed, respectivamente) — so
 * passada a prop aqui, sem editar nenhum dos 2 componentes.
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
    if (loading) return <ActivityIndicator color={colors3.primary} style={styles.loading} />;
    if (error) return <Text style={styles.error}>{error}</Text>;

    if (activeTab === 'followers') {
      if (followers.length === 0) {
        return (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="person-add-outline" size={28} color={colors3.onSurfaceVariant} />
            </View>
            <Text style={styles.emptyTitle}>Nenhum seguidor</Text>
            <Text style={styles.emptySubtitle}>
              Voce pode compartilhar seu perfil com outras pessoas para comecar.
            </Text>
            <Button3 label="Compartilhar perfil" onPress={() => shareProfile(user?.name ?? 'eu')} />
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
                variant="light"
              />
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing3.md }} />}
        />
      );
    }

    if (activeTab === 'following') {
      if (following.length === 0) return <EmptyFollowingState variant="light" />;
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
              variant="light"
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing3.md }} />}
        />
      );
    }

    // suggestions
    if (suggestions.length === 0) {
      return (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="sparkles-outline" size={28} color={colors3.onSurfaceVariant} />
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
            variant="light"
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing3.md }} />}
      />
    );
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv Fit</Text>
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
  headerTitle: { ...typography3.headlineMd, fontSize: 18, color: colors3.primary, fontWeight: '800' },

  tabRow: { flexDirection: 'row', gap: spacing3.sm, paddingHorizontal: spacing3.containerMargin, marginBottom: spacing3.md },
  tabPill: {
    flex: 1,
    paddingVertical: spacing3.sm + 2,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    alignItems: 'center',
  },
  tabPillSelected: {
    backgroundColor: colors3.primary,
    borderColor: colors3.primary,
  },
  tabPillText: { ...typography3.labelSm, textTransform: 'none', fontSize: 12 },
  tabPillTextSelected: { color: colors3.onPrimary, fontWeight: '700' },

  content: { flex: 1, paddingHorizontal: spacing3.containerMargin },
  listContent: { paddingBottom: spacing3.xl },
  loading: { marginTop: spacing3.xl },
  error: { color: colors3.error, textAlign: 'center', marginTop: spacing3.xl },

  empty: { alignItems: 'center', justifyContent: 'center', gap: spacing3.sm, paddingVertical: spacing3.xl },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing3.xs,
  },
  emptyTitle: { ...typography3.headlineMd, fontSize: 17, textAlign: 'center' },
  emptySubtitle: {
    ...typography3.bodyMd,
    color: colors3.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: spacing3.sm,
    maxWidth: 260,
  },
});
