import React, { useEffect, useRef, useState } from 'react';
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

import { Avatar } from '@/components/Avatar';
import { Button2 } from '@/components/Button2';
import { ChoiceGroup2 } from '@/components/ChoiceGroup2';
import { TextField2 } from '@/components/TextField2';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { CAPTION_MAX_LENGTH } from '@/constants/textLimits';
import { classifyImageUploadError, getContentFilterMessage, getHttpStatus } from '@/services/contentFilter';
import { uploadMedia } from '@/services/media';
import {
  PostPhoto,
  addNotice,
  addPhotos,
  buildPhotoPostPayload,
  canPublish,
  canRetry,
  hasError,
  markError,
  markOk,
  markUploading,
  nextToUpload,
  photoCounterText,
  remainingSlots,
  removePhoto,
  resetAllToPending,
  retryPhoto,
  uploadProgressText,
} from '@/services/postPhotosState';
import { PostVisibility, createPost } from '@/services/social';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

// So Publico/Seguidores aqui (sem "Nao compartilhar") — diferente do
// seletor de 3 vias usado em meal/add.tsx e challenges/[id].tsx: esta
// tela existe especificamente pra publicar um post, "nao compartilhar"
// nao faz sentido como opcao do proprio fluxo de criacao.
const VISIBILITY_OPTIONS: { value: PostVisibility; label: string }[] = [
  { value: 'public', label: 'Publico' },
  { value: 'followers', label: 'Seguidores' },
];

const THUMB_SIZE = 88;

