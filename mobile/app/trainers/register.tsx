import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { ChoiceGroup2 } from '@/components/ChoiceGroup2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { MultiChoiceGroup2 } from '@/components/MultiChoiceGroup2';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { TextField2 } from '@/components/TextField2';
import { getApiErrorMessage } from '@/services/api';
import { ProfessionalType, SPECIALTIES_BY_PROFESSIONAL_TYPE, licenseLabel, registerTrainer } from '@/services/trainers';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

const TYPE_OPTIONS: { value: ProfessionalType; label: string }[] = [
  { value: 'personal_trainer', label: 'Personal Trainer' },
  { value: 'nutritionist', label: 'Nutricionista' },
];

export default function TrainerRegisterScreen() {
  const [professionalType, setProfessionalType] = useState<ProfessionalType | null>(null);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [bio, setBio] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [certifications, setCertifications] = useState('');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = professionalType !== null && licenseNumber.trim().length > 0 && Number(price) > 0;
  const label = professionalType ? licenseLabel(professionalType) : 'CREF/CRN';

  // Trocar de area de atuacao muda o vocabulario valido de especialidades —
  // limpa a selecao anterior pra nunca enviar uma especialidade que nao
  // existe mais pro tipo escolhido.
  const handleChangeProfessionalType = (type: ProfessionalType) => {
    setProfessionalType(type);
    setSpecialties([]);
  };

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
        years_experience: yearsExperience.trim() ? Number(yearsExperience) : undefined,
        specialties,
        certifications: certifications.trim() || undefined,
        price: Number(price),
      });
      router.replace('/trainers/me');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel concluir o cadastro.'));
      setSubmitting(false);
    }
  };

  return (
    <ScreenBackground2 style={styles.flex}>
    <KeyboardAvoidingView style={styles.innerFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.title}>Registro Profissional</Text>
          <Text style={styles.subtitle}>Configure seu perfil para oferecer servicos na plataforma.</Text>
        </View>

        <ChoiceGroup2
          label="Area de atuacao"
          options={TYPE_OPTIONS}
          value={professionalType}
          onChange={handleChangeProfessionalType}
        />

        {!!professionalType && (
          <MultiChoiceGroup2
            label="Especialidades"
            options={SPECIALTIES_BY_PROFESSIONAL_TYPE[professionalType]}
            value={specialties}
            onChange={setSpecialties}
          />
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        <LiquiglassCard style={styles.formCard}>
          <TextField2
            label={`Numero do ${label}`}
            placeholder={professionalType === 'nutritionist' ? 'Ex: 12345/SP' : 'Ex: 012345-G/SP'}
            value={licenseNumber}
            onChangeText={setLicenseNumber}
          />
          <TextField2
            label="Anos de experiencia (opcional)"
            placeholder="Ex: 8"
            keyboardType="number-pad"
            value={yearsExperience}
            onChangeText={setYearsExperience}
          />
          <TextField2
            label="Minibio (visivel no perfil)"
            placeholder="Descreva sua especialidade, metodologia e experiencia..."
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={5}
            style={styles.bioInput}
          />
          <TextField2
            label="Formacao/Certificacoes (opcional)"
            placeholder="Ex: Graduado em Educacao Fisica pela USP, Pos em Fisiologia do Exercicio"
            value={certifications}
            onChangeText={setCertifications}
            multiline
            numberOfLines={4}
            style={styles.certificationsInput}
          />
          <TextField2
            label="Mensalidade base (R$)"
            placeholder="Ex: 150"
            keyboardType="decimal-pad"
            value={price}
            onChangeText={setPrice}
          />
        </LiquiglassCard>

        <View style={styles.noticeCard}>
          <Ionicons name="information-circle" size={20} color={colors2.primary} />
          <Text style={styles.noticeText}>Seu registro passa por verificacao antes de ficar visivel publicamente.</Text>
        </View>

        <Button2 label="Enviar para analise" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
      </ScrollView>
    </KeyboardAvoidingView>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  innerFlex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.lg, paddingBottom: spacing2.xl },
  intro: { gap: spacing2.xs },
  title: { ...typography2.headlineLgMobile, fontSize: 24 },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
  error: { color: colors2.danger, textAlign: 'center' },
  formCard: { gap: spacing2.md },
  bioInput: { minHeight: 110, textAlignVertical: 'top' },
  certificationsInput: { minHeight: 90, textAlignVertical: 'top' },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing2.sm,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: radius2.md,
    padding: spacing2.md,
  },
  noticeText: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurface, flex: 1, lineHeight: 20 },
});
