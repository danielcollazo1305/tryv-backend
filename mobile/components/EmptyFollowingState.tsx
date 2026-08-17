import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

/**
 * Estado vazio "voce nao esta seguindo ninguem" — reutilizado no Feed
 * (item 2) e na aba Seguindo do proprio Perfil (item 4, "mesmo padrao do
 * item 2"). O botao leva pra aba Sugestoes da tela de Seguidores/Seguindo/
 * Sugestoes (social/follows.tsx) — o pedido original menciona "tela
 * Descobrir, ja na aba de Sugestoes", mas Descobrir (Pesquisar/Contatos)
 * nao tem aba Sugestoes; quem tem e esta tela. Resolvi como o destino
 * real que existe, documentado no relatorio final.
 */
export function EmptyFollowingState() {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name="people-outline" size={28} color={colors2.onSurfaceVariant} />
      </View>
      <Text style={styles.title}>Voce nao esta seguindo ninguem</Text>
      <Text style={styles.subtitle}>Revise as sugestoes de seus amigos para comecar.</Text>
      <Button2
        label="Revisar sugestoes"
        onPress={() => router.push({ pathname: '/social/follows', params: { tab: 'suggestions' } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: spacing2.sm, paddingVertical: spacing2.xl },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing2.xs,
  },
  title: { ...typography2.headlineMd, fontSize: 17, textAlign: 'center' },
  subtitle: {
    ...typography2.bodyMd,
    color: colors2.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: spacing2.sm,
    maxWidth: 260,
  },
});
