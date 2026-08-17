import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

interface UserListRowProps {
  name: string;
  subtitle?: string;
  onPress?: () => void;
  actionLabel: string;
  /** true = visual "ja feito" (contorno, nao preenchido) — ex: "Seguindo" em vez de "Seguir". */
  actionActive?: boolean;
  actionLoading?: boolean;
  onPressAction: () => void;
}

/**
 * Linha de usuario reutilizada em Pesquisar, Contatos (matches), Sugestoes,
 * Seguidores e Seguindo — avatar (iniciais) + nome + botao de acao
 * contextual pequeno (Button2 e feito pra CTA de tela cheia, alto demais
 * pra uma lista; esse botao e um pill compacto so pra este caso).
 */
export function UserListRow({
  name,
  subtitle,
  onPress,
  actionLabel,
  actionActive,
  actionLoading,
  onPressAction,
}: UserListRowProps) {
  return (
    <View style={styles.row}>
      <Pressable style={styles.info} onPress={onPress} disabled={!onPress} hitSlop={4}>
        <Avatar initials={getInitials(name)} size={44} />
        <View style={styles.textWrap}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </Pressable>

      <Pressable
        style={[styles.actionBtn, actionActive ? styles.actionBtnActive : styles.actionBtnPrimary]}
        onPress={onPressAction}
        disabled={actionLoading}
        hitSlop={4}
      >
        {actionLoading ? (
          <ActivityIndicator size="small" color={actionActive ? colors2.primary : colors2.white} />
        ) : (
          <Text style={[styles.actionText, actionActive ? styles.actionTextActive : styles.actionTextPrimary]}>
            {actionLabel}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  textWrap: { flex: 1, gap: 2 },
  name: { ...typography2.bodyMd, fontWeight: '600' },
  subtitle: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },

  actionBtn: {
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.sm - 2,
    borderRadius: radius2.pill,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: { backgroundColor: colors2.violet },
  actionBtnActive: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors2.violet },
  actionText: { ...typography2.bodyMd, fontSize: 13, fontWeight: '700' },
  actionTextPrimary: { color: colors2.white },
  actionTextActive: { color: colors2.primary },
});
