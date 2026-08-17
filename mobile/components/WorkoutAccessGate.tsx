import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

/**
 * Caso A do gate de acesso a Treino: usuario sem Pro E sem Personal
 * Trainer ativo. Mesma tecnica de blur do ObscuredCard (BlurView
 * intensity=40 tint="dark"), adaptada pra cobrir a tela inteira em vez de
 * um card — ObscuredCard em si nao serve aqui porque so suporta um icone
 * de cadeado sem CTA, e este gate precisa de titulo/subtitulo + 2 botoes.
 *
 * children carrega o conteudo de fundo (mesmo padrao do ObscuredCard: uma
 * versao real da tela, borrada atras, nao um placeholder inventado) — o
 * proprio WorkoutScreen passa o estado vazio padrao de Treino como fundo.
 */
export function WorkoutAccessGate({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.wrapper}>
      <View pointerEvents="none">{children}</View>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.overlay}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={28} color={colors2.violet} />
        </View>
        <Text style={styles.title}>Acesso a treinos</Text>
        <Text style={styles.subtitle}>
          Assine o Tryv Pro para treinos gerados por IA, ou contrate um Personal Trainer para acompanhamento
          profissional.
        </Text>

        <View style={styles.actions}>
          <Button2 label="Assinar Tryv Pro" onPress={() => router.push('/subscriptions/pro')} />
          <Button2
            label="Procurar um profissional"
            variant="secondary"
            onPress={() => router.push('/trainers/select-type')}
          />
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
    padding: spacing2.xl,
    gap: spacing2.sm,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing2.sm,
  },
  title: { ...typography2.headlineLgMobile, fontSize: 22, textAlign: 'center' },
  subtitle: {
    ...typography2.bodyMd,
    color: colors2.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: spacing2.md,
  },
  actions: { width: '100%', maxWidth: 320, gap: spacing2.sm },
});
