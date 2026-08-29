import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { colors2, colors3, radius2, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

interface EmptyFollowingStateProps {
  /**
   * 'dark' (default) = tema escuro original, colors2/Button2 — usado por
   * app/social/follows.tsx, que continua escuro. 'light' = tema
   * "prism-glass" (colors3/Button3/GlassCard), usado pelo Feed migrado
   * nesta tarefa. Mesmo padrao ja usado em HeatmapGrid.tsx (variant dark/
   * light) pra um componente compartilhado entre telas em estagios de
   * migracao diferentes — sem essa prop, migrar aqui pro claro quebraria
   * a aparencia de follows.tsx, que nao faz parte deste pedido.
   */
  variant?: 'dark' | 'light';
}

/**
 * Estado vazio "voce nao esta seguindo ninguem" — reutilizado no Feed
 * (item 2) e na aba Seguindo do proprio Perfil (item 4, "mesmo padrao do
 * item 2"). O botao leva pra aba Sugestoes da tela de Seguidores/Seguindo/
 * Sugestoes (social/follows.tsx) — o pedido original menciona "tela
 * Descobrir, ja na aba de Sugestoes", mas Descobrir (Pesquisar/Contatos)
 * nao tem aba Sugestoes; quem tem e esta tela. Resolvi como o destino
 * real que existe, documentado no relatorio final.
 *
 * Texto mantido EXATAMENTE como estava (sem acento, "Voce nao esta...") —
 * o mockup do Feed usava copy acentuada, mas era so uma aproximacao do
 * briefing, nao fonte de verdade sobre a copy real deste arquivo.
 */
export function EmptyFollowingState({ variant = 'dark' }: EmptyFollowingStateProps) {
  const handlePress = () => router.push({ pathname: '/social/follows', params: { tab: 'suggestions' } });

  if (variant === 'light') {
    return (
      <GlassCard variant="glass" style={stylesLight.wrap}>
        <View style={stylesLight.iconWrap}>
          <Ionicons name="people-outline" size={28} color={colors3.primary} />
        </View>
        <Text style={stylesLight.title}>Voce nao esta seguindo ninguem</Text>
        <Text style={stylesLight.subtitle}>Revise as sugestoes de seus amigos para comecar.</Text>
        {/*
          Button3 nao aceita `style` (Omit<PressableProps, 'style'>, de
          proposito — ver componente) e estica pra preencher toda a
          largura disponivel do pai, o que fica desproporcional aqui dentro
          de um card com bastante respiro lateral. Em vez de mudar Button3
          (usado em varios lugares que QUEREM largura cheia, ex: telas de
          formulario), limito a largura so localmente com um wrapper —
          alignSelf:'center' pra nao esticar ate a borda do avo, maxWidth
          pra Button3 ter um teto de largura menor que a largura do card.
        */}
        <View style={stylesLight.buttonWrap}>
          <Button3 label="Revisar sugestoes" onPress={handlePress} />
        </View>
      </GlassCard>
    );
  }

  return (
    <View style={stylesDark.wrap}>
      <View style={stylesDark.iconWrap}>
        <Ionicons name="people-outline" size={28} color={colors2.onSurfaceVariant} />
      </View>
      <Text style={stylesDark.title}>Voce nao esta seguindo ninguem</Text>
      <Text style={stylesDark.subtitle}>Revise as sugestoes de seus amigos para comecar.</Text>
      <Button2 label="Revisar sugestoes" onPress={handlePress} />
    </View>
  );
}

const stylesDark = StyleSheet.create({
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

const stylesLight = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing3.sm },
  iconWrap: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(107, 56, 212, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing3.xs,
  },
  title: { ...typography3.headlineMd, fontSize: 17, textAlign: 'center' },
  subtitle: {
    ...typography3.bodyMd,
    color: colors3.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: spacing3.sm,
    maxWidth: 260,
  },
  // Largura FIXA (nao width:'100%'+maxWidth) de proposito — o wrapper nao
  // tem alignSelf:'stretch', entao um width percentual nao teria uma
  // largura de referencia clara pra resolver contra (o pai nao forca
  // largura nenhuma nos filhos com alignItems:'center'). Um numero fixo
  // remove essa ambiguidade: Button3 (que estica pra preencher o pai)
  // estica exatamente ate aqui, nem mais nem menos.
  buttonWrap: { alignSelf: 'center', width: 220 },
});
