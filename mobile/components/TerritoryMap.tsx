import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Callout, Marker } from 'react-native-maps';

import { TerritoryCity } from '@/services/squads';
import { NEUTRAL_TERRITORY_COLOR, squadColorFromId } from '@/utils/squadColor';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

// Regiao inicial cobrindo o Brasil inteiro -- centro aproximado do pais,
// deltas grandes o bastante pra enquadrar de norte a sul/leste a oeste
// numa unica tela, sem exigir zoom-out manual do usuario. Fallback quando a
// localizacao do usuario nao esta disponivel (permissao negada / sem GPS / timeout).
const BRAZIL_REGION = {
  latitude: -14.2,
  longitude: -51.9,
  latitudeDelta: 35,
  longitudeDelta: 35,
};

type Region = typeof BRAZIL_REGION;
type Coords = { latitude: number; longitude: number };

// Zoom de BAIRRO (~10 quarteiroes) quando a localizacao do usuario esta disponivel. So a
// latitudeDelta e fixa; a longitudeDelta sai da razao largura/altura do mapa (ver neighborhoodRegion).
const NEIGHBORHOOD_LAT_DELTA = 0.012;

// Teto de espera pelo GPS: sem isso, getCurrentPositionAsync pode demorar
// (ou nunca resolver, sem sinal) e o mapa ficaria preso no loading.
const LOCATION_TIMEOUT_MS = 5000;

// "Ver territorio": margem ao redor dos pinos e zoom minimo (um pino so nao pode virar zoom infinito).
const FIT_PADDING_FACTOR = 1.6;
const FIT_MIN_DELTA = 0.05;

function toCoords(position: Location.LocationObject): Coords {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

/**
 * Posicao atual do usuario, ou null se a permissao for negada / a localizacao falhar / estourar o
 * tempo. Nunca rejeita -- o fallback e silencioso, sem erro pro usuario. O prompt de permissao do
 * sistema aparece aqui (so na primeira vez; depois o iOS/Android devolvem a resposta ja dada).
 */
async function resolveUserCoords(): Promise<Coords | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    const position = await Promise.race([
      Location.getCurrentPositionAsync({}),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
    ]);
    if (!position) return null;
    return toCoords(position);
  } catch {
    return null;
  }
}

// Variacao de latitudeDelta (relativa ao zoom de bairro inicial) a partir da qual o mapa e considerado
// "mexido pelo usuario" (pinch/zoom), ja que no Apple Maps (iOS padrao) isGesture nao e informado.
const ZOOM_CHANGED_TOLERANCE = 0.2;

/**
 * Regiao em zoom de bairro centrada em `coords`. A longitudeDelta e calculada pra o mapa ficar com
 * a proporcao certa na tela (largura/altura) e sem distorcao (1 grau de longitude encolhe com
 * cos(latitude)), em vez de depender do MapKit "adivinhar" ao ajustar a regiao.
 */
function neighborhoodRegion(coords: Coords, size: { width: number; height: number }): Region {
  const aspect = size.width / Math.max(size.height, 1);
  const cosLat = Math.max(Math.cos((coords.latitude * Math.PI) / 180), 0.2);
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    latitudeDelta: NEIGHBORHOOD_LAT_DELTA,
    longitudeDelta: (NEIGHBORHOOD_LAT_DELTA * aspect) / cosLat,
  };
}

