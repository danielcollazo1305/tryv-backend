import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Polyline } from 'react-native-maps';

import { Button2 } from '@/components/Button2';
import { RunSummaryStrip } from '@/components/RunSummaryStrip';
import { TextField2 } from '@/components/TextField2';
import { useAuth } from '@/context/AuthContext';
import { CAPTION_MAX_LENGTH } from '@/constants/textLimits';
import { getRoutePublic } from '@/services/activities';
import { getApiErrorMessage } from '@/services/api';
import { classifyImageUploadError, getContentFilterMessage } from '@/services/contentFilter';
import { uploadMedia } from '@/services/media';
import {
  ALREADY_PUBLISHED_MESSAGE,
  MapAvailability,
  MapPoint,
  PublishStage,
  RUN_MAP_PRIVACY_TEXT,
  activityTypeLabel,
  buildRunPostPayload,
  canOfferMap,
  classifyPublishError,
  includeMapEffective,
  isAdultByBirthDate,
  isPublishing,
  mapAvailabilityFromError,
  mapFailureOptions,
  mapUnavailableNote,
  normalizeActivity,
  normalizePublicRoute,
  publishProgressText,
  regionForPoints,
} from '@/services/runPostState';
import { createPost } from '@/services/social';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

const STRIP_COLORS = { text: colors2.onSurface, muted: colors2.onSurfaceVariant, background: colors2.surfaceContainer, border: colors2.outlineVariant };
const MAP_READY_FALLBACK_MS = 5000;

interface MapFailure {
  message: string;
  retryable: boolean;
}

/**
 * Publicar uma corrida no feed (tela aberta pelo detalhe da corrida). Resumo (tipo, distancia, tempo, ritmo) sempre; MAPA opcional,
 * DESLIGADO por padrao: so adulto, so se o servidor oferecer o trajeto cortado (GET /runs/{id}/route-public: sem os 200 m do inicio e do fim).
 * O mapa do post e desenhado SO com esses pontos (nunca com a rota completa da corrida; esta tela nem busca a corrida), fotografado com
 * MapView.takeSnapshot e enviado como imagem pelo upload de sempre. O resumo vem pelos parametros da rota (a tela nao le a corrida).
 */
