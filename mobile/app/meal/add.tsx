import React, { useState } from 'react';
import {
  ActivityIndicator,
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

import { Badge } from '@/components/Badge';
import { Button2 } from '@/components/Button2';
import { ChoiceGroup2 } from '@/components/ChoiceGroup2';
import { TextField2 } from '@/components/TextField2';
import { getApiErrorMessage } from '@/services/api';
import { MealAnalysis, analyzeMealPhoto, createMeal } from '@/services/meals';
import { uploadMedia } from '@/services/media';
import { PostVisibility, SHARE_VISIBILITY_OPTIONS, ShareVisibility, createPost } from '@/services/social';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

type Stage = 'picking' | 'analyzing' | 'reviewing' | 'uploading' | 'saving';
type Mode = 'photo' | 'manual';

const CONFIDENCE_LABEL: Record<string, string> = {
  alta: 'Confianca alta',
  media: 'Confianca media',
  baixa: 'Confianca baixa',
};

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'photo', label: 'Foto' },
  { value: 'manual', label: 'Manual' },
];

/** null = vazio (campo opcional), undefined = preenchido mas invalido. */
function parseOptionalNonNegative(text: string): number | null | undefined {
  if (!text.trim()) return null;
  const value = Number(text.replace(',', '.'));
  return Number.isNaN(value) || value < 0 ? undefined : value;
}

