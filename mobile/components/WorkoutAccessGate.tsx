import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/**
 * Caso A do gate de acesso a Treino: usuario sem Pro E sem Personal
 * Trainer ativo. Mesma tecnica de blur do ObscuredCard (agora tint
 * "light", tema prism-glass), adaptada pra cobrir a tela inteira em vez
 * de um card — ObscuredCard em si nao serve aqui porque so suporta um
 * icone de cadeado sem CTA, e este gate precisa de titulo/subtitulo + botao.
 *
 * children carrega o conteudo de fundo (mesmo padrao do ObscuredCard: uma
 * versao real da tela, borrada atras, nao um placeholder inventado) — o
 * proprio WorkoutScreen passa o estado vazio padrao de Treino como fundo.
 *
 * Marketplace desativado pre-lancamento — botao "Procurar um profissional"
 * (navegava pra /trainers/select-type) escondido, mesmo padrao ja usado em
 * Home/Perfil: comentado, nao apagado. Subtitulo ajustado pra mencionar so
 * o Tryv Pro (antes falava das 2 opcoes) e as acoes viram 1 botao so,
 * sem sobrar espaco vazio no lugar do 2o. Nao apagar: reativar os 2 juntos
 * no relancamento do marketplace de profissionais.
 */
export function WorkoutAccessGate({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.wrapper}>
      <View pointerEvents="none">{children}</View>
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFillObject} />
      <View style={styles.overlay}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={28} color={colors3.primary} />
        </View>
        <Text style={styles.title}>Acesso a treinos</Text>
        <Text style={styles.subtitle}>
          Assine o Tryv Fit Pro para treinos gerados por IA, personalizados pro seu objetivo, nivel e equipamento
          disponivel.
        </Text>

        <View style={styles.actions}>
          <Button3 label="Assinar Tryv Fit Pro" onPress={() => router.push('/subscriptions/pro')} />
          {/*
            <Button3
              label="Procurar um profissional"
              variant="secondary"
              onPress={() => router.push('/trainers/select-type')}
            />
          */}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing3.xl,
    gap: spacing3.sm,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing3.sm,
  },
  title: { ...typography3.headlineLgMobile, fontSize: 22, textAlign: 'center' },
  subtitle: {
    ...typography3.bodyMd,
    color: colors3.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: spacing3.md,
  },
  actions: { width: '100%', maxWidth: 320, gap: spacing3.sm },
});
