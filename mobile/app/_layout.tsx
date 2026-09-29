import React, { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { WorkoutSessionDraftProvider } from '@/context/WorkoutSessionDraftContext';
import { ActiveWorkoutBanner } from '@/components/ActiveWorkoutBanner';
// Efeito colateral: registra a location task de segundo plano (TaskManager.defineTask)
// incondicionalmente no boot do app — ver comentario em backgroundLocation.ts pra explicacao.
import '@/services/backgroundLocation';
import { runAutoImport, startBackgroundImportTrigger } from '@/services/workoutAutoImport';
import { colors, colors3, fontsToLoad2 } from '@/constants/theme';

export default function RootLayout() {
  // Fontes do design novo (liquiglass) — telas ainda no sistema antigo nao
  // dependem disso (usam a fonte padrao do sistema), entao nao ha regressao
  // visual pra elas enquanto isso carrega; so atrasa o primeiro frame em
  // ~alguns ms num dispositivo real (fontes ja ficam em cache depois disso).
  const [fontsLoaded] = useFonts(fontsToLoad2);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors3.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors3.primary} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <WorkoutSessionDraftProvider>
        <StatusBar style="light" />
        <RootNavigator />
        {/* Irmao do <Stack>, nao dentro de (tabs)/_layout.tsx -- precisa
            aparecer tanto nas telas de aba quanto nas empilhadas fora
            delas (ex: activity/[id], weight/index). Renderizado DEPOIS de
            RootNavigator de proposito, pra ficar por cima na ordem natural
            de empilhamento do RN (sem precisar de Portal). */}
        <ActiveWorkoutBanner />
      </WorkoutSessionDraftProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { token, isLoading, onboardingInProgress } = useAuth();

  // Fases B+C da sincronizacao automatica de treinos (Apple Health/Health
  // Connect, ver services/workoutAutoImport.ts). runAutoImport() cobre os 2
  // SOs sozinho (decide HealthKit vs Health Connect via services/health.ts)
  // e nunca rejeita (loga e devolve um resultado vazio em qualquer erro) --
  // seguro chamar "fire-and-forget", sem travar a UI esperando resposta.
  //
  // Fase B -- AppState, primeiro plano: (1) uma vez no mount, cobrindo
  // abertura fria do app (ele ja nasce 'active', sem disparar nenhum evento
  // de MUDANCA do AppState -- so escutar 'change' perderia esse caso); (2)
  // toda transicao de AppState pra 'active' depois disso (app minimizado e
  // reaberto).
  //
  // Fase C -- HKObserverQuery + background delivery, so iOS: registra (via
  // startBackgroundImportTrigger, ver comentario la) o gatilho nativo que
  // dispara runAutoImport('background') quando o sistema entrega uma
  // atualizacao de treino, com o app aberto OU relancado em segundo plano
  // pelo iOS -- sem nenhum toque do usuario. Health Connect (Android) nao
  // tem gatilho de segundo plano nesta fase (Fase D, bloqueada, fora de
  // escopo) -- startBackgroundImportTrigger ja e no-op la.
  //
  // Ambas so rodam com sessao ativa (token) -- sem login nao ha pra onde
  // importar (runAutoImport ja sairia em silencio sozinho por causa disso,
  // ver ensureAuthToken la dentro, mas checar aqui evita a chamada a toa).
  useEffect(() => {
    if (!token) return;

    runAutoImport('foreground');
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') runAutoImport('foreground');
    });

    let cancelled = false;
    let removeBackgroundTrigger: (() => void) | undefined;
    startBackgroundImportTrigger().then((remove) => {
      if (cancelled) {
        remove();
        return;
      }
      removeBackgroundTrigger = remove;
    });

    return () => {
      cancelled = true;
      subscription.remove();
      removeBackgroundTrigger?.();
    };
  }, [token]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors3.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors3.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      {/*
        onboardingInProgress adia a troca automatica (auth) -> (tabs) --
        sem isso, um passo extra do wizard depois de finishRegistration()
        (token ja setado ali dentro) perderia a corrida com este guard
        reativo e seria descartado antes de aparecer. Ver AuthContext.tsx.
      */}
      <Stack.Protected guard={!!token && !onboardingInProgress}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="meal/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="meal/photos" options={{ presentation: 'modal' }} />
        <Stack.Screen name="workout-plan/generate" options={{ presentation: 'modal' }} />
        <Stack.Screen name="activity/index" />
        <Stack.Screen name="activity/progress" />
        <Stack.Screen name="activity/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="activity/[id]" />
        <Stack.Screen name="activity/healthkit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="health/[metric]" />
        <Stack.Screen name="trainers/index" />
        <Stack.Screen name="trainers/select-type" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/register" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/me" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/students" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trainers/students/[studentId]/workout-plan" options={{ presentation: 'modal' }} />
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
        <Stack.Screen name="weight/index" />
        <Stack.Screen name="weight/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="territory-map" />
        <Stack.Screen name="export-pdf" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!token || onboardingInProgress}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
