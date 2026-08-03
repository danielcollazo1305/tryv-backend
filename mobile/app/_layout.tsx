import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { colors } from '@/constants/theme';

export default function RootLayout() {
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
        <Stack.Screen name="workout-plan/generate" options={{ presentation: 'modal' }} />
        <Stack.Screen name="activity/index" />
        <Stack.Screen name="activity/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="activity/[id]" />
        <Stack.Screen name="activity/healthkit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/index" />
        <Stack.Screen name="trainers/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/register" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/me" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/students" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/live/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="social/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="social/[userId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="social/post/[postId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="social/comments/[postId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="challenges/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="challenges/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="weight/new" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!token}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