interface TerritoryMapProps {
  /** Territorio ja buscado por quem usa o componente (GET /territory) -- o componente nao busca nada. */
  cities: TerritoryCity[];
  /** Altura fixa do mapa; sem isso o mapa preenche o pai (flex: 1). */
  height?: number;
  /** Se passado, mostra um botao discreto "tela cheia" no canto superior direito do mapa. */
  onExpand?: () => void;
  /**
   * true (padrao) = mapa pan/zoom/rotacao livres. false = mapa estatico (so visualizacao) --
   * util pra um card em que o gesto do mapa nao deva competir com a rolagem da pagina.
   */
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Mapa de territorio (Squad/Ranking): um Marker por cidade retornada por GET /territory que tenha
 * latitude/longitude (ver backend city_coordinates.json) -- cidades sem match no dataset sao
 * ignoradas em silencio. Cor do pin: squadColorFromId(dominant_squad_id) ou cinza neutro se a
 * cidade nao tiver squad dominante. Compartilhado pelo card da aba Ranking e pela tela cheia
 * (app/territory-map.tsx).
 *
 * Regiao inicial: posicao do usuario em zoom de bairro; sem localizacao, Brasil inteiro. Abertura
 * rapida: se o sistema tem a ULTIMA POSICAO CONHECIDA, o mapa monta na hora com ela e, quando o GPS
 * atual chega, reposiciona (animateToRegion) so se o usuario ainda nao mexeu no mapa. O estilo
 * do mapa e SEMPRE claro (userInterfaceStyle="light"): sem isso o MapKit herda o modo escuro do
 * iPhone.
 */
export function TerritoryMap({ cities, height, onExpand, interactive = true, style }: TerritoryMapProps) {
  const mapRef = useRef<MapView>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // Posicao usada pra montar o mapa. undefined = ainda resolvendo (spinner); null = indisponivel
  // (fallback do Brasil). Vem da ULTIMA POSICAO CONHECIDA quando existe (mapa monta na hora) ou do GPS.
  const [coords, setCoords] = useState<Coords | null | undefined>(undefined);
  // GPS atual que chegou DEPOIS do mapa ja ter montado com a ultima posicao conhecida.
  const [refinedCoords, setRefinedCoords] = useState<Coords | null>(null);
  // true assim que o usuario mexe no mapa (arrasto/zoom): o reposicionamento pelo GPS atual e cancelado.
  const userMovedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (permission.status !== 'granted') {
          setCoords(null);
          return;
        }
        // 1) Ultima posicao conhecida: instantanea (cache do sistema), monta o mapa na hora.
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (cancelled) return;
        if (last) setCoords(toCoords(last));
        // 2) Em paralelo ao mapa ja visivel: GPS atual, mesmo timeout de 5 s.
        const current = await Promise.race([
          Location.getCurrentPositionAsync({}),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
        ]).catch(() => null);
        if (cancelled) return;
        if (current) {
          if (last) setRefinedCoords(toCoords(current));
          else setCoords(toCoords(current));
        } else if (!last) {
          setCoords(null);
        }
      } catch {
        if (!cancelled) setCoords((prev) => (prev === undefined ? null : prev));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height: h } = event.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === h ? prev : { width, height: h }));
  }, []);

  const citiesWithCoords = useMemo(
    () =>
      cities.filter(
        (city): city is TerritoryCity & { latitude: number; longitude: number } =>
          city.latitude != null && city.longitude != null
      ),
    [cities]
  );

  // initialRegion so vale no mount do MapView, entao o mapa so monta depois de medir o tamanho e
  // resolver a localizacao -- a regiao certa ja esta pronta quando ele aparece.
  const initialRegion = useMemo<Region | null>(() => {
    if (coords === undefined || !size) return null;
    return coords ? neighborhoodRegion(coords, size) : BRAZIL_REGION;
  }, [coords, size]);

  // GPS atual chegou depois do mapa montar com a ultima posicao conhecida: reposiciona SO se o usuario
  // ainda nao mexeu no mapa. Se o mapa ainda nao montou (ref vazia), basta trocar a posicao inicial.
  useEffect(() => {
    if (!refinedCoords || !size || userMovedRef.current) return;
    if (!mapRef.current) {
      setCoords(refinedCoords);
      return;
    }
    mapRef.current.animateToRegion(neighborhoodRegion(refinedCoords, size), 500);
  }, [refinedCoords, size]);

  // Deteccao de "usuario mexeu no mapa" (cancela o reposicionamento acima):
  //  - onPanDrag: arrasto com o dedo (Apple Maps e Google Maps);
  //  - onRegionChangeStart com isGesture === true: qualquer gesto, mas SO Google Maps informa isGesture
  //    (no Apple Maps, o padrao do iOS, vem undefined);
  //  - onRegionChangeComplete: latitudeDelta mudou > 20% do zoom de bairro inicial = pinch/zoom (cobre o
  //    Apple Maps, onde nao ha isGesture e o onPanDrag nao dispara em pinch).
  const markUserMoved = useCallback(() => {
    userMovedRef.current = true;
  }, []);
  const handleRegionChangeStart = useCallback((event: { nativeEvent?: { isGesture?: boolean } }) => {
    if (event?.nativeEvent?.isGesture === true) userMovedRef.current = true;
  }, []);
  const handleRegionChangeComplete = useCallback((region: Region) => {
    if (Math.abs(region.latitudeDelta / NEIGHBORHOOD_LAT_DELTA - 1) > ZOOM_CHANGED_TOLERANCE) {
      userMovedRef.current = true;
    }
  }, []);

  // Recentraliza no usuario em zoom de bairro. Usa a posicao mais recente que ja temos; se ainda nao
  // tem (permissao negada antes ou GPS falhou), tenta de novo -- falha continua silenciosa.
  const handleMyLocation = useCallback(async () => {
    if (!size) return;
    const target = refinedCoords ?? coords ?? (await resolveUserCoords());
    if (!target) return;
    if (!coords) setCoords(target);
    mapRef.current?.animateToRegion(neighborhoodRegion(target, size), 500);
  }, [coords, refinedCoords, size]);

  // Afasta o mapa pra enquadrar os pinos das cidades COM squad dominante. Sem nenhum, nao faz nada.
  const handleFitTerritory = useCallback(() => {
    const pins = citiesWithCoords.filter((city) => city.dominant_squad_id != null);
    if (pins.length === 0) return;
    const lats = pins.map((p) => p.latitude);
    const lngs = pins.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    mapRef.current?.animateToRegion(
      {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max((maxLat - minLat) * FIT_PADDING_FACTOR, FIT_MIN_DELTA),
        longitudeDelta: Math.max((maxLng - minLng) * FIT_PADDING_FACTOR, FIT_MIN_DELTA),
      },
      600
    );
  }, [citiesWithCoords]);

  return (
    <View style={[height != null ? { height } : styles.flex, styles.container, style]} onLayout={handleLayout}>
      {initialRegion ? (
        <MapView
          ref={mapRef}
          style={styles.flex}
          initialRegion={initialRegion}
          showsUserLocation
          userInterfaceStyle="light"
          onPanDrag={markUserMoved}
          onRegionChangeStart={handleRegionChangeStart}
          onRegionChangeComplete={handleRegionChangeComplete}
          scrollEnabled={interactive}
          zoomEnabled={interactive}
          rotateEnabled={interactive}
          pitchEnabled={interactive}
        >
          {citiesWithCoords.map((city) => (
            <Marker
              key={`${city.latitude}-${city.longitude}`}
              coordinate={{ latitude: city.latitude, longitude: city.longitude }}
              pinColor={city.dominant_squad_id ? squadColorFromId(city.dominant_squad_id) : NEUTRAL_TERRITORY_COLOR}
            >
              <Callout>
                <View style={styles.calloutBox}>
                  <Text style={styles.calloutCity}>{city.city}</Text>
                  <Text style={styles.calloutSquad}>{city.dominant_squad_name ?? 'Nenhum squad'}</Text>
                  {city.dominant_squad_percent != null && (
                    <Text style={styles.calloutPercent}>{city.dominant_squad_percent}%</Text>
                  )}
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors3.primary} />
        </View>
      )}

      {initialRegion && (
        <>
          <View style={styles.controlsBottomRight}>
            <Pressable style={styles.control} onPress={handleMyLocation} hitSlop={6} accessibilityLabel="Minha localização">
              <Ionicons name="locate" size={18} color={colors3.primary} />
            </Pressable>
            <Pressable style={styles.control} onPress={handleFitTerritory} hitSlop={6} accessibilityLabel="Ver território">
              <Ionicons name="earth" size={18} color={colors3.primary} />
            </Pressable>
          </View>
          {onExpand && (
            <View style={styles.controlTopRight}>
              <Pressable style={styles.control} onPress={onExpand} hitSlop={6} accessibilityLabel="Tela cheia">
                <Ionicons name="expand-outline" size={18} color={colors3.primary} />
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { overflow: 'hidden', backgroundColor: colors3.surfaceContainer },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Controles flutuantes discretos: circulos brancos translucidos, icone na cor primaria do tema.
  controlsBottomRight: { position: 'absolute', right: spacing3.sm, bottom: spacing3.sm, gap: spacing3.sm },
  controlTopRight: { position: 'absolute', right: spacing3.sm, top: spacing3.sm },
  control: {
    width: 36,
    height: 36,
    borderRadius: radius3.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(107, 56, 212, 0.2)',
  },

  calloutBox: { minWidth: 140, gap: 2, padding: spacing3.xs },
  calloutCity: { ...typography3.bodyMd, fontWeight: '700' },
  calloutSquad: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  calloutPercent: { ...typography3.bodyMd, fontSize: 13, color: colors3.primary, fontWeight: '700' },
});
