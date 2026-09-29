import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { uploadAvatarSelfie } from '@/services/user';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/**
 * Passo final OPCIONAL do wizard, depois que a conta ja foi criada e
 * logada (ver wiring em register-calories.tsx/register-estimate.tsx --
 * chamado via router.replace logo apos finishRegistration() resolver, com
 * onboardingInProgress=true segurando o guard de app/_layout.tsx em
 * (auth) enquanto essa tela estiver aberta).
 *
 * Mesmo padrao de escolha camera/galeria de app/meal/add.tsx (2 botoes na
 * tela, nao Alert.alert/ActionSheet) -- so o aspect ratio muda (1:1, pra
 * um retrato/avatar, em vez do 4:3 de foto de refeicao).
 *
 * Sucesso: refreshUser() (repopula o user inteiro com o avatar_url novo,
 * mesmo padrao de atualizacao ja usado no resto do app) e so DEPOIS
 * setOnboardingInProgress(false) -- o guard troca (auth) por (tabs)
 * sozinho nesse momento, sem navegacao manual (mesmo principio ja usado
 * no fim do wizard antes desta tela existir).
 */
export default function RegisterAvatarScreen() {
  const { refreshUser, setOnboardingInProgress } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateAvatar = async (uri: string) => {
    setLoading(true);
    setError(null);
    try {
      await uploadAvatarSelfie(uri);
      await refreshUser();
      setOnboardingInProgress(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel gerar seu avatar, tente novamente.'));
      setLoading(false);
    }
  };

  const handleTakePhoto = async () => {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Permissao de camera negada. Habilite nas configuracoes do celular.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets[0]) {
      generateAvatar(result.assets[0].uri);
    }
  };

  const handlePickFromLibrary = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Permissao de galeria negada. Habilite nas configuracoes do celular.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      generateAvatar(result.assets[0].uri);
    }
  };

  const handleSkip = () => {
    setOnboardingInProgress(false);
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv Fit</Text>
          <Text style={styles.title}>Última coisa</Text>
          <Text style={styles.subtitle}>
            Gere um retrato estilizado por IA a partir de uma foto do seu rosto — vira sua foto de perfil no app.
            Totalmente opcional, pode pular e fazer isso depois.
          </Text>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors3.primary} />
            <Text style={styles.loadingText}>Gerando seu avatar...</Text>
          </View>
        ) : (
          <View style={styles.pickButtons}>
            <Pressable style={styles.pickButton} onPress={handleTakePhoto}>
              <Ionicons name="camera" size={28} color={colors3.primary} />
              <Text style={styles.pickButtonText}>Tirar foto</Text>
            </Pressable>
            <Pressable style={styles.pickButton} onPress={handlePickFromLibrary}>
              <Ionicons name="images" size={28} color={colors3.primary} />
              <Text style={styles.pickButtonText}>Escolher da galeria</Text>
            </Pressable>
          </View>
        )}

        <Pressable onPress={handleSkip} disabled={loading} hitSlop={8} style={styles.skipLink}>
          <Text style={styles.skipLinkText}>Pular por enquanto</Text>
        </Pressable>
      </ScrollView>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing3.containerMargin, gap: spacing3.md },
  header: { alignItems: 'center', gap: spacing3.xs, marginBottom: spacing3.sm },
  logo: { ...typography3.displayLg, fontSize: 36, fontWeight: '800', color: colors3.primary },
  title: { ...typography3.headlineMd, fontSize: 20, textAlign: 'center', marginTop: spacing3.sm },
  subtitle: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
  error: { color: colors3.error, textAlign: 'center' },

  pickButtons: { gap: spacing3.md },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.md,
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    borderRadius: radius3.lg,
    padding: spacing3.lg,
  },
  pickButtonText: { ...typography3.headlineMd, fontSize: 16 },

  centered: { alignItems: 'center', paddingVertical: spacing3.xl },
  loadingText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginTop: spacing3.md },

  skipLink: { alignItems: 'center', marginTop: spacing3.md },
  skipLinkText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
});
