import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { TextField2 } from '@/components/TextField2';
import { getOnboardingTotalSteps } from '@/constants/onboardingSteps';
import { useRegisterDraft } from '@/context/RegisterDraftContext';
import { colors2, spacing2, typography2 } from '@/constants/theme';

/**
 * Passo 1 do cadastro (Conta) — onboarding expandido, agora 6 ou 7 passos
 * no total (ver getOnboardingTotalSteps). O layout liquiglass (logo,
 * progress bar, campos) segue o mesmo padrao dos outros passos, aplicado
 * aos campos que ja existiam aqui (nome/email/senha/peso).
 *
 * Nao chama register() ainda — so valida e guarda no RegisterDraftContext.
 * A chamada real de cadastro (register + updateProfile + createWeightLog)
 * acontece no ultimo passo (register-goal.tsx), depois que altura/objetivo
 * tambem forem coletados. Ver esse arquivo pro fluxo completo.
 */
export default function RegisterScreen() {
  const { draft, updateDraft } = useRegisterDraft();
  const [name, setName] = useState(draft.name);
  const [email, setEmail] = useState(draft.email);
  const [password, setPassword] = useState(draft.password);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [weight, setWeight] = useState(draft.weight);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = () => {
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError('Preencha todos os campos.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas nao coincidem.');
      return;
    }
    // Peso deixou de ser opcional (onboarding expandido) -- a meta
    // calorica sugerida (passo novo mais a frente) perde muito sentido
    // sem ele, e ele ja e a base de varios calculos daqui pra frente.
    const weightValue = Number(weight.replace(',', '.'));
    if (!weight.trim() || Number.isNaN(weightValue) || weightValue <= 0) {
      setError('Informe seu peso atual.');
      return;
    }
    updateDraft({ name: name.trim(), email: email.trim(), password, weight });
    router.push('/(auth)/register-body');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv</Text>
          <Text style={styles.title}>Criar sua conta</Text>
          <Text style={styles.subtitle}>Vamos comecar sua jornada</Text>

          <View style={styles.progressWrap}>
            <ProgressSteps2 current={1} total={getOnboardingTotalSteps(draft)} label="Conta" />
          </View>
        </View>

        <TextField2 label="Nome" value={name} onChangeText={setName} placeholder="Seu nome" />
        <TextField2
          label="E-mail"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="voce@email.com"
        />
        <TextField2
          label="Senha"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="********"
        />
        <TextField2
          label="Confirmar senha"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="********"
        />
        <TextField2
          label="Peso atual em kg"
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
          placeholder="Ex: 78.5"
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Button2 label="Continuar" onPress={handleContinue} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Ja tem conta? </Text>
          <Link href="/(auth)/login" style={styles.link}>
            Entrar
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors2.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing2.containerMargin, gap: spacing2.md },
  header: { alignItems: 'center', gap: spacing2.xs, marginBottom: spacing2.sm },
  logo: { ...typography2.displayHero, fontSize: 36 },
  title: { ...typography2.headlineMd, fontSize: 20, textAlign: 'center', marginTop: spacing2.sm },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },
  progressWrap: { width: '100%', marginTop: spacing2.md },
  error: { color: colors2.danger, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing2.md },
  footerText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
  link: { ...typography2.bodyMd, color: colors2.primary, fontWeight: '700' },
});
