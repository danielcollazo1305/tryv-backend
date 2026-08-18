import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

import { AuthProvider, useAuth } from '@/context/AuthContext';
// Efeito colateral: registra a location task de segundo plano (TaskManager.defineTask)
// incondicionalmente no boot do app — ver comentario em backgroundLocation.ts pra explicacao.
import '@/services/backgroundLocation';
import { colors, fontsToLoad2 } from '@/constants/theme';

export default function RootLayout() {
  // Fontes do design novo (liquiglass) — telas ainda no sistema antigo nao
  // dependem disso (usam a fonte padrao do sistema), entao nao ha regressao
  // visual pra elas enquanto isso carrega; so atrasa o primeiro frame em
  // ~alguns ms num dispositivo real (fontes ja ficam em cache depois disso).
  const [fontsLoaded] = useFonts(fontsToLoad2);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!!token}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="meal/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="meal/photos" options={{ presentation: 'modal' }} />
        <Stack.Screen name="workout-plan/generate" options={{ presentation: 'modal' }} />
        <Stack.Screen name="activity/index" />
        <Stack.Screen name="activity/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="activity/[id]" />
        <Stack.Screen name="activity/healthkit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/index" />
        <Stack.Screen name="trainers/select-type" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/register" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/me" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/students" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/live/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="social/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="social/discover" options={{ presentation: 'modal' }} />
        <Stack.Screen name="social/follows" options={{ presentation: 'modal' }} />
        <Stack.Screen name="social/[userId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="social/post/[postId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="social/comments/[postId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="challenges/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="challenges/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="challenges/category/[category]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="weight/new" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!token}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
