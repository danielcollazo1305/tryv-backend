import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/**
 * Sem arte propria pras 2 categorias (nao existe imagem de capa pronta pra
 * "Musculacao/Corrida"/"Alimentacao", diferente dos cards com foto da Home)
 * — usa o mesmo padrao de card com icone ja usado nas opcoes do Perfil, em
 * vez de forcar ImageCoverCard sem imagem de verdade.
 */
function OfficialCategories() {
  return (
    <View style={styles.appTabContent}>
      <Pressable
        onPress={() => router.push({ pathname: '/challenges/category/[category]', params: { category: 'musculacao_corrida' } })}
      >
        <GlassCard variant="card" style={styles.categoryCard}>
          <View style={styles.categoryIconWrap}>
            <Ionicons name="barbell" size={24} color={colors3.primary} />
          </View>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryTitle}>Musculação/Corrida</Text>
            <Text style={styles.categorySubtitle}>Desafios mensais oficiais do Tryv Fit de treino e corrida</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
        </GlassCard>
      </Pressable>

      <Pressable
        onPress={() => router.push({ pathname: '/challenges/category/[category]', params: { category: 'alimentacao' } })}
      >
        <GlassCard variant="card" style={styles.categoryCard}>
          <View style={styles.categoryIconWrap}>
            <Ionicons name="restaurant" size={24} color={colors3.primary} />
          </View>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryTitle}>Alimentação</Text>
            <Text style={styles.categorySubtitle}>Desafios mensais oficiais do Tryv Fit de alimentação</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
        </GlassCard>
      </Pressable>
    </View>
  );
}

interface ChallengesViewProps {
  /** Mantida so porque quem monta a view (feed.tsx) ainda a passa; nao tem mais efeito (a unica lista agora e estatica). */
  active?: boolean;
}

/** Conteudo da aba "Desafios" do Social: so os desafios oficiais do Tryv Fit, por categoria. Sem cabecalho proprio. */
export function ChallengesView(_props: ChallengesViewProps) {
  return (
    <View style={styles.flex}>
      <OfficialCategories />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  appTabContent: { padding: spacing3.containerMargin, paddingTop: spacing3.sm, gap: spacing3.md },
  categoryCard: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  categoryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius3.md,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: { flex: 1, gap: 4 },
  categoryTitle: { ...typography3.bodyMd, fontSize: 16, fontWeight: '700' },
  categorySubtitle: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
});
