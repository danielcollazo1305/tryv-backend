import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { TextField2 } from '@/components/TextField2';
import { useAuth } from '@/context/AuthContext';
import { useWorkoutSessionDraft } from '@/context/WorkoutSessionDraftContext';
import {
  canSubmitDeletion,
  classifyDeleteAccountError,
  clearLocalAccountData,
  deleteMyAccount,
  DELETE_CONFIRMATION_WORD,
  type DeleteAccountError,
} from '@/services/account';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/**
 * Excluir conta (Apple 5.1.1(v)), em duas etapas na mesma tela: aviso -> confirmacao (EXCLUIR + senha) -> Alert final ->
 * POST /users/me/delete. Erros aparecem na propria tela e a pessoa pode tentar de novo. O 401 de "Senha incorreta" NAO
 * desloga (ver services/account.ts); so outro 401 (sessao invalida) segue o fluxo normal de logout.
 */
export default function DeleteAccountScreen() {
  const { logout } = useAuth();
  const { setDraft } = useWorkoutSessionDraft();
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<DeleteAccountError | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const canSubmit = canSubmitDeletion(confirmation, password) && !submitting;

  const goBack = () => {
    if (submitting) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  // Conta apagada no servidor: sai da sessao pelo caminho normal do app (o guard de app/_layout.tsx leva ao login),
  // limpa o que ficou no aparelho e avisa. Nada aqui chama a API autenticada.
  const finishDeletion = async () => {
    setDraft(null);
    await logout();
    await clearLocalAccountData();
    setTimeout(() => {
      try {
        router.replace('/(auth)/login');
      } catch {
        // o guard de rotas ja leva ao login quando o token some
      }
    }, 0);
    Alert.alert('Conta excluída', 'Sua conta e seus dados foram apagados.');
  };

  const runDeletion = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await deleteMyAccount(password, confirmation);
    } catch (err) {
      const classified = classifyDeleteAccountError(err);
      inFlightRef.current = false;
      if (classified.kind === 'session_expired') {
        Alert.alert('Sessão expirada', classified.message);
        await logout();
        return;
      }
      if (mountedRef.current) {
        setSubmitting(false);
        if (classified.kind === 'wrong_password') setPassword('');
        setError(classified);
      }
      return;
    }
    try {
      await finishDeletion();
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleDelete = () => {
    if (!canSubmit) return;
    Alert.alert('Tem certeza?', 'Sua conta e seus dados serão apagados agora. Isso não pode ser desfeito.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => void runDeletion() },
    ]);
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          disabled={submitting}
          style={styles.headerButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Excluir conta</Text>
        <View style={styles.headerButton} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <GlassCard variant="card" padding={spacing3.lg} style={styles.card}>
              <View style={styles.iconWrap}>
                <Ionicons name="trash-outline" size={28} color={colors3.error} />
              </View>
              <Text style={styles.title}>Excluir conta</Text>
              <Text style={styles.paragraph}>
                Vamos apagar sua conta e seus dados: perfil, treinos, corridas, refeições, fotos, posts, comentários,
                curtidas e seguidores. Isso não pode ser desfeito.
              </Text>
              <Text style={styles.paragraph}>
                Se você tem assinatura Pro ou de um professor, ela será cancelada agora, sem reembolso do período já
                pago.
              </Text>
              <Text style={styles.paragraph}>
                Se você é professor ou nutricionista, encerre seus alunos e desafios antes; o app avisará se algo estiver
                pendente.
              </Text>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => setStep(2)}
                  style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Continuar para a confirmação da exclusão"
                >
                  <Text style={styles.dangerLabel}>Continuar</Text>
                </Pressable>
                <Button3 label="Cancelar" variant="secondary" onPress={goBack} accessibilityLabel="Cancelar e voltar" />
              </View>
            </GlassCard>
          ) : (
            <GlassCard variant="card" padding={spacing3.lg} style={styles.card}>
              <Text style={styles.title}>Confirmar exclusão</Text>
              <Text style={styles.paragraph}>Para confirmar, digite {DELETE_CONFIRMATION_WORD} e sua senha.</Text>

              <TextField2
                variant="light"
                label={`Digite ${DELETE_CONFIRMATION_WORD}`}
                value={confirmation}
                onChangeText={setConfirmation}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                editable={!submitting}
                placeholder={DELETE_CONFIRMATION_WORD}
                accessibilityLabel={`Campo de confirmação: digite ${DELETE_CONFIRMATION_WORD}`}
              />
              <TextField2
                variant="light"
                label="Sua senha"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                editable={!submitting}
                placeholder="********"
                accessibilityLabel="Campo da senha atual"
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                disabled={submitting}
                style={styles.toggle}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors3.onSurfaceVariant} />
                <Text style={styles.toggleText}>{showPassword ? 'Ocultar senha' : 'Mostrar senha'}</Text>
              </Pressable>

              {!!error && (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error.message}
                </Text>
              )}

              <View style={styles.actions}>
                <Pressable
                  onPress={handleDelete}
                  disabled={!canSubmit}
                  style={({ pressed }) => [styles.dangerButton, !canSubmit && styles.disabled, pressed && canSubmit && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Excluir minha conta"
                  accessibilityState={{ disabled: !canSubmit, busy: submitting }}
                >
                  {submitting ? <ActivityIndicator color={colors3.onPrimary} /> : <Text style={styles.dangerLabel}>Excluir minha conta</Text>}
                </Pressable>
                <Button3 label="Cancelar" variant="secondary" onPress={goBack} disabled={submitting} accessibilityLabel="Cancelar e voltar" />
              </View>
            </GlassCard>
          )}
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
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius3.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(186, 26, 26, 0.1)',
    alignSelf: 'center',
  },
  title: { ...typography3.headlineMd, textAlign: 'center' },
  paragraph: { ...typography3.bodyMd, color: colors3.onSurface },
  actions: { gap: spacing3.sm, marginTop: spacing3.sm },
  dangerButton: {
    minHeight: 52,
    borderRadius: radius3.xl,
    paddingHorizontal: spacing3.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors3.error,
  },
  dangerLabel: { ...typography3.labelMd, color: colors3.onPrimary },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs, minHeight: 44, alignSelf: 'flex-start' },
  toggleText: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  error: { ...typography3.bodyMd, color: colors3.error, textAlign: 'center' },
});
