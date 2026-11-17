import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { useVitality } from '@/hooks/useVitality';
import { isDevModeEnabled, setDevModeEnabled } from '@/services/devMode';
import { VITALITY_STATE_KEY } from '@/services/vitalityService';
import { formatVitalityDebug } from '@/services/vitalityDebugView';

/**
 * Depuracao da Vitalidade (MODO DESENVOLVEDOR): tudo o que entrou no calculo da ultima atualizacao. Fica escondido: so abre com o modo ligado (7 toques na linha de
 * versao em Configuracoes, no Perfil); sem ele, volta sozinha. Nao envia nada para lugar nenhum; so mostra o que ja esta no aparelho.
 */
export default function DevVitalityScreen() {
  const insets = useSafeAreaInsets();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const { vitality, load, fetchData, refreshing } = useVitality();

  useEffect(() => {
    let active = true;
    isDevModeEnabled().then((enabled) => {
      if (!active) return;
      setAllowed(enabled);
      if (!enabled) router.back();
    });
    return () => {
      active = false;
    };
  }, []);

  if (allowed !== true) {
    return (
      <ScreenBackground3>
        <View style={styles.center}>
          <ActivityIndicator color={colors3.primary} />
        </View>
      </ScreenBackground3>
    );
  }

  const sections = vitality ? formatVitalityDebug(vitality.debug) : [];

  const disable = async () => {
    await setDevModeEnabled(false);
    router.back();
  };

  const clearState = () => {
    Alert.alert('Limpar o estado do dia?', 'Apaga a base congelada, as referências e os totais guardados. A próxima atualização recalcula tudo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar',
        style: 'destructive',
        onPress: async () => {
          try {
            await AsyncStorage.removeItem(VITALITY_STATE_KEY);
          } catch {
            // sem armazenamento
          }
          void fetchData();
        },
      },
    ]);
  };

  return (
    <ScreenBackground3>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing3.md, paddingBottom: insets.bottom + spacing3.xl }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors3.onSurface} />
          </Pressable>
          <Text style={styles.title}>Depuração da Vitalidade</Text>
        </View>
        <Text style={styles.note}>Modo desenvolvedor. Estimativa de bem-estar; nada aqui sai do aparelho.</Text>

        <View style={styles.actions}>
          <Pressable style={styles.button} onPress={() => void fetchData()} disabled={refreshing} accessibilityRole="button">
            {refreshing ? <ActivityIndicator size="small" color={colors3.onPrimary} /> : <Text style={styles.buttonText}>Recalcular agora</Text>}
          </Pressable>
          <Pressable style={[styles.button, styles.buttonGhost]} onPress={clearState} accessibilityRole="button">
            <Text style={[styles.buttonText, styles.buttonGhostText]}>Limpar estado do dia</Text>
          </Pressable>
        </View>

        {load.kind === 'loading' && <ActivityIndicator color={colors3.primary} style={styles.loading} />}
        {load.kind === 'error' && <Text style={styles.note}>Não foi possível calcular. Toque em "Recalcular agora".</Text>}

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.rows.map((row) => (
              <View key={row.label} style={styles.row}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        ))}

        <Pressable onPress={() => void disable()} accessibilityRole="button" style={styles.disable} hitSlop={8}>
          <Text style={styles.disableText}>Desativar modo desenvolvedor</Text>
        </Pressable>
      </ScrollView>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing3.lg, gap: spacing3.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  title: { ...typography3.headlineMd, fontSize: 20, color: colors3.onSurface },
  note: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  actions: { flexDirection: 'row', gap: spacing3.sm },
  button: { flex: 1, minHeight: 44, borderRadius: radius3.pill, backgroundColor: colors3.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing3.md },
  buttonText: { ...typography3.bodyMd, fontSize: 14, fontWeight: '700', color: colors3.onPrimary },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors3.primary },
  buttonGhostText: { color: colors3.primary },
  loading: { marginVertical: spacing3.md },
  section: { backgroundColor: colors3.surfaceContainerLow, borderRadius: radius3.lg, padding: spacing3.md, gap: spacing3.xs },
  sectionTitle: { ...typography3.headlineMd, fontSize: 15, color: colors3.onSurface, marginBottom: spacing3.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing3.md },
  rowLabel: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant, flex: 1 },
  rowValue: { ...typography3.bodyMd, fontSize: 13, fontWeight: '700', color: colors3.onSurface, flexShrink: 1, textAlign: 'right' },
  disable: { alignItems: 'center', paddingVertical: spacing3.md },
  disableText: { ...typography3.bodyMd, fontSize: 14, color: colors3.error, fontWeight: '700' },
});
