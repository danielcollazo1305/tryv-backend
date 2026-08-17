import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

export type BottomNavTab = 'home' | 'feed' | 'meals' | 'workout' | 'profile';

interface BottomNavProps {
  activeTab: BottomNavTab;
  onTabPress: (tab: BottomNavTab) => void;
}

/**
 * Design novo (liquiglass) so define 5 abas fixas, sempre nesta ordem:
 * Home, Feed, Refeicoes, Treino, Perfil. Icone do Feed e "rss_feed" no
 * Material Symbols (web) -> RN nao tem o font de Material Symbols, e todo
 * o resto do app ja usa Ionicons, entao mapeamos pro equivalente mais
 * proximo em vez de carregar uma segunda familia de icones so pra essa
 * aba. Ionicons NAO tem "rss"/"rss-outline" (so "logo-rss", sem variante
 * outline, pensado como logo de marca) — usamos "newspaper"/
 * "newspaper-outline", que tem os dois estados e encaixa bem pra "Feed".
 */
const TABS: { key: BottomNavTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'feed', label: 'Feed', icon: 'newspaper' },
  { key: 'meals', label: 'Refeições', icon: 'restaurant' },
  { key: 'workout', label: 'Treino', icon: 'barbell' },
  { key: 'profile', label: 'Perfil', icon: 'person' },
];

/**
 * Puramente apresentacional — nao se auto-posiciona como "fixed" (o
 * equivalente RN disso depende de onde e usado: dentro do `tabBar` custom
 * do Tabs do expo-router, ou posicionado manualmente numa tela solta).
 * Isso fica pra quando o componente for de fato conectado ao navigator
 * real (fora do escopo desta fase).
 */
export function BottomNav({ activeTab, onTabPress }: BottomNavProps) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabPress(tab.key)}
            style={[styles.item, isActive && styles.itemActive]}
            hitSlop={8}
          >
            <Ionicons
              name={isActive ? tab.icon : (`${tab.icon}-outline` as keyof typeof Ionicons.glyphMap)}
              size={22}
              color={isActive ? colors2.onPrimaryContainer : colors2.onSurfaceVariant}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing2.sm,
    paddingHorizontal: spacing2.sm,
    backgroundColor: 'rgba(14, 14, 14, 0.9)',
    borderTopLeftRadius: radius2.lg,
    borderTopRightRadius: radius2.lg,
    borderTopWidth: 1,
    borderTopColor: colors2.outlineVariant,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing2.xs,
    paddingHorizontal: spacing2.sm,
    borderRadius: radius2.pill,
    minWidth: 56,
  },
  itemActive: {
    backgroundColor: colors2.primaryContainer,
  },
  label: {
    ...typography2.labelCaps,
    fontSize: 10,
    color: colors2.onSurfaceVariant,
  },
  labelActive: {
    color: colors2.onPrimaryContainer,
  },
});
