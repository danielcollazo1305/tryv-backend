import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { classifyModerationError, listBlockedUsers, unblockUser } from '@/services/moderation';
import type { UserBrief } from '@/services/social';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

/**
 * Usuarios bloqueados (GET /users/me/blocks): avatar (ja filtrado pelo backend pela regra de menores; nunca montamos URL
 * de avatar aqui), nome e Desbloquear. Voltar ao Social recarrega o feed sozinho (o Feed recarrega ao ganhar foco e as
 * outras abas ficam marcadas como desatualizadas, ver FeedView/RankingView).
 * Obs.: o app ainda nao tem @usuario (o backend nao tem username), entao so o nome aparece.
 */
export default function BlockedUsersScreen() {
  const [items, setItems] = useState<UserBrief[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchBlocked = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listBlockedUsers());
    } catch (err) {
      setError(classifyModerationError(err, 'Não foi possível carregar os usuários bloqueados.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBlocked();
    }, [fetchBlocked])
  );

  const handleUnblock = async (user: UserBrief) => {
    setBusyId(user.id);
    try {
      await unblockUser(user.id);
      setItems((prev) => (prev ? prev.filter((u) => u.id !== user.id) : prev));
    } catch (err) {
      Alert.alert('Não foi possível desbloquear', classifyModerationError(err, 'Tente novamente.').message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Usuários bloqueados</Text>
        <View style={styles.headerButton} />
      </View>

      {loading && !items ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors3.primary} />
        </View>
      ) : error && !items ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Button3 label="Tentar de novo" onPress={fetchBlocked} />
        </View>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing3.sm }} />}
          renderItem={({ item }) => (
            <GlassCard variant="card" style={styles.row} padding={spacing3.md}>
              <Avatar
                initials={getInitials(item.name)}
                imageUrl={item.avatar_url}
                thumbUrl={item.avatar_thumb_url}
                size={44}
              />
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Pressable
                onPress={() => handleUnblock(item)}
                disabled={busyId === item.id}
                style={[styles.unblockButton, busyId === item.id && styles.unblockButtonBusy]}
                accessibilityRole="button"
                accessibilityLabel={`Desbloquear ${item.name}`}
              >
                {busyId === item.id ? (
                  <ActivityIndicator size="small" color={colors3.primary} />
                ) : (
                  <Text style={styles.unblockText}>Desbloquear</Text>
                )}
              </Pressable>
            </GlassCard>
          )}
          ListHeaderComponent={!!error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={32} color={colors3.onSurfaceVariant} />
              <Text style={styles.emptyText}>Você não bloqueou ninguém.</Text>
            </View>
          }
        />
      )}
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
  headerButton: { width: 44, height: 44, justifyContent: 'center' },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing3.md, padding: spacing3.containerMargin },
  error: { color: colors3.error, textAlign: 'center' },
  listContent: { padding: spacing3.containerMargin, paddingTop: 0, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  name: { ...typography3.bodyMd, fontWeight: '700', flex: 1 },
  unblockButton: {
    minHeight: 44,
    minWidth: 104,
    paddingHorizontal: spacing3.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius3.pill,
    borderWidth: 1,
    borderColor: 'rgba(107, 56, 212, 0.3)',
  },
  unblockButtonBusy: { opacity: 0.6 },
  unblockText: { ...typography3.labelSm, fontSize: 13, textTransform: 'none', color: colors3.primary, fontFamily: 'Inter_700Bold' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing3.xl, gap: spacing3.sm },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
});
