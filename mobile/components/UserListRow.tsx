import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { colors2, colors3, radius2, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';
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
  /**
   * 'dark' (padrao) = colors2, usado hoje em social/follows.tsx (ainda
   * escura, fora desta migracao). 'light' = colors3, so pra
   * social/discover.tsx (migrada nesta tarefa) — mesmo padrao de variant ja
   * usado em ChallengeCard2/ProfileBadges2/WorkoutDayCard nesta sessao.
   */
  variant?: 'dark' | 'light';
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
  variant = 'dark',
}: UserListRowProps) {
  const isLight = variant === 'light';
  const s = isLight ? stylesLight : styles;
  const loadingColor = isLight
    ? actionActive
      ? colors3.primary
      : colors3.onPrimary
    : actionActive
      ? colors2.primary
      : colors2.white;

  return (
    <View style={s.row}>
      <Pressable style={s.info} onPress={onPress} disabled={!onPress} hitSlop={4}>
        <Avatar initials={getInitials(name)} size={44} />
        <View style={s.textWrap}>
          <Text style={s.name} numberOfLines={1}>
            {name}
          </Text>
          {!!subtitle && (
            <Text style={s.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </Pressable>

      <Pressable
        style={[s.actionBtn, actionActive ? s.actionBtnActive : s.actionBtnPrimary]}
        onPress={onPressAction}
        disabled={actionLoading}
        hitSlop={4}
      >
        {actionLoading ? (
          <ActivityIndicator size="small" color={loadingColor} />
        ) : (
          <Text style={[s.actionText, actionActive ? s.actionTextActive : s.actionTextPrimary]}>{actionLabel}</Text>
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

const stylesLight = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  textWrap: { flex: 1, gap: 2 },
  name: { ...typography3.bodyMd, fontWeight: '600' },
  subtitle: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },

  actionBtn: {
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm - 2,
    borderRadius: radius3.pill,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: { backgroundColor: colors3.primary },
  actionBtnActive: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors3.primary },
  actionText: { ...typography3.bodyMd, fontSize: 13, fontWeight: '700' },
  actionTextPrimary: { color: colors3.onPrimary },
  actionTextActive: { color: colors3.primary },
});
