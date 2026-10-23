import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button3 } from '@/components/Button3';
import { colors3, spacing3, typography3 } from '@/constants/theme';
import { linkDisplayText, openableLink } from '@/services/profileFeedState';

interface ProfileIdentityProps {
  username?: string | null;
  bio?: string | null;
  link?: string | null;
  onEdit: () => void;
  /** Convidar amigos para usar o app (folha de compartilhar do sistema). Omitido = sem o botao. */
  onInvite?: () => void;
}

/**
 * Identidade do SEU perfil (abaixo do cartao com avatar e nome): @usuario (ou um convite discreto para definir), bio, link e o botao
 * "Editar perfil". Para o dono, bio e link aparecem sempre (a regra de 18+ vale para OUTRAS pessoas). O link so vira botao se for https.
 */
export function ProfileIdentity({ username, bio, link, onEdit, onInvite }: ProfileIdentityProps) {
  const safeLink = openableLink(link);
  return (
    <View style={styles.box}>
      {username ? (
        <Text style={styles.username} accessibilityLabel={`Seu @usuário: ${username}`}>
          @{username}
        </Text>
      ) : (
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Defina seu @usuário" hitSlop={8}>
          <Text style={styles.invite}>Defina seu @usuário</Text>
        </Pressable>
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
      <Button3 label="Editar perfil" variant="secondary" onPress={onEdit} accessibilityLabel="Editar perfil" />
      {!!onInvite && (
        <Button3 label="Convidar amigos" variant="secondary" onPress={onInvite} accessibilityLabel="Convidar amigos para usar o Tryv Fit" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', gap: spacing3.sm, marginTop: spacing3.sm, marginBottom: spacing3.sm },
  username: { ...typography3.headlineMd, fontSize: 18, textAlign: 'center', color: colors3.primary },
  invite: { ...typography3.bodyMd, textAlign: 'center', color: colors3.onSurfaceVariant, textDecorationLine: 'underline' },
  bio: { ...typography3.bodyMd, textAlign: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing3.xs, minHeight: 32 },
  link: { ...typography3.bodyMd, color: colors3.primary, flexShrink: 1 },
});
