import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { UserListRow } from '@/components/UserListRow';
import {
  DeviceContact,
  fetchDeviceContacts,
  getContactsPermissionStatus,
  requestContactsPermission,
} from '@/services/contacts';
import { MatchedContact, UserSearchResult, followUser, matchContacts, searchUsers, unfollowUser } from '@/services/social';
import { shareInvite } from '@/utils/invite';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

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
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Descobrir</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.content}>
        <Pressable style={styles.inviteRow} onPress={shareInvite}>
          <View style={styles.inviteIconWrap}>
            <Ionicons name="paper-plane-outline" size={18} color={colors2.violet} />
          </View>
          <Text style={styles.inviteText}>Convidar amigos</Text>
          <Ionicons name="chevron-forward" size={16} color={colors2.onSurfaceVariant} />
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
                  <Ionicons name="search" size={18} color={colors2.onSurfaceVariant} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Pesquisar"
                    placeholderTextColor={colors2.onSurfaceVariant}
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                  />
                  {searching && <ActivityIndicator size="small" color={colors2.violet} />}
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
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: spacing2.md }} />}
            ListEmptyComponent={
              !searching && query.trim() ? <Text style={styles.emptyText}>Nenhum usuario encontrado.</Text> : null
            }
          />
        ) : contactsState === 'checking' || contactsState === 'loading' ? (
          <ActivityIndicator color={colors2.violet} style={styles.contactsLoading} />
        ) : contactsState === 'explain' ? (
          <LiquiglassCard style={styles.explainCard}>
            <View style={styles.explainIconWrap}>
              <Ionicons name="people" size={24} color={colors2.violet} />
            </View>
            <Text style={styles.explainTitle}>Encontre amigos que ja usam o Tryv</Text>
            <Text style={styles.explainText}>
              O Tryv acessa sua agenda so pra comparar numeros de telefone com quem ja tem conta -- nenhum outro
              dado do seu contato (nome, foto, e-mail) e enviado.
            </Text>
            <Button2 label="Permitir acesso aos contatos" onPress={handleRequestPermission} />
          </LiquiglassCard>
        ) : contactsState === 'denied' ? (
          <LiquiglassCard style={styles.explainCard}>
            <View style={styles.explainIconWrap}>
              <Ionicons name="lock-closed-outline" size={24} color={colors2.onSurfaceVariant} />
            </View>
            <Text style={styles.explainTitle}>Acesso aos contatos negado</Text>
            <Text style={styles.explainText}>
              Voce pode permitir o acesso depois nas configuracoes do sistema, ou buscar pessoas pelo nome por
              enquanto.
            </Text>
            <Button2 label="Tentar novamente" onPress={handleRequestPermission} />
            <Pressable onPress={() => setActiveTab('search')} hitSlop={8} style={styles.explainLink}>
              <Text style={styles.explainLinkText}>Ir para Pesquisar</Text>
            </Pressable>
          </LiquiglassCard>
        ) : contactsState === 'error' ? (
          <LiquiglassCard style={styles.explainCard}>
            <Text style={styles.explainTitle}>Nao foi possivel ler seus contatos</Text>
            <Button2 label="Tentar novamente" onPress={loadContacts} />
          </LiquiglassCard>
        ) : contactsListData.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum contato com telefone encontrado na sua agenda.</Text>
        ) : (
          <FlatList
            data={contactsListData}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              if (item.type === 'matched-header') return <Text style={styles.sectionTitle}>Amigos no Tryv</Text>;
              if (item.type === 'unmatched-header')
                return <Text style={styles.sectionTitle}>Convide para o Tryv</Text>;
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
                />
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: spacing2.sm }} />}
          />
        )}
      </View>
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
  content: { flex: 1, paddingHorizontal: spacing2.containerMargin, gap: spacing2.md },

  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.sm,
    backgroundColor: colors2.surfaceContainerHigh,
    borderRadius: radius2.md,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    padding: spacing2.md,
  },
  inviteIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius2.sm,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteText: { ...typography2.bodyMd, fontWeight: '600', flex: 1 },

  tabRow: { flexDirection: 'row', gap: spacing2.sm },
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
  tabPillText: { ...typography2.labelCaps, textTransform: 'none' },
  tabPillTextSelected: { color: colors2.white, fontWeight: '700' },

  listContent: { paddingBottom: spacing2.xl, gap: spacing2.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.sm,
    backgroundColor: colors2.surfaceContainerHigh,
    borderRadius: radius2.pill,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    paddingHorizontal: spacing2.md,
    marginBottom: spacing2.sm,
  },
  searchInput: { flex: 1, paddingVertical: spacing2.sm + 4, color: colors2.onSurface, fontSize: 16 },
  error: { color: colors2.danger, textAlign: 'center' },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center', paddingVertical: spacing2.xl },

  contactsLoading: { marginTop: spacing2.xl },
  explainCard: { alignItems: 'center', gap: spacing2.sm, marginTop: spacing2.md },
  explainIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing2.xs,
  },
  explainTitle: { ...typography2.headlineMd, fontSize: 17, textAlign: 'center' },
  explainText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center', marginBottom: spacing2.sm },
  explainLink: { paddingVertical: spacing2.sm },
  explainLinkText: { ...typography2.bodyMd, color: colors2.primary, fontWeight: '700' },

  sectionTitle: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant, marginTop: spacing2.sm },
});
