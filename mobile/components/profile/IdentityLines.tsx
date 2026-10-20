import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors3, spacing3, typography3 } from '@/constants/theme';
import { linkDisplayText, openableLink } from '@/services/profileFeedState';

interface IdentityLinesProps {
  username?: string | null;
  bio?: string | null;
  link?: string | null;
}

/**
 * @usuario, bio e link de OUTRA pessoa (perfil publico). So desenha o que o servidor devolveu preenchido: ausente/nulo nao deixa linha vazia
 * e nao ha aviso sobre o motivo (o servidor omite bio e link de menores e de quem nao tem data de nascimento; o app nao adivinha idade).
 * O link so abre no navegador se for https.
 */
export function IdentityLines({ username, bio, link }: IdentityLinesProps) {
  const safeLink = openableLink(link ?? null);
  if (!username && !bio && !safeLink) return null;
  return (
    <View style={styles.box}>
      {!!username && (
        <Text style={styles.username} accessibilityLabel={`@usuário: ${username}`}>
          @{username}
        </Text>
      )}
      {!!bio && <Text style={styles.bio}>{bio}</Text>}
      {!!safeLink && (
        <Pressable
          onPress={() => void Linking.openURL(safeLink).catch(() => {})}
          accessibilityRole="link"
          accessibilityLabel={`Abrir o link ${linkDisplayText(safeLink)} no navegador`}
          style={styles.linkRow}
          hitSlop={8}
        >
          <Ionicons name="link-outline" size={16} color={colors3.primary} />
          <Text style={styles.link} numberOfLines={1}>
            {linkDisplayText(safeLink)}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', gap: spacing3.xs },
  username: { ...typography3.headlineMd, fontSize: 16, textAlign: 'center', color: colors3.primary },
  bio: { ...typography3.bodyMd, textAlign: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing3.xs, minHeight: 32 },
  link: { ...typography3.bodyMd, color: colors3.primary, flexShrink: 1 },
});
