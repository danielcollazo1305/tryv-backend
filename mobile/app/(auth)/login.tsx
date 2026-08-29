import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Button3 } from '@/components/Button3';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { TextField2 } from '@/components/TextField2';
import { colors3, spacing3, typography3 } from '@/constants/theme';

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
    <ScreenBackground3 style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logo}>Tryv</Text>
            <Text style={styles.subtitle}>Entre para continuar seu progresso</Text>
          </View>

          <TextField2
            variant="light"
            label="E-mail"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="voce@email.com"
          />
          <TextField2
            variant="light"
            label="Senha"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="********"
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Button3 label="Entrar" onPress={handleSubmit} loading={loading} />

          <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
            Esqueci minha senha
          </Link>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Ainda nao tem conta? </Text>
            <Link href="/(auth)/register" style={styles.link}>
              Criar conta
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing3.containerMargin, gap: spacing3.md },
  header: { alignItems: 'center', gap: spacing3.xs, marginBottom: spacing3.sm },
  logo: { ...typography3.displayLg, fontSize: 36, fontWeight: '800', color: colors3.primary },
  subtitle: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
  error: { color: colors3.error, textAlign: 'center' },
  forgotLink: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center', marginTop: spacing3.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing3.md },
  footerText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  link: { ...typography3.bodyMd, color: colors3.primary, fontWeight: '700' },
});
