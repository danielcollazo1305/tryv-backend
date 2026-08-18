import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Button2 } from '@/components/Button2';
import { ChoiceGroup2 } from '@/components/ChoiceGroup2';
import { TextField2 } from '@/components/TextField2';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { uploadMedia } from '@/services/media';
import { PostVisibility, createPost } from '@/services/social';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

type Stage = 'picking' | 'compose' | 'uploading' | 'saving';

// So Publico/Seguidores aqui (sem "Nao compartilhar") — diferente do
// seletor de 3 vias usado em meal/add.tsx e challenges/[id].tsx: esta
// tela existe especificamente pra publicar um post, "nao compartilhar"
// nao faz sentido como opcao do proprio fluxo de criacao.
const VISIBILITY_OPTIONS: { value: PostVisibility; label: string }[] = [
  { value: 'public', label: 'Publico' },
  { value: 'followers', label: 'Seguidores' },
];

export default function NewPostScreen() {
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>('picking');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [error, setError] = useState<string | null>(null);

  const handleTakePhoto = async () => {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Permissao de camera negada. Habilite nas configuracoes do celular.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setStage('compose');
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
      setImageUri(result.assets[0].uri);
      setStage('compose');
    }
  };

  const handleRetry = () => {
    setStage('picking');
    setImageUri(null);
    setError(null);
  };

  const handlePublish = async () => {
    if (!imageUri) return;
    setError(null);

    setStage('uploading');
    let mediaUrl: string;
    try {
      mediaUrl = await uploadMedia(imageUri, 'posts');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel enviar a foto, tente novamente.'));
      setStage('compose');
      return;
    }

    setStage('saving');
    try {
      await createPost({
        type: 'photo',
        caption: caption.trim() || undefined,
        media_url: mediaUrl,
        visibility,
      });
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel publicar o post.'));
      setStage('compose');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors2.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.headerTitle}>Novo post</Text>
        {stage === 'compose' ? (
          <Pressable onPress={handlePublish} hitSlop={8}>
            <Text style={styles.publishText}>Publicar</Text>
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!error && <Text style={styles.error}>{error}</Text>}

        {stage === 'picking' && (
          <View style={styles.pickButtons}>
            <Pressable style={styles.pickButton} onPress={handleTakePhoto}>
              <View style={styles.pickIconWrap}>
                <Ionicons name="camera" size={26} color={colors2.primary} />
              </View>
              <Text style={styles.pickButtonText}>Tirar foto</Text>
            </Pressable>
            <Pressable style={styles.pickButton} onPress={handlePickFromLibrary}>
              <View style={styles.pickIconWrap}>
                <Ionicons name="image" size={26} color={colors2.primary} />
              </View>
              <Text style={styles.pickButtonText}>Escolher da galeria</Text>
            </Pressable>
          </View>
        )}

        {(stage === 'compose' || stage === 'uploading' || stage === 'saving') && (
          <View style={styles.composeContainer}>
            <View style={styles.authorRow}>
              <Avatar initials={user ? getInitials(user.name) : '?'} size={40} />
              <View>
                <Text style={styles.authorName}>{user?.name ?? 'Voce'}</Text>
                <Text style={styles.visibilityHint}>
                  {visibility === 'public' ? 'Publico' : 'Seguidores'}
                </Text>
              </View>
            </View>

            {!!imageUri && <Image source={{ uri: imageUri }} style={styles.preview} />}

            <TextField2
              label="Legenda (opcional)"
              placeholder="O que voce esta treinando hoje?"
              value={caption}
              onChangeText={setCaption}
              multiline
              numberOfLines={3}
              style={styles.captionInput}
            />

            {/*
              Lacuna de dado: o mockup social-criar-post.html tem uma secao
              "Vincular Atividade" (linkar o post a uma corrida/treino
              recente). O payload real de criacao de post (PostCreatePayload
              em services/social.ts) nao tem campo pra isso — so o backend
              preenche reference_id em fluxos internos, criar um post pelo
              app nunca vincula uma atividade hoje. Omitido em vez de
              inventar essa selecao sem nenhum efeito real.
            */}

            <ChoiceGroup2
              label="Visibilidade"
              options={VISIBILITY_OPTIONS}
              value={visibility}
              onChange={setVisibility}
            />

            <Button2
              label={stage === 'uploading' ? 'Enviando foto...' : 'Publicar'}
              onPress={handlePublish}
              loading={stage === 'uploading' || stage === 'saving'}
            />
            <Button2
              label="Trocar foto"
              variant="secondary"
              onPress={handleRetry}
              disabled={stage === 'uploading' || stage === 'saving'}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors2.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  publishText: { ...typography2.labelCaps, color: colors2.primary },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.md },
  error: { color: colors2.danger, textAlign: 'center', marginBottom: spacing2.sm },

  pickButtons: { gap: spacing2.md, marginTop: spacing2.xl },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.md,
    backgroundColor: colors2.surfaceContainer,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderRadius: radius2.lg,
    padding: spacing2.lg,
  },
  pickIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickButtonText: { ...typography2.headlineMd, fontSize: 16 },

  composeContainer: { gap: spacing2.sm },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  authorName: { ...typography2.bodyMd, fontWeight: '600' },
  visibilityHint: { ...typography2.labelCaps, textTransform: 'none' },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius2.lg,
    backgroundColor: colors2.surfaceContainerHigh,
    marginTop: spacing2.sm,
  },
  captionInput: { minHeight: 70, textAlignVertical: 'top' },
});
