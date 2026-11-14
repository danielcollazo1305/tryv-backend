import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { AvatarConsentModal } from '@/components/AvatarConsentModal';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { AVATAR_CONSENT_VERSION, AVATAR_LOADING_TEXT, AVATAR_MINOR_MESSAGE, isAvatarRestricted } from '@/services/avatarFlow';
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
 * Antes de qualquer envio, aviso de consentimento (a foto vai para a OpenAI, fica guardada em local privado e a imagem escolhida aparece para
 * outras pessoas). Menores de 18 e quem nao informou a data de nascimento nao enviam foto (mensagem clara, so "Continuar"). O passo pode ser pulado.
 *
 * Sucesso: refreshUser() (repopula o user inteiro com o avatar_url novo,
 * mesmo padrao de atualizacao ja usado no resto do app) e so DEPOIS
 * setOnboardingInProgress(false) -- o guard troca (auth) por (tabs)
 * sozinho nesse momento, sem navegacao manual (mesmo principio ja usado
 * no fim do wizard antes desta tela existir).
 */
export default function RegisterAvatarScreen() {
  const { user, refreshUser, setOnboardingInProgress } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [pendingPick, setPendingPick] = useState<'camera' | 'library' | null>(null);
  const restricted = isAvatarRestricted(user?.date_of_birth);

  const generateAvatar = async (uri: string) => {
    setLoading(true);
    setError(null);
    try {
      await uploadAvatarSelfie(uri, AVATAR_CONSENT_VERSION);
      await refreshUser();
      setOnboardingInProgress(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível gerar seu avatar, tente novamente.'));
      setLoading(false);
    }
  };

  // Nada e enviado antes do aceite: o toque em "Tirar foto"/"Escolher da galeria" abre o aviso primeiro.
  const requestPick = (kind: 'camera' | 'library') => {
    setError(null);
    if (consentAccepted) {
      if (kind === 'camera') handleTakePhoto();
      else handlePickFromLibrary();
      return;
    }
    setPendingPick(kind);
    setConsentVisible(true);
  };

  const handleConsentAccept = () => {
    const kind = pendingPick;
    setConsentAccepted(true);
    setConsentVisible(false);
    setPendingPick(null);
    if (kind === 'camera') handleTakePhoto();
    else if (kind === 'library') handlePickFromLibrary();
  };

  const handleConsentDecline = () => {
    setConsentVisible(false);
    setPendingPick(null);
  };

  const handleTakePhoto = async () => {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Permissão de câmera negada. Habilite nas configurações do celular.');
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
      setError('Permissão de galeria negada. Habilite nas configurações do celular.');
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
            Crie um avatar em estilo anime por IA a partir de uma foto do seu rosto e escolha usar o avatar ou a foto como imagem de
            perfil. Totalmente opcional, pode pular e fazer isso depois.
          </Text>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors3.primary} />
            <Text style={styles.loadingText}>{AVATAR_LOADING_TEXT}</Text>
          </View>
        ) : restricted ? (
          <Text style={styles.restricted} accessibilityRole="alert">
            {AVATAR_MINOR_MESSAGE}
          </Text>
        ) : (
          <View style={styles.pickButtons}>
            <Pressable style={styles.pickButton} onPress={() => requestPick('camera')}>
              <Ionicons name="camera" size={28} color={colors3.primary} />
              <Text style={styles.pickButtonText}>Tirar foto</Text>
            </Pressable>
            <Pressable style={styles.pickButton} onPress={() => requestPick('library')}>
              <Ionicons name="images" size={28} color={colors3.primary} />
              <Text style={styles.pickButtonText}>Escolher da galeria</Text>
            </Pressable>
          </View>
        )}

        <Pressable onPress={handleSkip} disabled={loading} hitSlop={8} style={styles.skipLink}>
          <Text style={styles.skipLinkText}>{restricted ? 'Continuar' : 'Pular por enquanto'}</Text>
        </Pressable>
      </ScrollView>
      <AvatarConsentModal visible={consentVisible} onAccept={handleConsentAccept} onDecline={handleConsentDecline} />
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
  restricted: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },

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