export default function AddMealScreen() {
  const [mode, setMode] = useState<Mode>('photo');

  const [stage, setStage] = useState<Stage>('picking');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  const [manualDescription, setManualDescription] = useState('');
  const [manualWeight, setManualWeight] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  // 'none' por padrao — registro de refeicao nao gera post nenhum (so
  // contagem de nutrientes) a menos que o usuario opte explicitamente por
  // compartilhar, agora com 3 niveis (nao compartilhar / seguidores /
  // publico) em vez do antigo sim/nao binario.
  const [shareVisibility, setShareVisibility] = useState<ShareVisibility>('none');

  // Falha ao compartilhar no Feed nunca desfaz nem bloqueia o registro da
  // refeicao, que ja foi salvo com sucesso antes disso rodar — mesmo
  // padrao de acao secundaria "fire and forget" ja usado em outros lugares
  // do app (ex: syncRecentHeartRate em HealthSummaryCard).
  const shareMealToFeed = (visibility: PostVisibility, caption: string, mediaUrl?: string) => {
    createPost({
      type: mediaUrl ? 'photo' : 'progress',
      caption: caption || undefined,
      media_url: mediaUrl ?? null,
      visibility,
    }).catch(() => {});
  };

  const runAnalysis = async (uri: string) => {
    setImageUri(uri);
    setStage('analyzing');
    setError(null);
    try {
      const result = await analyzeMealPhoto(uri);
      setAnalysis(result);
      setCalories(String(Math.round(result.calories)));
      setProtein(String(Math.round(result.protein)));
      setCarbs(String(Math.round(result.carbs)));
      setFat(String(Math.round(result.fat)));
      setStage('reviewing');
    } catch (err) {
      setError(
        getApiErrorMessage(err, 'Nao foi possivel analisar a foto, tente novamente com uma imagem mais nitida.')
      );
      setStage('picking');
    }
  };

  const handleTakePhoto = async () => {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Permissao de camera negada. Habilite nas configuracoes do celular.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [4, 3] });
    if (!result.canceled && result.assets[0]) {
      runAnalysis(result.assets[0].uri);
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
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      runAnalysis(result.assets[0].uri);
    }
  };

  const handleConfirm = async () => {
    if (!analysis || !imageUri) return;
    setError(null);

    setStage('uploading');
    let photoUrl: string;
    try {
      photoUrl = await uploadMedia(imageUri, 'meals');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel enviar a foto, tente novamente.'));
      setStage('reviewing');
      return;
    }

    setStage('saving');
    try {
      await createMeal({
        photo_url: photoUrl,
        description: analysis.description,
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
      });
      if (shareVisibility !== 'none') shareMealToFeed(shareVisibility, analysis.description, photoUrl);
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar a refeicao.'));
      setStage('reviewing');
    }
  };

  const handleRetry = () => {
    setStage('picking');
    setImageUri(null);
    setAnalysis(null);
    setError(null);
  };

  const handleSaveManual = async () => {
    setError(null);

    const trimmedDescription = manualDescription.trim();
    if (!trimmedDescription) {
      setError('Descreva o alimento.');
      return;
    }

    const caloriesValue = Number(manualCalories.replace(',', '.'));
    if (!manualCalories.trim() || Number.isNaN(caloriesValue) || caloriesValue < 0) {
      setError('Informe um valor valido de calorias.');
      return;
    }

    const proteinValue = parseOptionalNonNegative(manualProtein);
    const carbsValue = parseOptionalNonNegative(manualCarbs);
    const fatValue = parseOptionalNonNegative(manualFat);
    if (proteinValue === undefined || carbsValue === undefined || fatValue === undefined) {
      setError('Proteina, carboidrato e gordura devem ser numeros validos (0 ou mais).');
      return;
    }

    // Peso/quantidade e so uma referencia visual pro usuario — nao entra em
    // nenhum calculo, entao basta anexar ao texto da descricao em vez de
    // criar uma coluna nova so pra isso.
    const trimmedWeight = manualWeight.trim();
    const description = trimmedWeight ? `${trimmedDescription} (${trimmedWeight})` : trimmedDescription;

    setManualSaving(true);
    try {
      await createMeal({
        photo_url: null,
        description,
        calories: caloriesValue,
        protein: proteinValue,
        carbs: carbsValue,
        fat: fatValue,
      });
      if (shareVisibility !== 'none') shareMealToFeed(shareVisibility, description);
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar a refeicao.'));
    } finally {
      setManualSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>Nova refeicao</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors2.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {(mode === 'manual' || stage === 'picking') && !manualSaving && (
          <ChoiceGroup2 label="Como registrar" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {mode === 'photo' && stage === 'picking' && (
          <View style={styles.photoSection}>
            <View style={styles.photoSectionHeader}>
              <Text style={styles.photoSectionTitle}>Registrar por foto</Text>
              <Badge label="IA" variant="primary" />
            </View>
            <View style={styles.pickButtons}>
              <Pressable style={styles.pickButton} onPress={handleTakePhoto}>
                <Ionicons name="camera" size={28} color={colors2.primary} />
                <Text style={styles.pickButtonText}>Tirar foto</Text>
              </Pressable>
              <Pressable style={styles.pickButton} onPress={handlePickFromLibrary}>
                <Ionicons name="images" size={28} color={colors2.primary} />
                <Text style={styles.pickButtonText}>Escolher da galeria</Text>
              </Pressable>
            </View>
          </View>
        )}

        {mode === 'photo' && stage === 'analyzing' && (
          <View style={styles.centered}>
            {!!imageUri && <Image source={{ uri: imageUri }} style={styles.previewLarge} />}
            <ActivityIndicator size="large" color={colors2.violet} style={styles.analyzingSpinner} />
            <Text style={styles.analyzingText}>Analisando sua refeicao...</Text>
          </View>
        )}

        {mode === 'photo' && (stage === 'reviewing' || stage === 'uploading' || stage === 'saving') && analysis && (
          <View style={styles.reviewContainer}>
            {!!imageUri && <Image source={{ uri: imageUri }} style={styles.previewLarge} />}

            <View style={styles.descriptionRow}>
              <Text style={styles.description}>{analysis.description}</Text>
              <Badge label="IA" variant="primary" />
            </View>
            <Text style={styles.confidence}>
              {CONFIDENCE_LABEL[analysis.confidence] ?? `Confianca: ${analysis.confidence}`}
            </Text>

            <TextField2 label="Calorias (kcal)" keyboardType="decimal-pad" value={calories} onChangeText={setCalories} />
            <TextField2 label="Proteina (g)" keyboardType="decimal-pad" value={protein} onChangeText={setProtein} />
            <TextField2 label="Carboidrato (g)" keyboardType="decimal-pad" value={carbs} onChangeText={setCarbs} />
            <TextField2 label="Gordura (g)" keyboardType="decimal-pad" value={fat} onChangeText={setFat} />

            <ChoiceGroup2
              label="Compartilhar no Feed"
              options={SHARE_VISIBILITY_OPTIONS}
              value={shareVisibility}
              onChange={setShareVisibility}
            />

            <Button2
              label={stage === 'uploading' ? 'Enviando foto...' : 'Confirmar'}
              onPress={handleConfirm}
              loading={stage === 'uploading' || stage === 'saving'}
            />
            <Button2
              label="Tirar outra foto"
              variant="secondary"
              onPress={handleRetry}
              disabled={stage === 'uploading' || stage === 'saving'}
            />
          </View>
        )}

        {mode === 'manual' && (
          <View style={styles.reviewContainer}>
            <TextField2
              label="Descricao do alimento"
              placeholder="Ex: Peito de frango grelhado"
              value={manualDescription}
              onChangeText={setManualDescription}
            />
            <TextField2
              label="Peso/quantidade (opcional)"
              placeholder="Ex: 150g"
              value={manualWeight}
              onChangeText={setManualWeight}
            />
            <TextField2
              label="Calorias (kcal)"
              placeholder="Ex: 250"
              keyboardType="decimal-pad"
              value={manualCalories}
              onChangeText={setManualCalories}
            />
            <TextField2
              label="Proteina (g) — opcional"
              placeholder="Ex: 40"
              keyboardType="decimal-pad"
              value={manualProtein}
              onChangeText={setManualProtein}
            />
            <TextField2
              label="Carboidrato (g) — opcional"
              placeholder="Ex: 0"
              keyboardType="decimal-pad"
              value={manualCarbs}
              onChangeText={setManualCarbs}
            />
            <TextField2
              label="Gordura (g) — opcional"
              placeholder="Ex: 6"
              keyboardType="decimal-pad"
              value={manualFat}
              onChangeText={setManualFat}
            />

            <ChoiceGroup2
              label="Compartilhar no Feed"
              options={SHARE_VISIBILITY_OPTIONS}
              value={shareVisibility}
              onChange={setShareVisibility}
            />

            <Button2 label="Salvar refeicao" onPress={handleSaveManual} loading={manualSaving} />
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
  title: { ...typography2.headlineMd },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.md },
  error: { color: colors2.danger, textAlign: 'center', marginBottom: spacing2.sm },

  photoSection: { gap: spacing2.md, marginTop: spacing2.md },
  photoSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  photoSectionTitle: { ...typography2.headlineMd, fontSize: 18 },

  pickButtons: { gap: spacing2.md },
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
  pickButtonText: { ...typography2.headlineMd, fontSize: 16 },
  centered: { alignItems: 'center', marginTop: spacing2.xl },
  previewLarge: {
    width: '100%',
    height: 220,
    borderRadius: radius2.lg,
    backgroundColor: colors2.surfaceContainerHigh,
  },
  analyzingSpinner: { marginTop: spacing2.lg },
  analyzingText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, marginTop: spacing2.md },
  reviewContainer: { gap: spacing2.sm },
  descriptionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm, marginTop: spacing2.md },
  description: { ...typography2.headlineMd, fontSize: 18, flex: 1 },
  confidence: { ...typography2.labelCaps, textTransform: 'none', marginBottom: spacing2.sm },
});
