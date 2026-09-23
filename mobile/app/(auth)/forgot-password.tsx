import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { TextField2 } from '@/components/TextField2';
import { forgotPassword } from '@/services/auth';
import { getApiErrorMessage } from '@/services/api';
import { colors3, spacing3, typography3 } from '@/constants/theme';

/**
 * Migrada pro tema claro "prism-glass" nesta tarefa (colors2 -> colors3,
 * Button2 -> Button3, TextField2 variant="light", ScreenBackground3 no
 * lugar do backgroundColor manual) -- mesmo padrao ja usado em
 * reset-password.tsx (proxima tela do mesmo fluxo, ja migrada antes).
 * Nenhuma logica de validacao/envio de codigo/navegacao foi alterada.
 */
export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Informe seu e-mail.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      router.push({ pathname: '/(auth)/reset-password', params: { email: email.trim() } });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel enviar o codigo. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logo}>Tryv Fit</Text>
            <Text style={styles.title}>Esqueci minha senha</Text>
            <Text style={styles.subtitle}>
              Informe o e-mail da sua conta. Se ele estiver cadastrado, vamos enviar um codigo de verificacao.
            </Text>
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

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Button3 label="Enviar codigo" onPress={handleSubmit} loading={loading} />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Lembrou a senha? </Text>
            <Text style={styles.link} onPress={() => router.back()}>
              Voltar para o login
            </Text>
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
  title: { ...typography3.headlineMd, fontSize: 20, textAlign: 'center', marginTop: spacing3.sm },
  subtitle: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
  error: { color: colors3.error, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing3.md },
  footerText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  link: { ...typography3.bodyMd, color: colors3.primary, fontWeight: '700' },
});
