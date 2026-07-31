import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { createWeightLog, toDateString } from '@/services/weightLogs';
import { colors, spacing, typography } from '@/constants/theme';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
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
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel criar a conta.');
      setLoading(false);
      return;
    }

    // Peso e opcional e best-effort: a conta ja foi criada com sucesso, entao
    // uma falha aqui (raro) nao deve travar o usuario na tela de cadastro —
    // ele so nao comeca com um ponto no historico, e pode registrar depois.
    const weightValue = Number(weight);
    if (weightValue > 0) {
      try {
        await createWeightLog({ weight_kg: weightValue, logged_at: toDateString(new Date()) });
      } catch {
        // silencioso de proposito
      }
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Tryv</Text>
        <Text style={styles.subtitle}>Crie sua conta para comecar</Text>

        <TextField label="Nome" value={name} onChangeText={setName} placeholder="Seu nome" />
        <TextField
          label="E-mail"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="voce@email.com"
        />
        <TextField
          label="Senha"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="********"
        />
        <TextField
          label="Confirmar senha"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="********"
        />
        <TextField
          label="Peso atual em kg (opcional)"
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
          placeholder="Ex: 78.5"
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Button label="Criar conta" onPress={handleSubmit} loading={loading} />

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
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  logo: { ...typography.h1, fontSize: 36, color: colors.accent, textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { ...typography.bodySecondary, textAlign: 'center', marginBottom: spacing.xl },
  error: { color: colors.danger, marginBottom: spacing.md, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { ...typography.bodySecondary },
  link: { ...typography.bodySecondary, color: colors.accent, fontWeight: '700' },
});
