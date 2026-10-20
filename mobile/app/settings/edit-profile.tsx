import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { TextField2 } from '@/components/TextField2';
import { useAuth } from '@/context/AuthContext';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { getContentFilterMessage } from '@/services/contentFilter';
import {
  BIO_MAX,
  LINK_MAX,
  MINOR_NOTICE,
  USERNAME_CHANGE_CONFIRM_MESSAGE,
  USERNAME_CHANGE_CONFIRM_TITLE,
  USERNAME_FIRST_CONFIRM_MESSAGE,
  USERNAME_FIRST_CONFIRM_TITLE,
  USERNAME_MAX,
  USERNAME_RULES_TEXT,
  USERNAME_STATUS_TEXT,
  UsernameStatus,
  availabilityFromResponse,
  availabilityPlan,
  buildProfilePayload,
  classifyProfileUpdateError,
  computeSaveState,
  usernameConfirmKind,
  normalizeUsernameInput,
  pausedMessage,
  shouldShowMinorNotice,
  usernameLockDays,
  usernameLockText,
  validateUsernameFormat,
  ProfileUpdateError,
} from '@/services/profileEdit';
import { checkUsernameAvailable, updateMyProfile } from '@/services/user';

const DEBOUNCE_MS = 500;

/**
 * Editar perfil (E8): @usuario, bio e link. O servidor e a fonte da verdade (reservados, filtro de linguagem, @ em uso, troca a cada
 * 30 dias); aqui so se valida o formato. A logica (validacoes, estado do Salvar, traducao de erros) mora em services/profileEdit.ts.
 */
