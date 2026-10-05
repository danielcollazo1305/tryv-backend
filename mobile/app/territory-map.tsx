import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { TerritoryMap } from '@/components/TerritoryMap';
import { TerritoryCity, getTerritory } from '@/services/squads';
import { colors3, spacing3, typography3 } from '@/constants/theme';

type Stage = 'loading' | 'ready' | 'error';

/**
 * Mapa de territorio (Squad/Ranking) em tela cheia -- push normal a partir de
 * ranking.tsx, fora de (auth)/(tabs) (so faz sentido logado, registrada
 * no grupo protegido de app/_layout.tsx). O mapa em si (pinos por squad
 * dominante, localizacao do usuario, zoom de bairro, estilo claro) vive em
 * components/TerritoryMap.tsx, compartilhado com o card da aba Ranking; esta
 * tela so busca GET /territory e cuida do cabecalho e dos estados de
 * loading/erro.
 */
export default function TerritoryMapScreen() {
  const [stage, setStage] = useState<Stage>('loading');
  const [cities, setCities] = useState<TerritoryCity[]>([]);

  const load = useCallback(async () => {
    setStage('loading');
    try {
      setCities(await getTerritory());
      setStage('ready');
    } catch {
      setStage('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Território</Text>
        <View style={styles.headerSpacer} />
      </View>

      {stage === 'loading' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors3.primary} />
        </View>
      )}

      {stage === 'error' && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Não foi possível carregar o território.</Text>
          <Button3 label="Tentar de novo" onPress={load} />
        </View>
      )}

      {stage === 'ready' && <TerritoryMap cities={cities} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
    backgroundColor: colors3.background,
  },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  headerSpacer: { width: 24 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing3.md, padding: spacing3.lg },
  errorText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
});
