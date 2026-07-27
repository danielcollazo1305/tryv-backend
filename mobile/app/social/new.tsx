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

import { Button } from '@/components/Button';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { TextField } from '@/components/TextField';
import { getApiErrorMessage } from '@/services/api';
import { PostVisibility, createPost } from '@/services/social';
import { colors, radius, spacing, typography } from '@/constants/theme';

type Stage = 'picking' | 'compose' | 'saving';

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string }[] = [
  { value: 'public', label: 'Publico' },
  { value: 'private', label: 'Privado' },
];

export default function NewPostScreen() {
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
    setStage('saving');
    setError(null);
    try {
      await createPost({
        type: 'photo',
        caption: caption.trim() || undefined,
        media_url: imageUri,
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
        <Text style={styles.title}>Novo post</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!error && <Text style={styles.error}>{error}</Text>}

        {stage === 'picking' && (
          <View style={styles.pickButtons}>
            <Pressable style={styles.pickButton} onPress={handleTakePhoto}>
              <Ionicons name="camera" size={28} color={colors.accent} />
              <Text style={styles.pickButtonText}>Tirar foto</Text>
            </Pressable>
            <Pressable style={styles.pickButton} onPress={handlePickFromLibrary}>
              <Ionicons name="images" size={28} color={colors.accent} />
              <Text style={styles.pickButtonText}>Escolher da galeria</Text>
            </Pressable>
          </View>
        )}

        {(stage === 'compose' || stage === 'saving') && (
          <View style={styles.composeContainer}>
            {!!imageUri && <Image source={{ uri: imageUri }} style={styles.preview} />}

            <TextField
              label="Legenda (opcional)"
              placeholder="Escreva algo sobre esse momento..."
              value={caption}
              onChangeText={setCaption}
              multiline
              numberOfLines={3}
              style={styles.captionInput}
            />

            <ChoiceGroup
              label="Visibilidade"
              options={VISIBILITY_OPTIONS}
              value={visibility}
              onChange={setVisibility}
            />

            <Button label="Publicar" onPress={handlePublish} loading={stage === 'saving'} />
            <Button
              label="Trocar foto"
              variant="secondary"
              onPress={handleRetry}
              disabled={stage === 'saving'}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h2 },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  error: { color: colors.danger, textAlign: 'center', marginBottom: spacing.sm },

  pickButtons: { gap: spacing.md, marginTop: spacing.xl },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  pickButtonText: { ...typography.h3 },

  composeContainer: { gap: spacing.sm },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    marginBottom: spacing.sm,
  },
  captionInput: { minHeight: 70, textAlignVertical: 'top' },
});
