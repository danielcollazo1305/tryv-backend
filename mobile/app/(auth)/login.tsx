import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Button2 } from '@/components/Button2';
import { TextField2 } from '@/components/TextField2';
import { colors2, spacing2, typography2 } from '@/constants/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Preencha email e senha.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv</Text>
          <Text style={styles.subtitle}>Entre para continuar seu progresso</Text>
        </View>

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

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Button2 label="Entrar" onPress={handleSubmit} loading={loading} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Ainda nao tem conta? </Text>
          <Link href="/(auth)/register" style={styles.link}>
            Criar conta
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
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },
  error: { color: colors2.danger, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing2.md },
  footerText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
  link: { ...typography2.bodyMd, color: colors2.primary, fontWeight: '700' },
});
