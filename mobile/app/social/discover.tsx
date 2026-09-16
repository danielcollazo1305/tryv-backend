import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { UserListRow } from '@/components/UserListRow';
import {
  DeviceContact,
  fetchDeviceContacts,
  getContactsPermissionStatus,
  requestContactsPermission,
} from '@/services/contacts';
import { MatchedContact, UserSearchResult, followUser, matchContacts, searchUsers, unfollowUser } from '@/services/social';
import { shareInvite } from '@/utils/invite';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

type Tab = 'search' | 'contacts';
type ContactsState = 'checking' | 'explain' | 'denied' | 'loading' | 'ready' | 'error';

type ContactsListItem =
  | { type: 'matched-header'; key: string }
  | { type: 'unmatched-header'; key: string }
  | { type: 'matched'; key: string; contact: MatchedContact }
  | { type: 'unmatched'; key: string; contact: DeviceContact };

/**
 * Tela "Descobrir" — nao existia nenhuma tela de busca/descoberta de
 * usuarios no projeto antes desta (confirmado por busca no codigo antes
 * de comecar). Duas abas (Pesquisar/Contatos) + entrada de "Convidar
 * amigos" acima delas.
 *
 * Migrado pro tema claro "prism-glass" nesta tarefa (ScreenBackground2 ->
 * ScreenBackground3, LiquiglassCard -> GlassCard, Button2 -> Button3,
 * colors2 -> colors3) — so troca de tokens/componentes visuais, nenhuma
 * logica de busca/permissao de contatos/seguir foi alterada. UserListRow
 * ganhou variant="light" (prop nova, padrao 'dark' preservado pra
 * social/follows.tsx, que ainda nao migrou).
 */
