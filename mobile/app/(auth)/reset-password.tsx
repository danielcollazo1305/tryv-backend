import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { TextField2 } from '@/components/TextField2';
import { getApiErrorMessage } from '@/services/api';
import { resetPassword } from '@/services/auth';
import { colors2, spacing2, typography2 } from '@/constants/theme';

export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!email) {
      setError('E-mail nao informado. Volte e refaca a solicitacao.');
      return;
    }
    if (code.trim().length !== 6 || !/^\d{6}$/.test(code.trim())) {
      setError('Informe o codigo de 6 digitos recebido por e-mail.');
      return;
    }
    // Mesma regra de forca de senha do cadastro (ver (auth)/register.tsx).
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
      await resetPassword(email, code.trim(), password);
      setSuccess(true);
      setTimeout(() => router.replace('/(auth)/login'), 1500);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Codigo invalido ou expirado.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv</Text>
          <Text style={styles.title}>Redefinir senha</Text>
          <Text style={styles.subtitle}>
            {email
              ? `Digite o codigo enviado para ${email} e escolha sua nova senha.`
              : 'Digite o codigo recebido por e-mail e escolha sua nova senha.'}
          </Text>
        </View>

        {success ? (
          <Text style={styles.success}>Senha redefinida com sucesso! Redirecionando para o login...</Text>
        ) : (
          <>
            <TextField2
              label="Codigo de verificacao"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              placeholder="000000"
            />
            <TextField2
              label="Nova senha"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="********"
            />
            <TextField2
              label="Confirmar nova senha"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="********"
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Button2 label="Redefinir senha" onPress={handleSubmit} loading={loading} />

            <View style={styles.footer}>
              <Text style={styles.link} onPress={() => router.back()}>
                Nao recebi o codigo
              </Text>
            </View>
          </>
        )}
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
  error: { color: colors2.danger, textAlign: 'center' },
  success: { ...typography2.bodyMd, color: colors2.primary, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing2.md },
  link: { ...typography2.bodyMd, color: colors2.primary, fontWeight: '700' },
});