export default function EditProfileScreen() {
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [link, setLink] = useState(user?.link ?? '');
  const [status, setStatus] = useState<UsernameStatus>('same');
  const [pausedSeconds, setPausedSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<ProfileUpdateError | null>(null);
  const inFlightRef = useRef(false);
  const checkSeqRef = useRef(0);
  const pausedUntilRef = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  const lockDays = usernameLockDays(user?.username_change_wait_days);
  const usernameLocked = lockDays > 0 && !!user?.username;
  const current = { username: user?.username ?? null, bio: user?.bio ?? null, link: user?.link ?? null };
  const draft = { username, bio, link };

  // Disponibilidade do @usuario: so se o formato for valido e diferente do atual; com espera de ~500 ms depois da ultima tecla, ignorando
  // respostas antigas; um 429 pausa as consultas pelo Retry-After (e so volta a consultar depois).
  useEffect(() => {
    if (usernameLocked) {
      setStatus('same');
      return;
    }
    const plan = availabilityPlan(username, current.username);
    if (plan !== 'check') {
      checkSeqRef.current += 1;
      setStatus(plan === 'same' ? 'same' : plan === 'invalid' ? 'invalid' : 'idle');
      return;
    }
    const seq = ++checkSeqRef.current;
    setStatus('checking');
    const wait = Math.max(DEBOUNCE_MS, pausedUntilRef.current - Date.now());
    const timer = setTimeout(async () => {
      let result: { available: boolean } | null = null;
      let error: unknown;
      try {
        result = await checkUsernameAvailable(username);
      } catch (err) {
        error = err;
      }
      if (seq !== checkSeqRef.current) return;
      const next = availabilityFromResponse(result, error);
      if (next.status === 'paused') {
        const seconds = next.retryAfterSeconds ?? 30;
        pausedUntilRef.current = Date.now() + seconds * 1000;
        setPausedSeconds(seconds);
        setStatus('paused');
        // tenta de novo sozinho quando a pausa acabar (se o texto continuar o mesmo)
        setTimeout(() => {
          if (seq === checkSeqRef.current) setRetryTick((t) => t + 1);
        }, seconds * 1000);
        return;
      }
      setStatus(next.status);
    }, wait);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, usernameLocked, retryTick]);

  const saveState = computeSaveState(current, draft, { saving, usernameStatus: status, usernameLocked });

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, []);

  const performSave = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSaving(true);
    setServerError(null);
    try {
      await updateMyProfile(buildProfilePayload(current, draft));
      await refreshUser();
      goBack();
    } catch (err) {
      const failure = classifyProfileUpdateError(err, getContentFilterMessage(err));
      setServerError(failure);
      if (failure.status === 409) setStatus('taken');
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!saveState.canSave) return;
    // Confirma ANTES de salvar o @usuario: tanto a troca quanto a PRIMEIRA definicao iniciam o intervalo de 30 dias.
    const confirmKind = usernameConfirmKind(current.username, username, usernameLocked);
    if (confirmKind) {
      const first = confirmKind === 'first';
      Alert.alert(
        first ? USERNAME_FIRST_CONFIRM_TITLE : USERNAME_CHANGE_CONFIRM_TITLE,
        first ? USERNAME_FIRST_CONFIRM_MESSAGE : USERNAME_CHANGE_CONFIRM_MESSAGE,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: first ? 'Definir e salvar' : 'Trocar e salvar', onPress: () => void performSave() },
        ]
      );
      return;
    }
    void performSave();
  };

  const usernameMessage =
    serverError?.field === 'username'
      ? serverError.message
      : usernameLocked
        ? null
        : status === 'invalid'
          ? validateUsernameFormat(username)
          : status === 'paused'
            ? pausedMessage(pausedSeconds)
            : null;
  const usernameHint = usernameLocked ? usernameLockText(lockDays) : usernameMessage ? null : USERNAME_STATUS_TEXT[status];
  const bioError = serverError?.field === 'bio' ? serverError.message : saveState.bioError;
  const linkError = serverError?.field === 'link' ? serverError.message : saveState.linkError;
  const showMinor = shouldShowMinorNotice(user?.date_of_birth);

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={goBack} disabled={saving} style={styles.headerButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Editar perfil
        </Text>
        <View style={styles.headerButton} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <GlassCard variant="card" padding={spacing3.lg} style={styles.card}>
            {/* @usuario */}
            <View>
              <Text style={styles.label}>@usuário</Text>
              <View style={[styles.usernameRow, usernameLocked && styles.usernameRowLocked, !!usernameMessage && styles.usernameRowError]}>
                <Text style={styles.prefix}>@</Text>
                <TextInput
                  style={styles.usernameInput}
                  value={username}
                  onChangeText={(t) => {
                    setUsername(normalizeUsernameInput(t));
                    if (serverError?.field === 'username') setServerError(null);
                  }}
                  editable={!usernameLocked && !saving}
                  maxLength={USERNAME_MAX}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="seu.usuario"
                  placeholderTextColor={colors3.onSurfaceVariant}
                  accessibilityLabel="@usuário"
                  accessibilityHint={usernameLocked ? usernameLockText(lockDays) : USERNAME_RULES_TEXT}
                />
                <Text style={styles.counter}>
                  {username.length}/{USERNAME_MAX}
                </Text>
              </View>
              {!!usernameMessage && (
                <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
                  {usernameMessage}
                </Text>
              )}
              {!!usernameHint && (
                <Text
                  style={[styles.hint, status === 'available' && !usernameLocked && styles.hintOk, status === 'taken' && styles.hintBad]}
                  accessibilityLiveRegion="polite"
                >
                  {usernameHint}
                </Text>
              )}
              <Text style={styles.rules}>{USERNAME_RULES_TEXT}</Text>
            </View>

            {/* Bio */}
            <View>
              <TextField2
                variant="light"
                label="Bio"
                value={bio}
                onChangeText={(t) => {
                  setBio(t);
                  if (serverError?.field === 'bio') setServerError(null);
                }}
                maxLength={BIO_MAX}
                multiline
                editable={!saving}
                placeholder="Conte um pouco sobre você"
                style={styles.bioInput}
                error={bioError ?? undefined}
                accessibilityLabel="Bio"
              />
              <Text style={styles.counterRight}>
                {bio.length}/{BIO_MAX}
              </Text>
            </View>

            {/* Link */}
            <View>
              <TextField2
                variant="light"
                label="Link"
                value={link}
                onChangeText={(t) => {
                  setLink(t.trim());
                  if (serverError?.field === 'link') setServerError(null);
                }}
                maxLength={LINK_MAX}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!saving}
                placeholder="https://"
                error={linkError ?? undefined}
                accessibilityLabel="Link"
              />
              <Text style={styles.counterRight}>
                {link.length}/{LINK_MAX}
              </Text>
            </View>

            {showMinor && <Text style={styles.notice}>{MINOR_NOTICE}</Text>}

            {serverError?.field === 'general' && (
              <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
                {serverError.message}
              </Text>
            )}

            <Button3 label="Salvar" onPress={handleSave} loading={saving} disabled={!saveState.canSave} accessibilityLabel="Salvar o perfil" />
            <Button3 label="Cancelar" variant="secondary" onPress={goBack} disabled={saving} accessibilityLabel="Cancelar e voltar" />
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
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
  content: { padding: spacing3.containerMargin, paddingTop: 0, flexGrow: 1 },
  card: { gap: spacing3.md },
  label: { ...typography3.labelSm, textTransform: 'none', marginBottom: spacing3.xs },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors3.surfaceContainer,
    borderRadius: radius3.md,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    paddingHorizontal: spacing3.md,
  },
  usernameRowLocked: { opacity: 0.6 },
  usernameRowError: { borderColor: colors3.error },
  prefix: { ...typography3.bodyMd, fontSize: 16, color: colors3.onSurfaceVariant, marginRight: 2 },
  usernameInput: {
    flex: 1,
    paddingVertical: spacing3.sm + 4,
    color: colors3.onSurface,
    fontSize: 16,
    fontFamily: typography3.bodyMd.fontFamily,
  },
  counter: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, marginLeft: spacing3.sm },
  counterRight: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, textAlign: 'right', marginTop: -spacing3.sm },
  hint: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, marginTop: spacing3.xs },
  hintOk: { color: '#15803d' },
  hintBad: { color: colors3.error },
  rules: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, marginTop: spacing3.xs },
  error: { ...typography3.labelSm, textTransform: 'none', color: colors3.error, marginTop: spacing3.xs },
  bioInput: { minHeight: 90, maxHeight: 160, textAlignVertical: 'top' },
  notice: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
});