export default function DiscoverScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('search');

  // ---------- Pesquisar ----------
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    // Debounce de 400ms -- nao busca a cada tecla digitada.
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchUsers(trimmed);
        setSearchResults(results);
        setSearchError(null);
      } catch {
        setSearchError('Nao foi possivel buscar. Tente novamente.');
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleToggleFollowSearch = async (result: UserSearchResult) => {
    setFollowBusy((prev) => ({ ...prev, [result.id]: true }));
    try {
      if (result.is_following) await unfollowUser(result.id);
      else await followUser(result.id);
      setSearchResults((prev) =>
        prev.map((r) => (r.id === result.id ? { ...r, is_following: !r.is_following } : r))
      );
    } catch {
      // Silencioso: botao volta ao estado normal (sem mudar), usuario pode tentar de novo.
    } finally {
      setFollowBusy((prev) => ({ ...prev, [result.id]: false }));
    }
  };

  // ---------- Contatos ----------
  const [contactsState, setContactsState] = useState<ContactsState>('checking');
  const [matched, setMatched] = useState<MatchedContact[]>([]);
  const [unmatched, setUnmatched] = useState<DeviceContact[]>([]);
  const [matchedBusy, setMatchedBusy] = useState<Record<string, boolean>>({});

  const loadContacts = useCallback(async () => {
    setContactsState('loading');
    try {
      const deviceContacts = await fetchDeviceContacts();
      const matchResults = await matchContacts(
        deviceContacts.map((c) => ({ contact_ref: c.id, phone_numbers: c.phoneNumbers }))
      );
      const matchedRefs = new Set(matchResults.map((m) => m.contact_ref));
      setMatched(matchResults);
      setUnmatched(deviceContacts.filter((c) => !matchedRefs.has(c.id)));
      setContactsState('ready');
    } catch {
      setContactsState('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (activeTab !== 'contacts') return;
      let active = true;
      (async () => {
        const status = await getContactsPermissionStatus();
        if (!active) return;
        if (status === 'granted') {
          loadContacts();
        } else if (status === 'denied') {
          setContactsState('denied');
        } else {
          setContactsState('explain');
        }
      })();
      return () => {
        active = false;
      };
      // So reavalia quando a aba Contatos ganha foco -- nao precisa
      // refazer a cada render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab])
  );

  const handleRequestPermission = async () => {
    const granted = await requestContactsPermission();
    if (granted) loadContacts();
    else setContactsState('denied');
  };

  const handleToggleFollowMatched = async (contact: MatchedContact) => {
    setMatchedBusy((prev) => ({ ...prev, [contact.id]: true }));
    try {
      if (contact.is_following) await unfollowUser(contact.id);
      else await followUser(contact.id);
      setMatched((prev) =>
        prev.map((m) => (m.id === contact.id ? { ...m, is_following: !m.is_following } : m))
      );
    } catch {
      // Silencioso, mesmo padrao da busca.
    } finally {
      setMatchedBusy((prev) => ({ ...prev, [contact.id]: false }));
    }
  };

  const contactsListData: ContactsListItem[] = [
    ...(matched.length > 0 ? [{ type: 'matched-header' as const, key: 'matched-header' }] : []),
    ...matched.map((contact) => ({ type: 'matched' as const, key: `matched-${contact.id}`, contact })),
    ...(unmatched.length > 0 ? [{ type: 'unmatched-header' as const, key: 'unmatched-header' }] : []),
    ...unmatched.map((contact) => ({ type: 'unmatched' as const, key: `unmatched-${contact.id}`, contact })),
  ];

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Descobrir</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.content}>
        <Pressable style={styles.inviteRow} onPress={shareInvite}>
          <View style={styles.inviteIconWrap}>
            <Ionicons name="paper-plane-outline" size={18} color={colors3.primary} />
          </View>
          <Text style={styles.inviteText}>Convidar amigos</Text>
          <Ionicons name="chevron-forward" size={16} color={colors3.onSurfaceVariant} />
        </Pressable>

        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabPill, activeTab === 'search' && styles.tabPillSelected]}
            onPress={() => setActiveTab('search')}
          >
            <Text style={[styles.tabPillText, activeTab === 'search' && styles.tabPillTextSelected]}>
              Pesquisar
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabPill, activeTab === 'contacts' && styles.tabPillSelected]}
            onPress={() => setActiveTab('contacts')}
          >
            <Text style={[styles.tabPillText, activeTab === 'contacts' && styles.tabPillTextSelected]}>
              Contatos
            </Text>
          </Pressable>
        </View>

        {activeTab === 'search' ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color={colors3.onSurfaceVariant} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Pesquisar"
                    placeholderTextColor={colors3.onSurfaceVariant}
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                  />
                  {searching && <ActivityIndicator size="small" color={colors3.primary} />}
                </View>
                {!!searchError && <Text style={styles.error}>{searchError}</Text>}
              </>
            }
            renderItem={({ item }) => (
              <UserListRow
                name={item.name}
                actionLabel={item.is_following ? 'Seguindo' : 'Seguir'}
                actionActive={item.is_following}
                actionLoading={!!followBusy[item.id]}
                onPressAction={() => handleToggleFollowSearch(item)}
                onPress={() => router.push({ pathname: '/social/[userId]', params: { userId: item.id } })}
                variant="light"
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: spacing3.md }} />}
            ListEmptyComponent={
              !searching && query.trim() ? <Text style={styles.emptyText}>Nenhum usuario encontrado.</Text> : null
            }
          />
        ) : contactsState === 'checking' || contactsState === 'loading' ? (
          <ActivityIndicator color={colors3.primary} style={styles.contactsLoading} />
        ) : contactsState === 'explain' ? (
          <GlassCard variant="card" style={styles.explainCard}>
            <View style={styles.explainIconWrap}>
              <Ionicons name="people" size={24} color={colors3.primary} />
            </View>
            <Text style={styles.explainTitle}>Encontre amigos que ja usam o Tryv Fit</Text>
            <Text style={styles.explainText}>
              O Tryv Fit acessa sua agenda so pra comparar numeros de telefone com quem ja tem conta -- nenhum outro
              dado do seu contato (nome, foto, e-mail) e enviado.
            </Text>
            <Button3 label="Permitir acesso aos contatos" onPress={handleRequestPermission} />
          </GlassCard>
        ) : contactsState === 'denied' ? (
          <GlassCard variant="card" style={styles.explainCard}>
            <View style={styles.explainIconWrap}>
              <Ionicons name="lock-closed-outline" size={24} color={colors3.onSurfaceVariant} />
            </View>
            <Text style={styles.explainTitle}>Acesso aos contatos negado</Text>
            <Text style={styles.explainText}>
              Voce pode permitir o acesso depois nas configuracoes do sistema, ou buscar pessoas pelo nome por
              enquanto.
            </Text>
            <Button3 label="Tentar novamente" onPress={handleRequestPermission} />
            <Pressable onPress={() => setActiveTab('search')} hitSlop={8} style={styles.explainLink}>
              <Text style={styles.explainLinkText}>Ir para Pesquisar</Text>
            </Pressable>
          </GlassCard>
        ) : contactsState === 'error' ? (
          <GlassCard variant="card" style={styles.explainCard}>
            <Text style={styles.explainTitle}>Nao foi possivel ler seus contatos</Text>
            <Button3 label="Tentar novamente" onPress={loadContacts} />
          </GlassCard>
        ) : contactsListData.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum contato com telefone encontrado na sua agenda.</Text>
        ) : (
          <FlatList
            data={contactsListData}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              if (item.type === 'matched-header') return <Text style={styles.sectionTitle}>Amigos no Tryv Fit</Text>;
              if (item.type === 'unmatched-header')
                return <Text style={styles.sectionTitle}>Convide para o Tryv Fit</Text>;
              if (item.type === 'matched') {
                const contact = item.contact;
                return (
                  <UserListRow
                    name={contact.name}
                    actionLabel={contact.is_following ? 'Seguindo' : 'Seguir'}
                    actionActive={contact.is_following}
                    actionLoading={!!matchedBusy[contact.id]}
                    onPressAction={() => handleToggleFollowMatched(contact)}
                    onPress={() => router.push({ pathname: '/social/[userId]', params: { userId: contact.id } })}
                    variant="light"
                  />
                );
              }
              const contact = item.contact;
              return (
                <UserListRow
                  name={contact.name}
                  subtitle={contact.phoneNumbers[0]}
                  actionLabel="Convidar"
                  onPressAction={shareInvite}
                  variant="light"
                />
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: spacing3.sm }} />}
          />
        )}
      </View>
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
  content: { flex: 1, paddingHorizontal: spacing3.containerMargin, gap: spacing3.md },

  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    backgroundColor: colors3.surfaceContainerHigh,
    borderRadius: radius3.md,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    padding: spacing3.md,
  },
  inviteIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius3.sm,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteText: { ...typography3.bodyMd, fontWeight: '600', flex: 1 },

  tabRow: { flexDirection: 'row', gap: spacing3.sm },
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
  tabPillText: { ...typography3.labelSm, textTransform: 'none' },
  tabPillTextSelected: { color: colors3.onPrimary, fontWeight: '700' },

  listContent: { paddingBottom: spacing3.xl, gap: spacing3.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    backgroundColor: colors3.surfaceContainerHigh,
    borderRadius: radius3.pill,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    paddingHorizontal: spacing3.md,
    marginBottom: spacing3.sm,
  },
  searchInput: { flex: 1, paddingVertical: spacing3.sm + 4, color: colors3.onSurface, fontSize: 16 },
  error: { color: colors3.error, textAlign: 'center' },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center', paddingVertical: spacing3.xl },

  contactsLoading: { marginTop: spacing3.xl },
  explainCard: { alignItems: 'center', gap: spacing3.sm, marginTop: spacing3.md },
  explainIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius3.pill,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing3.xs,
  },
  explainTitle: { ...typography3.headlineMd, fontSize: 17, textAlign: 'center' },
  explainText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center', marginBottom: spacing3.sm },
  explainLink: { paddingVertical: spacing3.sm },
  explainLinkText: { ...typography3.bodyMd, color: colors3.primary, fontWeight: '700' },

  sectionTitle: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, marginTop: spacing3.sm },
});
