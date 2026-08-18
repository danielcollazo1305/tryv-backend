import React from 'react';
import { Stack } from 'expo-router';

import { RegisterDraftProvider } from '@/context/RegisterDraftContext';
import { colors2 } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <RegisterDraftProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors2.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="register" />
        <Stack.Screen name="register-body" />
        <Stack.Screen name="register-goal" />
        <Stack.Screen name="register-frequency" />
        <Stack.Screen name="register-training" />
        <Stack.Screen name="register-calories" />
        <Stack.Screen name="register-estimate" />
      </Stack>
    </RegisterDraftProvider>
  );
}
