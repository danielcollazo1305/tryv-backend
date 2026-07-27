import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { getApiErrorMessage } from '@/services/api';
import { createChallenge } from '@/services/challenges';
import { colors, radius, spacing, typography } from '@/constants/theme';

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Ponto de partida razoavel: comeca amanha, termina uma semana depois.
const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);
const NEXT_WEEK = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);

export default function NewChallengeScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(TOMORROW);
  const [endDate, setEndDate] = useState(NEXT_WEEK);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && endDate > startDate;

  const handleStartDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowStartPicker(false);
    if (event.type === 'set' && selectedDate) setStartDate(selectedDate);
  };

  const handleEndDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowEndPicker(false);
    if (event.type === 'set' && selectedDate) setEndDate(selectedDate);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Preencha o titulo e escolha um periodo valido (fim depois do inicio).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createChallenge({
        title: title.trim(),
        description: description.trim() || undefined,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      });
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel criar o desafio.'));
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Novo desafio</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!error && <Text style={styles.error}>{error}</Text>}

        <TextField label="Titulo" placeholder="Ex: Desafio 30 dias" value={title} onChangeText={setTitle} />
        <TextField
          label="Descricao (opcional)"
          placeholder="Explique as regras e o objetivo do desafio..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={styles.descriptionInput}
        />

        <View style={styles.dateField}>
          <Text style={styles.dateLabel}>Data de inicio</Text>
          <Pressable style={styles.dateButton} onPress={() => setShowStartPicker(true)}>
            <Ionicons name="calendar-outline" size={18} color={colors.accent} />
            <Text style={styles.dateButtonText}>{formatDate(startDate)}</Text>
          </Pressable>
          {showStartPicker && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleStartDateChange}
              minimumDate={new Date()}
            />
          )}
          {Platform.OS === 'ios' && showStartPicker && (
            <Button label="Concluir" variant="secondary" onPress={() => setShowStartPicker(false)} />
          )}
        </View>

        <View style={styles.dateField}>
          <Text style={styles.dateLabel}>Data de fim</Text>
          <Pressable style={styles.dateButton} onPress={() => setShowEndPicker(true)}>
            <Ionicons name="calendar-outline" size={18} color={colors.accent} />
            <Text style={styles.dateButtonText}>{formatDate(endDate)}</Text>
          </Pressable>
          {showEndPicker && (
            <DateTimePicker
              value={endDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleEndDateChange}
              minimumDate={startDate}
            />
          )}
          {Platform.OS === 'ios' && showEndPicker && (
            <Button label="Concluir" variant="secondary" onPress={() => setShowEndPicker(false)} />
          )}
        </View>

        <Button label="Criar desafio" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
      </ScrollView>
    </View>
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
  error: { color: colors.danger, textAlign: 'center' },
  descriptionInput: { minHeight: 90, textAlignVertical: 'top' },

  dateField: { gap: spacing.xs, marginBottom: spacing.sm },
  dateLabel: { ...typography.caption, color: colors.textSecondary },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  dateButtonText: { ...typography.body, color: colors.text },
});