export default function PublishRunScreen() {
  const params = useLocalSearchParams<{ runId: string; type?: string; distance?: string; duration?: string; pace?: string }>();
  const runId = String(params.runId ?? '');
  const { user } = useAuth();
  const adult = isAdultByBirthDate(user?.date_of_birth);
  const activity = normalizeActivity({
    activity_type: params.type,
    distance_meters: Number(params.distance),
    duration_seconds: Number(params.duration),
    avg_pace_seconds_per_km: params.pace ? Number(params.pace) : null,
  });

  const scrollRef = useRef<ScrollView>(null);
  const mapRef = useRef<MapView>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  // Mapa ja enviado: se o texto for barrado e a pessoa tentar de novo, nao sobe de novo.
  const mapUrlRef = useRef<string | null>(null);

  const [caption, setCaption] = useState('');
  const [mapOn, setMapOn] = useState(false);
  const [availability, setAvailability] = useState<MapAvailability>(adult ? 'checking' : 'forbidden');
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [stage, setStage] = useState<PublishStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mapFailure, setMapFailure] = useState<MapFailure | null>(null);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // Saiu da tela no meio: o fluxo para e NAO cria o post.
      mountedRef.current = false;
    };
  }, []);

  // Menor de 18 / sem data de nascimento: nem consulta o mapa. Adulto: pergunta ao servidor se ha trajeto a oferecer (404 = servidor antigo).
  useEffect(() => {
    if (!adult || !runId) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await getRoutePublic(runId);
        if (cancelled) return;
        const pts = normalizePublicRoute(raw);
        setPoints(pts);
        setAvailability(pts ? 'available' : (raw as { available?: unknown } | null)?.available === false ? 'short' : 'error');
      } catch (err) {
        if (!cancelled) setAvailability(mapAvailabilityFromError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adult, runId]);

  const offerMap = canOfferMap(adult, availability) && !!points;
  const includeMap = includeMapEffective(mapOn, adult, availability) && !!points;
  const note = mapUnavailableNote(adult, availability);

  // Mapa na tela ligado: espera o carregamento (com limite, para nao travar sem internet).
  useEffect(() => {
    if (!includeMap) {
      setMapReady(false);
      return;
    }
    const t = setTimeout(() => setMapReady(true), MAP_READY_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [includeMap]);

  const showTop = (message: string) => {
    setError(message);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const failMap = (message: string, retryable: boolean) => {
    if (!mountedRef.current) return;
    setMapFailure({ message, retryable });
    setStage('map_failed');
  };

  const publish = async (withMap: boolean) => {
    if (busyRef.current || published || !runId) return; // sem toque duplo
    busyRef.current = true;
    setError(null);
    setMapFailure(null);
    try {
      let mapUrl: string | null = null;
      if (withMap) {
        mapUrl = mapUrlRef.current;
        if (!mapUrl) {
          setStage('snapshot');
          let uri: string;
          try {
            uri = await mapRef.current!.takeSnapshot({ format: 'png', quality: 1, result: 'file' });
          } catch {
            failMap('Não foi possível preparar a imagem do mapa.', true);
            return;
          }
          if (!mountedRef.current) return;
          setStage('uploading');
          try {
            mapUrl = await uploadMedia(uri, 'posts');
            mapUrlRef.current = mapUrl;
          } catch (err) {
            const upload = classifyImageUploadError(err);
            failMap(
              upload?.message ?? getApiErrorMessage(err, 'Não foi possível enviar o mapa.'),
              upload ? upload.kind === 'unavailable' || upload.kind === 'limited' : true
            );
            return;
          }
          if (!mountedRef.current) return;
        }
      }

      setStage('saving');
      try {
        await createPost(buildRunPostPayload({ runId, caption, mapUrl }));
        if (!mountedRef.current) return;
        setPublished(true);
        setStage('done');
        router.back();
      } catch (err) {
        if (!mountedRef.current) return;
        setStage('idle');
        const kind = classifyPublishError(err);
        if (kind === 'already_published') {
          setPublished(true); // nao tenta de novo
          showTop(ALREADY_PUBLISHED_MESSAGE);
          return;
        }
        // 422 sem o cabecalho do filtro de texto (ex.: imagem nao verificada): o mapa em cache nao vale mais; a proxima tentativa reenvia.
        if (kind === 'rejected' && !getContentFilterMessage(err)) mapUrlRef.current = null;
        showTop(
          getContentFilterMessage(err) ??
            getApiErrorMessage(err, kind === 'rejected' ? 'Não foi possível publicar esta corrida.' : 'Não foi possível publicar a corrida, tente de novo.')
        );
      }
    } finally {
      busyRef.current = false;
    }
  };

  const busy = isPublishing(stage);
  const progress = publishProgressText(stage);
  const waitingMap = includeMap && !mapReady;
  const publishDisabled = busy || published || !runId || !activity || waitingMap || stage === 'map_failed';
  const options = mapFailure ? mapFailureOptions(mapFailure.retryable) : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
          <Ionicons name="close" size={24} color={colors2.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.headerTitle}>Publicar no feed</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!error && (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}

        {!activity ? (
          <Text style={styles.error}>Não foi possível carregar o resumo desta atividade.</Text>
        ) : (
          <>
            <Text style={styles.typeLabel}>{activityTypeLabel(activity.activity_type)}</Text>
            <RunSummaryStrip activity={activity} colors={STRIP_COLORS} />

            {includeMap && points && (
              <View style={styles.mapBox} accessible accessibilityLabel="Prévia do mapa do percurso, sem o início e o fim">
                <MapView
                  ref={mapRef}
                  style={styles.map}
                  initialRegion={regionForPoints(points)}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  toolbarEnabled={false}
                  showsUserLocation={false}
                  showsCompass={false}
                  showsPointsOfInterest={false}
                  showsBuildings={false}
                  mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
                  onMapLoaded={() => setMapReady(true)}
                >
                  <Polyline coordinates={points} strokeColor={colors2.violet} strokeWidth={5} />
                </MapView>
              </View>
            )}

            <TextField2
              label="Legenda (opcional)"
              placeholder="Como foi?"
              value={caption}
              onChangeText={setCaption}
              maxLength={CAPTION_MAX_LENGTH}
              multiline
              numberOfLines={3}
              style={styles.captionInput}
            />

            {offerMap && (
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.switchTitle}>Incluir mapa do percurso</Text>
                  <Text style={styles.switchHint}>{RUN_MAP_PRIVACY_TEXT}</Text>
                </View>
                <Switch
                  value={mapOn}
                  onValueChange={(v) => {
                    setMapOn(v);
                    setMapFailure(null);
                    if (stage === 'map_failed') setStage('idle');
                  }}
                  disabled={busy}
                  accessibilityLabel="Incluir mapa do percurso"
                  trackColor={{ true: colors2.violet }}
                />
              </View>
            )}
            {!!note && <Text style={styles.note}>{note}</Text>}

            {stage === 'map_failed' && mapFailure && options && (
              <View style={styles.failBox} accessibilityRole="alert">
                <Text style={styles.failTitle}>O mapa não foi enviado</Text>
                <Text style={styles.failText}>{mapFailure.message}</Text>
                <View style={styles.failActions}>
                  {options.retry && (
                    <Pressable
                      onPress={() => {
                        setStage('idle');
                        void publish(true);
                      }}
                      style={styles.failButton}
                      accessibilityRole="button"
                      accessibilityLabel="Tentar de novo enviar o mapa"
                    >
                      <Text style={styles.failButtonText}>Tentar de novo</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      setMapOn(false);
                      setStage('idle');
                      void publish(false);
                    }}
                    style={styles.failButton}
                    accessibilityRole="button"
                    accessibilityLabel="Publicar só o resumo, sem o mapa"
                  >
                    <Text style={styles.failButtonText}>Publicar sem mapa</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Button2
              label={progress ?? (waitingMap ? 'Carregando o mapa...' : published ? 'Publicada' : 'Publicar')}
              onPress={() => void publish(includeMap)}
              loading={busy}
              disabled={publishDisabled}
            />
            {busy && stage !== 'saving' && <Text style={styles.hint}>Isso pode levar alguns segundos.</Text>}
          </>
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
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.md },
  error: { color: colors2.danger, textAlign: 'center' },
  typeLabel: { ...typography2.headlineMd, fontSize: 20 },
  mapBox: { width: '100%', aspectRatio: 1, borderRadius: radius2.lg, overflow: 'hidden', backgroundColor: colors2.surfaceContainerHigh },
  map: { flex: 1 },
  captionInput: { minHeight: 70, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.md,
    padding: spacing2.md,
    borderRadius: radius2.lg,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    backgroundColor: colors2.surfaceContainer,
  },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { ...typography2.bodyMd, fontWeight: '600' },
  switchHint: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
  note: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
  hint: { color: colors2.onSurfaceVariant, textAlign: 'center', fontSize: 13 },
  failBox: { gap: spacing2.xs, padding: spacing2.md, borderRadius: radius2.md, borderWidth: 1, borderColor: colors2.danger },
  failTitle: { color: colors2.danger, fontWeight: '600' },
  failText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
  failActions: { flexDirection: 'row', gap: spacing2.md, flexWrap: 'wrap' },
  failButton: { minHeight: 44, justifyContent: 'center' },
  failButtonText: { color: colors2.primary, fontWeight: '600' },
});
