import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/context/AuthContext';
import { getUserBadges } from '@/services/user';
import { getInitials } from '@/utils/text';
import { colors2 } from '@/constants/theme';

interface ProfileAvatarButtonProps {
  size?: number;
  /**
   * Se o chamador ja sabe o status Pro do usuario (ex: (tabs)/workout.tsx
   * ja busca badges pra decidir o gate de acesso), passe aqui pra evitar
   * um fetch duplicado de GET /users/{id}/badges. Omitir deixa o proprio
   * componente buscar sozinho (caso de Home/Feed/Refeicoes, que nao
   * precisavam desse dado antes).
   */
  isPro?: boolean;
}

/**
 * Avatar tocavel dos cabecalhos (Home/Feed/Refeicoes/Treino), extraido pra
 * um componente unico em vez de repetir Avatar+Pressable+fetch de status
 * Pro em cada tela — quem ja e Pro nao ve nenhum badge extra, so quem NAO
 * e Pro ganha o indicador de upgrade discreto no canto.
 *
 * Navegacao: sempre leva pro Perfil (nao criei um segundo destino pro
 * badge) — o caminho completo pra assinatura ja existe de la (Perfil ->
 * card "Tryv Pro" -> Assinatura), entao um atalho direto so duplicaria
 * rota sem necessidade real. Documentado tambem no resumo da tarefa.
 */
export function ProfileAvatarButton({ size = 36, isPro: isProOverride }: ProfileAvatarButtonProps) {
  const { user } = useAuth();
  const [fetchedIsPro, setFetchedIsPro] = useState(false);
  const shouldFetch = isProOverride === undefined;

  useFocusEffect(
    useCallback(() => {
      if (!shouldFetch || !user) return;
      let active = true;
      getUserBadges(user.id)
        .then((data) => {
          if (active) setFetchedIsPro(data.is_pro);
        })
        .catch(() => {
          if (active) setFetchedIsPro(false);
        });
      return () => {
        active = false;
      };
    }, [user, shouldFetch])
  );

  const isPro = isProOverride ?? fetchedIsPro;

  const badgeSize = Math.round(size * 0.42);

  return (
    <Pressable onPress={() => router.push('/(tabs)/profile')} hitSlop={8}>
      <View>
        <Avatar initials={user ? getInitials(user.name) : '?'} size={size} />
        {!isPro && (
          <View
            style={[
              styles.badge,
              { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 },
            ]}
          >
            <Ionicons name="star" size={Math.round(size * 0.24)} color={colors2.white} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors2.violet,
    borderWidth: 1.5,
    borderColor: colors2.background,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors2.violet,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 4,
    elevation: 4,
  },
});
