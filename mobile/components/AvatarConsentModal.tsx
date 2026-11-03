import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AVATAR_CONSENT_ACCEPT,
  AVATAR_CONSENT_DECLINE,
  AVATAR_CONSENT_PARAGRAPHS,
  AVATAR_CONSENT_TITLE,
} from '@/services/avatarFlow';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

interface AvatarConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Aviso de consentimento ANTES de enviar a foto: ela vai para a OpenAI, fica guardada em local privado e a imagem escolhida (foto ou avatar)
 * aparece para outras pessoas. Nada e enviado sem o toque em "Concordo e continuar"; o servidor tambem recusa sem a versao atual do aviso.
 */
export function AvatarConsentModal({ visible, onAccept, onDecline }: AvatarConsentModalProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            {AVATAR_CONSENT_TITLE}
          </Text>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {AVATAR_CONSENT_PARAGRAPHS.map((paragraph) => (
              <Text key={paragraph} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </ScrollView>
          <Pressable style={styles.accept} onPress={onAccept} accessibilityRole="button" accessibilityLabel={AVATAR_CONSENT_ACCEPT}>
            <Text style={styles.acceptText}>{AVATAR_CONSENT_ACCEPT}</Text>
          </Pressable>
          <Pressable style={styles.decline} onPress={onDecline} accessibilityRole="button" accessibilityLabel={AVATAR_CONSENT_DECLINE} hitSlop={8}>
            <Text style={styles.declineText}>{AVATAR_CONSENT_DECLINE}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing3.containerMargin },
  sheet: { backgroundColor: colors3.surface, borderRadius: radius3.xl, padding: spacing3.lg, gap: spacing3.md, maxHeight: '85%' },
  title: { ...typography3.headlineMd, fontSize: 20, color: colors3.onSurface },
  body: { flexGrow: 0 },
  bodyContent: { gap: spacing3.sm },
  paragraph: { ...typography3.bodyMd, color: colors3.onSurface },
  accept: { backgroundColor: colors3.primary, borderRadius: radius3.pill, paddingVertical: spacing3.md, alignItems: 'center' },
  acceptText: { ...typography3.bodyMd, fontWeight: '700', color: colors3.onPrimary },
  decline: { alignItems: 'center', paddingVertical: spacing3.sm },
  declineText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
});
