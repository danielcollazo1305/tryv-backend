import React from 'react';
import {
  Image,
  ImageSourcePropType,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { radius3, spacing3, typography3 } from '@/constants/theme';

// "min-w-[280px] w-[80%]" do HTML de origem — responsivo, nao mais fixo
// 250x300 como no tema escuro anterior.
//
// CAUSA RAIZ de um bug anterior na tab bar (_layout.tsx), replicada aqui
// preventivamente: isso ERA `Dimensions.get('window').width` no escopo de
// MODULO (fora do componente), avaliado uma unica vez no momento em que o
// arquivo e importado — o Expo Router importa componentes bem cedo no
// boot do app, antes da ponte nativa entregar a medida real da janela,
// entao a leitura podia congelar em 0 (ou um valor errado) numa constante
// que nunca mais e recalculada. Aqui usamos `useWindowDimensions()`
// DENTRO do componente: sempre reflete a largura real no momento do
// render (e se recalcula sozinho numa rotacao de tela).
function useCardWidth(): number {
  const { width } = useWindowDimensions();
  return Math.max(280, Math.round(width * 0.8));
}

// Altura TOTAL do card inteiro — antes a altura nascia da soma de
// photoZone (aspectRatio) + panel (conteudo). Sem mais 2 zonas separadas,
// a altura passa a ser uma escolha direta (nao mais derivada), proxima da
// altura fixa que o card ja tinha no tema escuro anterior (250x300).
const CARD_HEIGHT = 320;

interface EditorialCardProps {
  image: ImageSourcePropType;
  /** Icone circular no canto da foto — sempre bg-primary no tema novo (nao mais 1 cor por card). */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  categoryLabel: string;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  onPress: () => void;
  ctaLabel?: string;
  /** Alternativa ao CTA — barra de progresso real + legenda (usado pelo slide de Desafios quando ha desafio ativo; o HTML de referencia so modela o estado "sem desafio ativo", que usa ctaLabel). */
  progress?: { percent: number; label: string };
  style?: StyleProp<ViewStyle>;
}

/**
 * Card editorial do carrossel "Para voce" da Home (Treino com IA /
 * Acompanhamento profissional / Desafios).
 *
 * MUDANCA DE ARQUITETURA (esta versao): o formato anterior tinha 2 zonas
 * empilhadas — `photoZone` (retangulo 1.79:1 fixo no topo) + `panel`
 * (caixa separada embaixo, fundo branco solido) — o que fazia a foto
 * aparecer "cortada" (photoZone estreito nao cabia a composicao inteira,
 * ex. corredores da foto "Desafios" ficavam fora, so sobrava ceu visivel).
 * Nao era bug de rendering, era a propria divisao em 2 zonas limitando
 * quanto da foto dava pra ver.
 *
 * Formato novo: 1 zona so — a foto cobre o card INTEIRO (fundo de
 * `wrapper` via `resizeMode="cover"`, ate atras de onde fica o texto),
 * com um `LinearGradient` tambem cobrindo o card inteiro (transparente no
 * topo ate escuro na base) garantindo legibilidade do texto, que fica
 * sobreposto na parte de baixo sem nenhuma caixa de fundo propria (o
 * gradiente ja da o contraste). Texto em branco (antes era escuro, pensado
 * pro fundo branco solido do panel que nao existe mais).
 */
export function EditorialCard({
  image,
  icon,
  categoryLabel,
  title,
  subtitle,
  accessibilityLabel,
  onPress,
  ctaLabel,
  progress,
  style,
}: EditorialCardProps) {
  const cardWidth = useCardWidth();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.wrapper, { width: cardWidth, height: CARD_HEIGHT }, style]}
    >
      <Image
        source={image}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      {/*
        Gradiente cobrindo o card INTEIRO (nao mais so a photoZone) —
        opacidade moderada no ponto mais escuro (0.62, nao mais que isso):
        alta o suficiente pra legibilidade do texto branco sobre qualquer
        foto, sem repetir o problema ja visto antes de escurecer demais a
        ponto da foto "sumir". Comeca ja com um pouco de escurecimento no
        topo (0.08, nao 0 puro) pra o badge de icone continuar legivel
        mesmo quando a foto tiver ceu claro ali.
      */}
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.08)', 'rgba(0, 0, 0, 0.32)', 'rgba(0, 0, 0, 0.62)']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.iconBadge}>
        <Ionicons name={icon} size={16} color="#ffffff" />
      </View>

      <View style={styles.content}>
        <Text style={styles.category}>{categoryLabel}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>

        {progress ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress.percent * 100)}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{progress.label}</Text>
          </View>
        ) : (
          !!ctaLabel && (
            <View style={styles.cta}>
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            </View>
          )
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius3.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    // Fundo solido como fallback enquanto a foto carrega (a Image e
    // absoluteFillObject por cima) — cinza escuro neutro, nunca aparece
    // por muito tempo nem destoa caso apareca por uma fracao de segundo.
    backgroundColor: '#2a2a2a',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    justifyContent: 'flex-end',
  },
  iconBadge: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sem fundo proprio (nem cor solida nem translucida) — o card inteiro e
  // a foto + gradiente, o texto so fica posicionado na parte de baixo via
  // `justifyContent: 'flex-end'` do wrapper.
  content: {
    padding: spacing3.lg - 4,
  },
  category: { ...typography3.labelSm, fontSize: 10, letterSpacing: 1.2, color: 'rgba(255, 255, 255, 0.85)', marginBottom: spacing3.xs },
  title: { ...typography3.headlineMd, fontSize: 20, lineHeight: 26, marginBottom: spacing3.xs, color: '#ffffff' },
  subtitle: { ...typography3.bodyMd, fontSize: 14, lineHeight: 20, color: 'rgba(255, 255, 255, 0.85)', marginBottom: spacing3.md },
  cta: {
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: spacing3.md,
    borderRadius: radius3.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  ctaText: { ...typography3.labelSm, fontSize: 12, color: '#ffffff' },
  progressWrap: { gap: spacing3.xs },
  progressTrack: {
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 3, backgroundColor: '#ffffff' },
  progressLabel: { ...typography3.labelSm, fontSize: 12, color: 'rgba(255, 255, 255, 0.85)' },
});
