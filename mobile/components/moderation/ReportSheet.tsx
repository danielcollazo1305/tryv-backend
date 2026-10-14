import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import { SUPPORT_EMAIL } from '@/constants/support';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { ModerationError, REPORT_DETAILS_MAX, REPORT_REASONS, ReportReason } from '@/services/moderation';

export const REPORT_SUCCESS_MESSAGE = 'Denúncia enviada. Obrigado por ajudar a manter o Tryv seguro.';

/** Abre o app de e-mail para o contato do Tryv; sem app de e-mail, mostra o endereco para a pessoa copiar/anotar. */
export async function openSupportEmail(subject = 'Contato Tryv'): Promise<void> {
  try {
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`);
  } catch {
    Alert.alert('Contato', `Escreva para ${SUPPORT_EMAIL}`);
  }
}

interface ReportSheetProps {
  visible: boolean;
  kind: 'post' | 'comment';
  onClose: () => void;
  /** Envia a denuncia. Devolve null em sucesso (201 ou 200) ou o erro ja traduzido para mostrar na folha. */
  onSubmit: (reason: ReportReason, details: string) => Promise<ModerationError | null>;
}

/**
 * Folha de denuncia (post ou comentario): motivo (obrigatorio), detalhe opcional (ate 500 caracteres) e Enviar com
 * carregando. Erro (rede, API antiga sem a rota, conteudo indisponivel) aparece na propria folha e permite tentar de
 * novo; sucesso mostra o agradecimento. Rodape com o contato publico.
 */
export function ReportSheet({ visible, kind, onClose, onSubmit }: ReportSheetProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ModerationError | null>(null);
  const [done, setDone] = useState(false);

  // Cada vez que a folha abre, comeca limpa.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
      setSending(false);
      setError(null);
      setDone(false);
    }
  }, [visible]);

  const handleSend = async () => {
    if (!reason || sending) return;
    setSending(true);
    setError(null);
    const failure = await onSubmit(reason, details.trim());
    setSending(false);
    if (failure) setError(failure);
    else setDone(true);
  };

  const unavailable = error?.kind === 'content_unavailable';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => (sending ? undefined : onClose())}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropTap} onPress={sending ? undefined : onClose} accessibilityLabel="Fechar" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{kind === 'post' ? 'Denunciar post' : 'Denunciar comentário'}</Text>
            <Pressable
              onPress={onClose}
              disabled={sending}
              style={styles.closeButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
            >
              <Ionicons name="close" size={24} color={colors3.onSurface} />
            </Pressable>
          </View>

          {done ? (
            <View style={styles.doneBox}>
              <Ionicons name="checkmark-circle" size={40} color={colors3.primary} />
              <Text style={styles.doneText}>{REPORT_SUCCESS_MESSAGE}</Text>
              <Button3 label="Fechar" onPress={onClose} />
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
              <Text style={styles.label}>Qual o motivo?</Text>
              <View style={styles.reasons}>
                {REPORT_REASONS.map((item) => {
                  const selected = item.value === reason;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => setReason(item.value)}
                      disabled={sending}
                      style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={item.label}
                    >
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={selected ? colors3.primary : colors3.outline}
                      />
                      <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Detalhes (opcional)</Text>
              <TextInput
                style={styles.input}
                value={details}
                onChangeText={setDetails}
                placeholder="Conte o que aconteceu"
                placeholderTextColor={colors3.onSurfaceVariant}
                multiline
                maxLength={REPORT_DETAILS_MAX}
                editable={!sending}
              />
              <Text style={styles.counter}>
                {details.length}/{REPORT_DETAILS_MAX}
              </Text>

              {!!error && <Text style={styles.error}>{error.message}</Text>}

              {unavailable ? (
                <Button3 label="Fechar" onPress={onClose} />
              ) : (
                <Button3
                  label={error ? 'Tentar de novo' : 'Enviar'}
                  onPress={handleSend}
                  loading={sending}
                  disabled={!reason || sending}
                />
              )}
            </ScrollView>
          )}

          <Pressable onPress={() => openSupportEmail('Denúncia no Tryv')} style={styles.contact} accessibilityRole="link">
            <Text style={styles.contactText}>
              Quer falar com a gente? <Text style={styles.contactLink}>{SUPPORT_EMAIL}</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  title: { ...typography3.headlineMd, fontSize: 18 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { gap: spacing3.sm, paddingBottom: spacing3.md },
  label: { ...typography3.labelMd, color: colors3.onSurfaceVariant, marginTop: spacing3.xs },
  reasons: { gap: spacing3.xs },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    minHeight: 44,
    paddingHorizontal: spacing3.md,
    borderRadius: radius3.lg,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    backgroundColor: colors3.surfaceContainerLowest,
  },
  reasonRowSelected: { borderColor: colors3.primary, backgroundColor: 'rgba(107, 56, 212, 0.08)' },
  reasonText: { ...typography3.bodyMd, flex: 1 },
  reasonTextSelected: { fontFamily: 'Inter_700Bold', color: colors3.primary },
  input: {
    minHeight: 80,
    maxHeight: 140,
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
  doneBox: { alignItems: 'center', gap: spacing3.md, paddingVertical: spacing3.lg },
  doneText: { ...typography3.bodyMd, textAlign: 'center' },
  contact: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  contactText: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, textAlign: 'center' },
  contactLink: { color: colors3.primary, fontFamily: 'Inter_700Bold' },
});
