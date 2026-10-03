import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import MapView, { Callout, Marker } from 'react-native-maps';

import { Button3 } from '@/components/Button3';
import { TerritoryCity, getTerritory } from '@/services/squads';
import { NEUTRAL_TERRITORY_COLOR, squadColorFromId } from '@/utils/squadColor';
import { colors3, spacing3, typography3 } from '@/constants/theme';

// Regiao inicial cobrindo o Brasil inteiro -- centro aproximado do pais,
// deltas grandes o bastante pra enquadrar de norte a sul/leste a oeste
// numa unica tela, sem exigir zoom-out manual do usuario.
const BRAZIL_REGION = {
  latitude: -14.2,
  longitude: -51.9,
  latitudeDelta: 35,
  longitudeDelta: 35,
};

// Zoom de cidade pra quando a localizacao do usuario esta disponivel (mesmo
// padrao do Uber ao pedir corrida). activity/new.tsx usa 0.01, mas la e
// rastreamento rua a rua; aqui queremos ver varias cidades vizinhas.
const CITY_DELTA = 0.1;

// Teto de espera pelo GPS: sem isso, getCurrentPositionAsync pode demorar
// (ou nunca resolver, sem sinal) e a tela ficaria presa no loading.
const LOCATION_TIMEOUT_MS = 5000;

type Region = typeof BRAZIL_REGION;

/**
 * Regiao inicial do mapa: posicao atual do usuario com zoom de cidade, ou
 * BRAZIL_REGION se a permissao for negada / a localizacao falhar / estourar o
 * tempo. Nunca rejeita -- o fallback e silencioso, sem erro pro usuario.
 */
async function resolveInitialRegion(): Promise<Region> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return BRAZIL_REGION;
    const position = await Promise.race([
      Location.getCurrentPositionAsync({}),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
    ]);
    if (!position) return BRAZIL_REGION;
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      latitudeDelta: CITY_DELTA,
      longitudeDelta: CITY_DELTA,
    };
  } catch {
    return BRAZIL_REGION;
  }
}

type Stage = 'loading' | 'ready' | 'error';

/**
 * Mapa de territorio (Squad/Ranking) -- push normal a partir de
 * ranking.tsx, fora de (auth)/(tabs) (so faz sentido logado, registrada
 * no grupo protegido de app/_layout.tsx). Um Marker por cidade retornada
 * por GET /territory que tenha latitude/longitude (ver backend
 * city_coordinates.json) -- cidades sem match no dataset sao ignoradas em
 * silencio, sem erro pro usuario (perda esperada ser rara e nao acionavel
 * por ele). Cor do pin: squadColorFromId(dominant_squad_id) ou cinza
 * neutro se a cidade nao tiver squad dominante.
 */
export default function TerritoryMapScreen() {
  const [stage, setStage] = useState<Stage>('loading');
  const [cities, setCities] = useState<TerritoryCity[]>([]);
  const [initialRegion, setInitialRegion] = useState<Region>(BRAZIL_REGION);

  const load = useCallback(async () => {
    setStage('loading');
    try {
      // Em paralelo: o MapView so monta no stage 'ready', entao a regiao certa
      // ja esta pronta antes de ele aparecer (initialRegion so vale no mount).
      const [data, region] = await Promise.all([getTerritory(), resolveInitialRegion()]);
      setCities(data);
      setInitialRegion(region);
      setStage('ready');
    } catch {
      setStage('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const citiesWithCoords = cities.filter(
    (city): city is TerritoryCity & { latitude: number; longitude: number } =>
      city.latitude != null && city.longitude != null
  );

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Território</Text>
        <View style={styles.headerSpacer} />
      </View>

      {stage === 'loading' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors3.primary} />
        </View>
      )}

      {stage === 'error' && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Não foi possível carregar o território.</Text>
          <Button3 label="Tentar de novo" onPress={load} />
        </View>
      )}

      {stage === 'ready' && (
        <MapView style={styles.flex} initialRegion={initialRegion} showsUserLocation>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
    backgroundColor: colors3.background,
  },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  headerSpacer: { width: 24 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing3.md, padding: spacing3.lg },
  errorText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },

  calloutBox: { minWidth: 140, gap: 2, padding: spacing3.xs },
  calloutCity: { ...typography3.bodyMd, fontWeight: '700' },
  calloutSquad: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  calloutPercent: { ...typography3.bodyMd, fontSize: 13, color: colors3.primary, fontWeight: '700' },
});
