import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

const PRO_ROUTE = '/subscriptions/pro';

// Tom de voz de subscriptions/pro.tsx ("Desbloqueie ..."). A lista de
// beneficios e a tabela comparativa vivem SO la -- aqui so o convite.
const DEFAULT_TITLE = 'Recurso do Tryv Fit Pro';
const DEFAULT_SUBTITLE = 'Assine o Tryv Fit Pro para desbloquear este recurso.';
const FULLSCREEN_CTA = 'Assinar Tryv Fit Pro';
const CARD_CTA = 'Desbloquear com Pro';

interface FullscreenProps {
  variant: 'fullscreen';
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

interface CardProps {
  variant: 'card';
  /** Raio do recorte do blur -- acompanhe o raio do conteudo real por baixo. */
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

type ProGateProps = FullscreenProps | CardProps;

/**
 * Aviso visual de recurso Pro: borra o conteudo (uma versao real dele, nao um
 * placeholder inventado) e mostra um convite que leva a /subscriptions/pro.
 *
 * Quem usa decide QUANDO bloquear -- este componente so desenha o bloqueio.
 * Bloqueie so com `isPro === false` (useAuth): `null` significa "ainda
 * carregando / a busca falhou", e uma falha de rede nao pode virar paywall.
 *
 * - `fullscreen`: cobre a tela inteira, com cadeado, titulo, subtitulo e
 *   botao. Substitui WorkoutAccessGate.
 * - `card`: borra so o bloco filho e sobrepoe um botao pequeno. Substitui o
 *   uso de ObscuredCard + botao solto na aba Treino (ObscuredCard em si fica
 *   para "nao existe dado pra mostrar", que nao e paywall).
 *
 * Os children ficam sem toque (pointerEvents="none") nos dois casos.
 */
export function ProGate(props: ProGateProps) {
  if (props.variant === 'fullscreen') {
    const { title = DEFAULT_TITLE, subtitle = DEFAULT_SUBTITLE, children } = props;
    return (
      <View style={styles.fullscreenWrapper}>
        <View pointerEvents="none">{children}</View>
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFillObject} />
        <View style={styles.fullscreenOverlay}>
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={28} color={colors3.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.actions}>
            <Button3 label={FULLSCREEN_CTA} onPress={() => router.push(PRO_ROUTE)} />
          </View>
        </View>
      </View>
    );
  }

  const { children, borderRadius = radius3.md, style } = props;
  return (
    <View style={[styles.cardWrapper, { borderRadius }, style]}>
      <View pointerEvents="none">{children}</View>
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFillObject} />
      <View style={styles.cardOverlay}>
        <Pressable
          onPress={() => router.push(PRO_ROUTE)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={CARD_CTA}
          style={({ pressed }) => [styles.cardButton, pressed && styles.cardButtonPressed]}
        >
          <Ionicons name="lock-closed" size={14} color={colors3.onPrimary} />
          <Text style={styles.cardButtonLabel}>{CARD_CTA}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenWrapper: { flex: 1 },
  fullscreenOverlay: {
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

  cardWrapper: { overflow: 'hidden', position: 'relative' },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.xs + 2,
    paddingVertical: spacing3.sm,
    paddingHorizontal: spacing3.md,
    borderRadius: radius3.pill,
    backgroundColor: colors3.primary,
  },
  cardButtonPressed: { opacity: 0.85 },
  cardButtonLabel: { ...typography3.labelMd, color: colors3.onPrimary },
});