export default function NewPostScreen() {
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  // Fotos escolhidas, cada uma com seu estado de envio (pendente, enviando, ok com a url do servidor, ou erro). A lista e a fonte da
  // verdade; photosRef guarda a versao mais nova para o laco de envio (que roda varios awaits seguidos).
  const [photos, setPhotos] = useState<PostPhoto[]>([]);
  const photosRef = useRef<PostPhoto[]>([]);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // Saiu da tela no meio do envio: o laco para e NAO cria o post.
      mountedRef.current = false;
    };
  }, []);

  const apply = (next: PostPhoto[]) => {
    photosRef.current = next;
    if (mountedRef.current) setPhotos(next);
  };

  const showTop = (message: string) => {
    setError(message);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleAdded = (uris: string[]) => {
    const result = addPhotos(photosRef.current, uris);
    apply(result.photos);
    setNotice(addNotice(result));
  };

  const handleTakePhoto = async () => {
    setError(null);
    if (remainingSlots(photosRef.current) === 0) {
      setNotice(addNotice({ duplicates: 0, overLimit: 1 }));
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Permissao de camera negada. Habilite nas configuracoes do celular.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets[0]) handleAdded([result.assets[0].uri]);
  };

  const handlePickFromLibrary = async () => {
    setError(null);
    const slots = remainingSlots(photosRef.current);
    if (slots === 0) {
      setNotice(addNotice({ duplicates: 0, overLimit: 1 }));
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Permissao de galeria negada. Habilite nas configuracoes do celular.');
      return;
    }
    // Varias fotos de uma vez (ate o que ainda cabe nas 10). Com selecao multipla nao ha recorte.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: slots,
      orderedSelection: true,
    });
    if (!result.canceled && result.assets.length > 0) handleAdded(result.assets.map((asset) => asset.uri));
  };

  const handleRemove = (id: string) => {
    if (busyRef.current) return;
    setNotice(null);
    apply(removePhoto(photosRef.current, id));
  };

  const handleRetryPhoto = (id: string) => {
    if (busyRef.current) return;
    setError(null);
    apply(retryPhoto(photosRef.current, id));
  };

  const handleStartOver = () => {
    if (busyRef.current) return;
    setError(null);
    setNotice(null);
    apply([]);
  };

  const handlePublish = async () => {
    if (busyRef.current) return; // sem toque duplo
    if (photosRef.current.length === 0 || hasError(photosRef.current)) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      // 1) Envia as fotos UMA POR VEZ (cada uma passa pela analise de imagem e pelo teto diario do servidor). As que ja estao ok nao
      // sobem de novo. Na primeira que falhar o laco para: nada de post incompleto.
      for (;;) {
        const photo = nextToUpload(photosRef.current);
        if (!photo) break;
        apply(markUploading(photosRef.current, photo.id));
        try {
          const url = await uploadMedia(photo.uri, 'posts');
          if (!mountedRef.current) return;
          apply(markOk(photosRef.current, photo.id, url));
        } catch (err) {
          if (!mountedRef.current) return;
          const upload = classifyImageUploadError(err);
          apply(
            markError(
              photosRef.current,
              photo.id,
              upload?.message ?? getApiErrorMessage(err, 'Nao foi possivel enviar esta foto, tente novamente.'),
              upload?.kind ?? 'other'
            )
          );
          showTop('Uma das fotos nao foi enviada. Veja abaixo qual foi e resolva para publicar.');
          return;
        }
      }

      // 2) Tudo enviado: so agora cria o post (1 foto = como sempre; varias = media_url + media_urls).
      const payload = buildPhotoPostPayload(photosRef.current, { caption, visibility });
      if (!payload) return;
      if (!mountedRef.current) return;
      setSaving(true);
      try {
        await createPost(payload);
        if (mountedRef.current) router.back();
      } catch (err) {
        if (!mountedRef.current) return;
        // Texto barrado pelo filtro (422) ou pausa (429): mostra a mensagem do servidor e MANTEM legenda e fotos (ja enviadas, nao sobem de novo).
        // 422 sem o cabecalho do filtro (ex.: "foto nao verificada" ou "ja usada"): os enderecos nao valem mais; a proxima tentativa reenvia e reverifica.
        if (getHttpStatus(err) === 422 && !getContentFilterMessage(err)) apply(resetAllToPending(photosRef.current));
        showTop(getContentFilterMessage(err) ?? getApiErrorMessage(err, 'Nao foi possivel publicar o post.'));
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        setSaving(false);
      }
    }
  };

  const failed = photos.filter((p) => p.status === 'error');
  const publishDisabled = !canPublish(photos, busy) || hasError(photos);
  const progress = uploadProgressText(photos);
  const publishLabel = saving ? 'Publicando...' : busy ? progress ?? 'Verificando as fotos...' : 'Publicar';
  const slots = remainingSlots(photos);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
          <Ionicons name="close" size={24} color={colors2.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.headerTitle}>Novo post</Text>
        {photos.length > 0 ? (
          <Pressable
            onPress={handlePublish}
            disabled={publishDisabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Publicar"
            accessibilityState={{ disabled: publishDisabled }}
          >
            <Text style={[styles.publishText, publishDisabled && styles.publishTextDisabled]}>Publicar</Text>
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!error && (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}
        {!!notice && <Text style={styles.notice}>{notice}</Text>}

        {photos.length === 0 && (
          <View style={styles.pickButtons}>
            <Pressable style={styles.pickButton} onPress={handleTakePhoto} accessibilityRole="button" accessibilityLabel="Tirar foto">
              <View style={styles.pickIconWrap}>
                <Ionicons name="camera" size={26} color={colors2.primary} />
              </View>
              <Text style={styles.pickButtonText}>Tirar foto</Text>
            </Pressable>
            <Pressable
              style={styles.pickButton}
              onPress={handlePickFromLibrary}
              accessibilityRole="button"
              accessibilityLabel="Escolher da galeria, ate 10 fotos"
            >
              <View style={styles.pickIconWrap}>
                <Ionicons name="images" size={26} color={colors2.primary} />
              </View>
              <Text style={styles.pickButtonText}>Escolher da galeria</Text>
            </Pressable>
            <Text style={styles.limitHint}>Voce pode publicar ate 10 fotos em um post.</Text>
          </View>
        )}

        {photos.length > 0 && (
          <View style={styles.composeContainer}>
            <View style={styles.authorRow}>
              <Avatar initials={user ? getInitials(user.name) : '?'} imageUrl={user?.avatar_url} thumbUrl={user?.avatar_thumb_url} size={40} />
              <View>
                <Text style={styles.authorName}>{user?.name ?? 'Voce'}</Text>
                <Text style={styles.visibilityHint}>{visibility === 'public' ? 'Publico' : 'Seguidores'}</Text>
              </View>
            </View>

            {photos.length === 1 && <Image source={{ uri: photos[0].uri }} style={styles.preview} accessibilityLabel="Foto 1 de 1" />}

            <View style={styles.thumbsHeader}>
              <Text style={styles.thumbsTitle}>Fotos</Text>
              <Text style={styles.thumbsCounter} accessibilityLabel={`${photos.length} de 10 fotos`}>
                {photoCounterText(photos)}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbsRow}>
              {photos.map((photo, index) => (
                <View
                  key={photo.id}
                  style={[styles.thumb, photo.status === 'error' && styles.thumbError]}
                  accessible
                  accessibilityLabel={`Foto ${index + 1} de ${photos.length}${photo.status === 'ok' ? ', enviada' : photo.status === 'error' ? ', com erro' : ''}`}
                >
                  <Image source={{ uri: photo.uri }} style={styles.thumbImage} />
                  {index === 0 && photos.length > 1 && (
                    <View style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText}>Capa</Text>
                    </View>
                  )}
                  {photo.status === 'uploading' && (
                    <View style={styles.thumbOverlay}>
                      <ActivityIndicator color={colors2.white} />
                    </View>
                  )}
                  {photo.status === 'ok' && (
                    <View style={styles.thumbStatus}>
                      <Ionicons name="checkmark-circle" size={20} color={colors2.white} />
                    </View>
                  )}
                  {photo.status === 'error' && (
                    <View style={styles.thumbOverlay}>
                      <Ionicons name="alert-circle" size={26} color={colors2.white} />
                    </View>
                  )}
                  <Pressable
                    onPress={() => handleRemove(photo.id)}
                    disabled={busy}
                    hitSlop={6}
                    style={styles.removeButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover foto ${index + 1}`}
                    accessibilityState={{ disabled: busy }}
                  >
                    <Ionicons name="close" size={14} color={colors2.white} />
                  </Pressable>
                </View>
              ))}
              {slots > 0 && !busy && (
                <>
                  <Pressable style={styles.addTile} onPress={handlePickFromLibrary} accessibilityRole="button" accessibilityLabel="Adicionar fotos da galeria">
                    <Ionicons name="images-outline" size={22} color={colors2.primary} />
                    <Text style={styles.addTileText}>Galeria</Text>
                  </Pressable>
                  <Pressable style={styles.addTile} onPress={handleTakePhoto} accessibilityRole="button" accessibilityLabel="Tirar mais uma foto">
                    <Ionicons name="camera-outline" size={22} color={colors2.primary} />
                    <Text style={styles.addTileText}>Camera</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>

            {failed.map((photo) => {
              const position = photos.findIndex((p) => p.id === photo.id) + 1;
              return (
                <View key={photo.id} style={styles.failBox} accessibilityRole="alert">
                  <Text style={styles.failTitle}>{`Foto ${position} nao foi enviada`}</Text>
                  {!!photo.error && <Text style={styles.failText}>{photo.error}</Text>}
                  <View style={styles.failActions}>
                    {canRetry(photo) && (
                      <Pressable
                        onPress={() => handleRetryPhoto(photo.id)}
                        disabled={busy}
                        style={styles.failButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Tentar de novo a foto ${position}`}
                      >
                        <Text style={styles.failButtonText}>Tentar de novo</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => handleRemove(photo.id)}
                      disabled={busy}
                      style={styles.failButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Remover a foto ${position}`}
                    >
                      <Text style={styles.failButtonText}>Remover</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            <TextField2
              label="Legenda (opcional)"
              placeholder="O que voce esta treinando hoje?"
              value={caption}
              onChangeText={setCaption}
              maxLength={CAPTION_MAX_LENGTH}
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

            <Button2 label={publishLabel} onPress={handlePublish} loading={busy} disabled={publishDisabled} />
            {hasError(photos) && !busy && (
              <Text style={styles.verifyHint}>Resolva as fotos com erro (tentar de novo ou remover) para publicar.</Text>
            )}
            {busy && !saving && (
              <Text style={styles.verifyHint}>Estamos verificando as fotos, uma de cada vez. Isso pode levar alguns segundos.</Text>
            )}
            <Button2 label="Comecar de novo" variant="secondary" onPress={handleStartOver} disabled={busy} />
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
  verifyHint: { color: colors2.onSurfaceVariant, textAlign: 'center', fontSize: 13 },
  publishText: { ...typography2.labelCaps, color: colors2.primary },
  publishTextDisabled: { opacity: 0.4 },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.md },
  error: { color: colors2.danger, textAlign: 'center', marginBottom: spacing2.sm },
  notice: { color: colors2.onSurfaceVariant, textAlign: 'center', fontSize: 13 },

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
  limitHint: { color: colors2.onSurfaceVariant, textAlign: 'center', fontSize: 13 },

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

  thumbsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing2.sm },
  thumbsTitle: { ...typography2.bodyMd, fontWeight: '600' },
  thumbsCounter: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },
  thumbsRow: { gap: spacing2.sm, paddingVertical: spacing2.xs, paddingRight: spacing2.sm },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius2.md,
    overflow: 'hidden',
    backgroundColor: colors2.surfaceContainerHigh,
  },
  thumbError: { borderWidth: 2, borderColor: colors2.danger },
  thumbImage: { width: '100%', height: '100%' },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbStatus: { position: 'absolute', left: 4, bottom: 4 },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  coverBadgeText: { color: colors2.white, fontSize: 10, fontWeight: '600' },
  addTile: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius2.md,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addTileText: { color: colors2.primary, fontSize: 12 },

  failBox: {
    gap: spacing2.xs,
    padding: spacing2.md,
    borderRadius: radius2.md,
    borderWidth: 1,
    borderColor: colors2.danger,
  },
  failTitle: { color: colors2.danger, fontWeight: '600' },
  failText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
  failActions: { flexDirection: 'row', gap: spacing2.md, flexWrap: 'wrap' },
  failButton: { minHeight: 44, justifyContent: 'center' },
  failButtonText: { color: colors2.primary, fontWeight: '600' },

  captionInput: { minHeight: 70, textAlignVertical: 'top' },
});
