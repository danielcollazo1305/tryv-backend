import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { getApiErrorMessage } from '@/services/api';
import { registerTrainer } from '@/services/trainers';
import { colors, spacing, typography } from '@/constants/theme';

export default function TrainerRegisterScreen() {
  const [crefNumber, setCrefNumber] = useState('');
  const [bio, setBio] = useState('');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = crefNumber.trim().length > 0 && Number(price) > 0;

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Preencha o CREF e um preco mensal valido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await registerTrainer({
        cref_number: crefNumber.trim(),
        bio: bio.trim() || undefined,
        price: Number(price),
      });
      router.replace('/trainers/me');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel concluir o cadastro.'));
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>Tornar-se professor</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          Seu CREF passa por uma analise antes do seu perfil aparecer na busca de professores.
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TextField
          label="Numero do CREF"
          placeholder="Ex: 012345-G/SP"
          value={crefNumber}
          onChangeText={setCrefNumber}
        />
        <TextField
          label="Bio"
          placeholder="Conte sua experiencia, especialidades e forma de trabalho..."
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={5}
          style={styles.bioInput}
        />
        <TextField
          label="Preco mensal (R$)"
          placeholder="Ex: 150"
          keyboardType="decimal-pad"
          value={price}
          onChangeText={setPrice}
        />

        <Button label="Cadastrar" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h2 },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  subtitle: { ...typography.bodySecondary },
  error: { color: colors.danger, textAlign: 'center' },
  bioInput: { minHeight: 110, textAlignVertical: 'top' },
});
