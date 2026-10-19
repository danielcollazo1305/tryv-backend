import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button3 } from '@/components/Button3';
import { CAPTION_MAX_LENGTH } from '@/constants/textLimits';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { PostEditError, PostVisibilityChoice, VISIBILITY_OPTIONS, captionEditState, visibilityTapAction } from '@/services/postEdit';

// Folhas de edicao do PROPRIO post (mesmo estilo da ReportSheet): editar legenda e mudar privacidade. O erro aparece na propria folha,
// que continua aberta com o texto digitado.

interface EditCaptionSheetProps {
  visible: boolean;
  /** Legenda atual do post (null = sem legenda). */
  initialCaption: string | null;
  onClose: () => void;
  /** Salva a legenda nova. Devolve null em sucesso (a folha fecha) ou o erro ja traduzido (a folha continua aberta). */
  onSave: (caption: string) => Promise<PostEditError | null>;
}

export function EditCaptionSheet({ visible, initialCaption, onClose, onSave }: EditCaptionSheetProps) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada vez que a folha abre, comeca com a legenda atual.
  useEffect(() => {
    if (visible) {
      setDraft(initialCaption ?? '');
      setSaving(false);
      setError(null);
    }
  }, [visible, initialCaption]);

  const state = captionEditState(initialCaption, draft, saving, CAPTION_MAX_LENGTH);

  const handleSave = async () => {
    if (!state.canSave) return;
    setSaving(true);
    setError(null);
    const failure = await onSave(draft.trim());
    setSaving(false);
    if (failure) setError(failure.message);
    else onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => (saving ? undefined : onClose())}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropTap} onPress={saving ? undefined : onClose} accessibilityLabel="Fechar" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Editar legenda</Text>
            <Pressable onPress={onClose} disabled={saving} style={styles.closeButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={24} color={colors3.onSurface} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Escreva uma legenda"
              placeholderTextColor={colors3.onSurfaceVariant}
              multiline
              maxLength={CAPTION_MAX_LENGTH}
              editable={!saving}
              autoFocus
              accessibilityLabel="Legenda do post"
            />
            <Text style={styles.counter}>
              {draft.length}/{CAPTION_MAX_LENGTH}
            </Text>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Button3 label="Salvar" onPress={handleSave} loading={saving} disabled={!state.canSave} accessibilityLabel="Salvar a legenda" />
            <Button3 label="Cancelar" variant="secondary" onPress={onClose} disabled={saving} accessibilityLabel="Cancelar a edição" />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface VisibilitySheetProps {
  visible: boolean;
  /** Privacidade atual do post ('public' | 'followers'). */
  current: string;
  onClose: () => void;
  /** Muda a privacidade. Devolve null em sucesso (a folha fecha) ou o erro ja traduzido (a folha continua aberta). */
  onSelect: (visibility: PostVisibilityChoice) => Promise<PostEditError | null>;
}

export function VisibilitySheet({ visible, current, onClose, onSelect }: VisibilitySheetProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSaving(false);
      setError(null);
    }
  }, [visible]);

  const handleTap = async (value: PostVisibilityChoice) => {
    if (saving) return;
    if (visibilityTapAction(current, value) === 'close') {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    const failure = await onSelect(value);
    setSaving(false);
    if (failure) setError(failure.message);
    else onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => (saving ? undefined : onClose())}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={saving ? undefined : onClose} accessibilityLabel="Fechar" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Quem pode ver este post?</Text>
            <Pressable onPress={onClose} disabled={saving} style={styles.closeButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={24} color={colors3.onSurface} />
            </Pressable>
          </View>
          <View style={styles.content}>
            {VISIBILITY_OPTIONS.map((option) => {
              const selected = option.value === current;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleTap(option.value)}
                  disabled={saving}
                  style={[styles.optionRow, selected && styles.optionRowSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${option.label}. ${option.description}`}
                >
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selected ? colors3.primary : colors3.outline}
                  />
                  <View style={styles.optionText}>
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
                    <Text style={styles.optionDescription}>{option.description}</Text>
                  </View>
                </Pressable>
              );
            })}
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: colors3.background,
    borderTopLeftRadius: radius3.xl,
    borderTopRightRadius: radius3.xl,
    paddingHorizontal: spacing3.lg,
    paddingTop: spacing3.md,
    paddingBottom: spacing3.xl,
    maxHeight: '90%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography3.headlineMd, fontSize: 18, flex: 1 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { gap: spacing3.sm, paddingBottom: spacing3.md },
  input: {
    minHeight: 110,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    borderRadius: radius3.lg,
    backgroundColor: colors3.surfaceContainerLowest,
    padding: spacing3.md,
    ...typography3.bodyMd,
    textAlignVertical: 'top',
  },
  counter: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, textAlign: 'right' },
  error: { color: colors3.error, textAlign: 'center' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.md,
    minHeight: 56,
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm,
    borderRadius: radius3.lg,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    backgroundColor: colors3.surfaceContainerLowest,
  },
  optionRowSelected: { borderColor: colors3.primary, backgroundColor: 'rgba(107, 56, 212, 0.08)' },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },
  optionLabelSelected: { color: colors3.primary },
  optionDescription: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
});
