import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Clipboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, avatarRadius } from '@/components/Avatar';
import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { SquadMe, createSquad, deleteSquad, getMySquad, joinSquad, leaveSquad } from '@/services/squads';
import { shareSquadInvite } from '@/utils/invite';
import { getInitials } from '@/utils/text';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_HEIGHT } from '@/app/(tabs)/_layout';

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

interface AvatarStackMember {
  id: string;
  name: string;
  avatarUrl?: string | null;
  avatarThumbUrl?: string | null;
}

function AvatarStack({ members, totalMembers }: { members: AvatarStackMember[]; totalMembers: number }) {
  const visible = members.slice(0, AVATAR_STACK_MAX_VISIBLE);
  const remaining = totalMembers - visible.length;

  return (
    <View style={styles.avatarStack}>
      {visible.map((member, index) => (
        <Avatar
          key={member.id}
          initials={getInitials(member.name)}
          imageUrl={member.avatarUrl}
          thumbUrl={member.avatarThumbUrl}
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

interface ClubsViewProps {
  /**
   * Aba visivel no Social. A view fica montada depois da 1a visita, entao o recarregamento "ao focar a tela" so roda se
   * ela estiver ativa; se o Social ganhou foco com ela escondida, recarrega quando voltar a ser a ativa.
   */
  active?: boolean;
  /** Avisa o Social que o squad do usuario mudou (criar, entrar, sair, deletar), para a aba Ranking se atualizar. */
  onSquadChanged?: () => void;
}

/**
 * Conteudo da aba "Clubes" do Social: gestao do squad do usuario (meu squad com membros, criar, entrar por codigo de
 * convite, sair e deletar). O ranking de squads, as estatisticas e o territorio ficam no Ranking. Sem cabecalho.
 */
export function ClubsView({ active = true, onSquadChanged }: ClubsViewProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [mySquad, setMySquad] = useState<SquadMe | null>(null);
  const [loadingMySquad, setLoadingMySquad] = useState(true);
  const [errorMySquad, setErrorMySquad] = useState<string | null>(null);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [squadNameInput, setSquadNameInput] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [squadActionSubmitting, setSquadActionSubmitting] = useState(false);
  const [squadActionError, setSquadActionError] = useState<string | null>(null);

  // "Copiado" some sozinho depois de 2 s.
  const [codeCopied, setCodeCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    []
  );

  // `silent` = refetch por cima de dado ja exibido: nao liga o spinner (que trocaria o conteudo da tela).
  const fetchMySquad = useCallback(async (silent = false) => {
    if (!silent) setLoadingMySquad(true);
    setErrorMySquad(null);
    try {
      setMySquad(await getMySquad());
    } catch (err) {
      setErrorMySquad(getApiErrorMessage(err, 'Não foi possível carregar seu squad.'));
    } finally {
      setLoadingMySquad(false);
    }
  }, []);

  const activeRef = useRef(active);
  activeRef.current = active;
  const staleRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (activeRef.current) fetchMySquad();
      else staleRef.current = true;
    }, [fetchMySquad])
  );

  useEffect(() => {
    if (active && staleRef.current) {
      staleRef.current = false;
      fetchMySquad();
    }
  }, [active, fetchMySquad]);

  const squad = mySquad?.squad ?? null;
  const hasSquad = squad != null;
  const isSquadOwner = !!(hasSquad && user && squad!.created_by === user.id);

  // Copiar usa o Clipboard do proprio React Native (o projeto nao tem expo-clipboard instalado; ver review).
  function copyInviteCode() {
    if (!squad) return;
    Clipboard.setString(squad.invite_code);
    setCodeCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCodeCopied(false), 2000);
  }

  async function shareInviteCode() {
    if (!squad) return;
    try {
      await shareSquadInvite(squad.invite_code);
    } catch {
      // Folha de compartilhamento fechada/falhou: nada a fazer.
    }
  }

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
      const created = await createSquad(name);
      // A resposta do POST ja e o squad completo: atualiza o estado na hora, pra nunca piscar "Você
      // ainda joga solo" depois do sucesso. (Sem estado anterior nao ha level_info pra reaproveitar;
      // nesse caso o refetch abaixo preenche.)
      setMySquad((prev) => (prev ? { ...prev, squad: created } : prev));
      setErrorMySquad(null);
      setCreateModalVisible(false);
      // Meu squad re-buscado aqui; ranking, estatisticas, streaks e territorio (que dependem do squad) sao
      // re-buscados pela aba Ranking quando avisada.
      await fetchMySquad(true);
      onSquadChanged?.();
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
      onSquadChanged?.();
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
      onSquadChanged?.();
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
      onSquadChanged?.();
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
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + spacing3.lg },
        ]}
      >
        {loadingMySquad ? (
          <ActivityIndicator color={colors3.primary} style={styles.loading} />
        ) : errorMySquad ? (
          <Text style={styles.error}>{errorMySquad}</Text>
        ) : hasSquad ? (
          <GlassCard variant="glass" style={styles.userCard}>
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
                members={squad!.members.map((m) => ({
                  id: m.user_id,
                  name: m.name,
                  avatarUrl: m.avatar_url,
                  avatarThumbUrl: m.avatar_thumb_url,
                }))}
                totalMembers={squad!.member_count}
              />
            )}

            {/* Codigo de convite: a API o devolve a TODOS os membros (copiar nao da poder administrativo). */}
            <View style={styles.inviteBox}>
              <Text style={styles.inviteLabel}>Código de convite</Text>
              <Text
                style={styles.inviteCode}
                selectable
                accessibilityLabel={`Código de convite: ${squad!.invite_code.split('').join(' ')}`}
              >
                {squad!.invite_code}
              </Text>
              <View style={styles.inviteButtons}>
                <Pressable
                  onPress={copyInviteCode}
                  style={styles.inviteButton}
                  accessibilityRole="button"
                  accessibilityLabel={codeCopied ? 'Código copiado' : 'Copiar código de convite'}
                >
                  <Ionicons name={codeCopied ? 'checkmark' : 'copy-outline'} size={16} color={colors3.primary} />
                  <Text style={styles.inviteButtonText}>{codeCopied ? 'Copiado' : 'Copiar'}</Text>
                </Pressable>
                <Pressable
                  onPress={shareInviteCode}
                  style={styles.inviteButton}
                  accessibilityRole="button"
                  accessibilityLabel="Compartilhar código de convite"
                >
                  <Ionicons name="share-outline" size={16} color={colors3.primary} />
                  <Text style={styles.inviteButtonText}>Compartilhar</Text>
                </Pressable>
              </View>
            </View>

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

          </GlassCard>
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
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing3.containerMargin, paddingTop: spacing3.sm, gap: spacing3.md },
  loading: { marginVertical: spacing3.lg },
  error: { color: colors3.error, textAlign: 'center', marginVertical: spacing3.sm },
  userCard: { gap: spacing3.md },
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
  inviteBox: { gap: 2, paddingTop: spacing3.sm, borderTopWidth: 1, borderTopColor: colors3.outlineVariant },
  inviteLabel: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
  inviteCode: { fontFamily: 'Inter_800ExtraBold', fontSize: 24, letterSpacing: 5, color: colors3.onSurface },
  inviteButtons: { flexDirection: 'row', gap: spacing3.sm, marginTop: spacing3.sm },
  inviteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: radius3.pill,
    backgroundColor: 'rgba(107, 56, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(107, 56, 212, 0.25)',
  },
  inviteButtonText: { ...typography3.labelSm, fontSize: 13, textTransform: 'none', color: colors3.primary, fontFamily: 'Inter_700Bold' },
  squadActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: -spacing3.xs,
  },
  squadActionText: { ...typography3.labelSm, textTransform: 'none', color: colors3.error },
  avatarStack: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  avatarStackItem: { borderWidth: 2, borderColor: colors3.background },
  avatarStackMore: {
    width: AVATAR_STACK_SIZE,
    height: AVATAR_STACK_SIZE,
    borderRadius: avatarRadius(AVATAR_STACK_SIZE),
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
