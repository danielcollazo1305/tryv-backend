import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { TextField2 } from '@/components/TextField2';
import { getApiErrorMessage } from '@/services/api';
import { resetPassword } from '@/services/auth';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

// colors3 nao tem token semantico de "success" -- resolvido com hex
// literal, mesmo padrao ja usado em MonthComparisonCard/ReadinessCard/Perfil.
const SUCCESS_COLOR = '#15803d';

/**
 * Migrada pro tema claro "prism-glass" nesta tarefa (colors2 -> colors3,
 * Button2 -> Button3, TextField2 variant="light", ScreenBackground3 no
 * lugar do backgroundColor manual) -- mesmo padrao ja usado no Login.
 * Nenhuma logica de verificacao/troca de senha/navegacao foi alterada.
 *
 * "Nao recebi o codigo" continua so um router.back() -- volta pra
 * forgot-password.tsx, onde o reenvio de verdade acontece (mesma funcao
 * forgotPassword(email) de la). Nao e um link fake: e navegacao real,
 * so indireta (nao reenvia no proprio lugar).
 */
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
    <ScreenBackground3 style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logo}>Tryv Fit</Text>
            <Text style={styles.title}>Redefinir senha</Text>
            <Text style={styles.subtitle}>
              {email
                ? `Digite o codigo enviado para ${email} e escolha sua nova senha.`
                : 'Digite o codigo recebido por e-mail e escolha sua nova senha.'}
            </Text>
          </View>

          {success ? (
            <View style={styles.successBox}>
              <View style={styles.successIconWrap}>
                <Ionicons name="checkmark" size={22} color={SUCCESS_COLOR} />
              </View>
              <Text style={styles.success}>Senha redefinida com sucesso! Redirecionando para o login...</Text>
            </View>
          ) : (
            <>
              <TextField2
                variant="light"
                label="Codigo de verificacao"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
                placeholder="000000"
              />
              <TextField2
                variant="light"
                label="Nova senha"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="********"
              />
              <TextField2
                variant="light"
                label="Confirmar nova senha"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="********"
              />

              {!!error && <Text style={styles.error}>{error}</Text>}

              <Button3 label="Redefinir senha" onPress={handleSubmit} loading={loading} />

              <View style={styles.footer}>
                <Text style={styles.link} onPress={() => router.back()}>
                  Nao recebi o codigo
                </Text>
              </View>
            </>
          )}
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
  successBox: { alignItems: 'center', gap: spacing3.sm },
  successIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius3.pill,
    backgroundColor: 'rgba(21, 128, 61, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  success: { ...typography3.bodyMd, color: SUCCESS_COLOR, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing3.md },
  link: { ...typography3.bodyMd, color: colors3.primary, fontWeight: '700' },
});
