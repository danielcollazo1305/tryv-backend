import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { getApiErrorMessage } from '@/services/api';
import { ProfessionalType, licenseLabel, registerTrainer } from '@/services/trainers';
import { colors, radius, spacing, typography } from '@/constants/theme';

const TYPE_OPTIONS: { value: ProfessionalType; label: string }[] = [
  { value: 'personal_trainer', label: 'Personal Trainer' },
  { value: 'nutritionist', label: 'Nutricionista' },
];

export default function TrainerRegisterScreen() {
  const [professionalType, setProfessionalType] = useState<ProfessionalType | null>(null);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [bio, setBio] = useState('');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = professionalType !== null && licenseNumber.trim().length > 0 && Number(price) > 0;
  const label = professionalType ? licenseLabel(professionalType) : 'CREF/CRN';

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Selecione o tipo de profissional e preencha o numero de registro e um preco mensal valido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await registerTrainer({
        professional_type: professionalType,
        license_number: licenseNumber.trim(),
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
        <Text style={styles.title}>Cadastro profissional</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.fieldLabel}>Tipo de profissional</Text>
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map((option) => {
            const selected = professionalType === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setProfessionalType(option.value)}
                style={[styles.typePill, selected && styles.typePillSelected]}
              >
                <Text style={[styles.typePillText, selected && styles.typePillTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.subtitle}>
          {professionalType
            ? `Seu ${label} passa por uma analise antes do seu perfil aparecer na busca de ${
                professionalType === 'nutritionist' ? 'nutricionistas' : 'personal trainers'
              }.`
            : 'Escolha seu tipo de atuacao pra continuar.'}
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TextField
          label={`Numero do ${label}`}
          placeholder={professionalType === 'nutritionist' ? 'Ex: 12345/SP' : 'Ex: 012345-G/SP'}
          value={licenseNumber}
          onChangeText={setLicenseNumber}
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
  fieldLabel: { ...typography.caption, marginBottom: -spacing.xs },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typePill: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typePillSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  typePillText: { ...typography.bodySecondary, color: colors.text, fontWeight: '600' },
  typePillTextSelected: { color: colors.white, fontWeight: '700' },
  subtitle: { ...typography.bodySecondary },
  error: { color: colors.danger, textAlign: 'center' },
  bioInput: { minHeight: 110, textAlignVertical: 'top' },
});
