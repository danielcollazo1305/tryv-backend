import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

  const load = useCallback(async () => {
    setStage('loading');
    try {
      const data = await getTerritory();
      setCities(data);
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
        <MapView style={styles.flex} initialRegion={BRAZIL_REGION}>
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
