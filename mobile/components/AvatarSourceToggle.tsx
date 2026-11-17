import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getApiErrorMessage } from '@/services/api';
import { AVATAR_SOURCE_LABELS, AvatarSource, generationsText } from '@/services/avatarFlow';
import { AvatarOptions, getAvatarOptions, setAvatarSource } from '@/services/user';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

interface AvatarSourceToggleProps {
  /** Mudou a imagem em uso (o chamador roda refreshUser() para o app inteiro refletir). */
  onChanged: () => void | Promise<void>;
  /** Muda quando uma geracao termina, para recarregar as pre-visualizacoes (as URLs assinadas expiram). */
  refreshKey?: number;
  /** Devolve as opcoes carregadas (para o chamador saber, por exemplo, se a pessoa pode enviar foto). */
  onOptions?: (options: AvatarOptions | null) => void;
}

const THUMB = 72;

/**
 * Alternancia foto/avatar: mostra as duas imagens guardadas (so do proprio usuario, por URL assinada que expira) e qual esta em uso. Tocar na outra
 * a coloca em uso, sem gerar nada e sem gastar cota. A escolha tambem aparece em TEXTO ("Em uso"), nao so pela borda colorida.
 */
export function AvatarSourceToggle({ onChanged, refreshKey = 0, onOptions }: AvatarSourceToggleProps) {
  const [options, setOptions] = useState<AvatarOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<AvatarSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getAvatarOptions();
      setOptions(next);
      onOptions?.(next);
      setError(null);
    } catch {
      setOptions(null);
      onOptions?.(null);
      setError('Não foi possível carregar suas imagens.');
    } finally {
      setLoading(false);
    }
    // onOptions muda a cada render do pai: so recarrega por refreshKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const choose = async (source: AvatarSource) => {
    if (!options || switching || options.avatar_source === source) return;
    setSwitching(source);
    setError(null);
    try {
      await setAvatarSource(source);
      await onChanged();
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível trocar agora, tente de novo.'));
    } finally {
      setSwitching(null);
    }
  };

  if (loading && !options) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={colors3.primary} />
      </View>
    );
  }
  if (!options) {
    return (
      <View style={styles.centered}>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Tentar de novo" hitSlop={8}>
          <Text style={styles.retry}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }

  const items: { source: AvatarSource; has: boolean; uri: string | null }[] = [
    { source: 'photo', has: options.has_photo, uri: options.photo_preview_url },
    { source: 'avatar', has: options.has_avatar, uri: options.avatar_preview_url },
  ];
  if (!items.some((item) => item.has)) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Qual imagem usar?</Text>
      <View style={styles.row}>
        {items.map((item) => {
          const active = options.avatar_source === item.source;
          const label = AVATAR_SOURCE_LABELS[item.source];
          return (
            <Pressable
              key={item.source}
              style={[styles.option, active && styles.optionActive, !item.has && styles.optionDisabled]}
              disabled={!item.has || !options.can_manage || !!switching}
              onPress={() => choose(item.source)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: !item.has || !options.can_manage }}
              accessibilityLabel={`${label}${active ? ', em uso' : item.has ? ', toque para usar' : ', indisponível'}`}
            >
              {item.has && item.uri ? (
                <Image source={{ uri: item.uri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Ionicons name="image-outline" size={24} color={colors3.onSurfaceVariant} />
                </View>
              )}
              <Text style={styles.optionLabel}>{label}</Text>
              <Text style={[styles.optionState, active && styles.optionStateActive]}>
                {switching === item.source ? 'Trocando…' : active ? 'Em uso' : item.has ? 'Usar' : 'Indisponível'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {options.can_manage && <Text style={styles.hint}>{generationsText(options.generations_remaining, options.generations_limit, options.window_days)}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing3.sm },
  centered: { alignItems: 'center', gap: spacing3.xs, paddingVertical: spacing3.sm },
  heading: { ...typography3.headlineMd, fontSize: 16, color: colors3.onSurface },
  row: { flexDirection: 'row', gap: spacing3.md },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: spacing3.xs,
    padding: spacing3.sm,
    borderRadius: radius3.lg,
    borderWidth: 2,
    borderColor: colors3.outlineVariant,
    backgroundColor: colors3.surfaceContainer,
  },
  optionActive: { borderColor: colors3.primary, backgroundColor: colors3.primaryFixed },
  optionDisabled: { opacity: 0.6 },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius3.md, backgroundColor: colors3.surfaceContainerHigh },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  optionLabel: { ...typography3.bodyMd, fontWeight: '700', color: colors3.onSurface },
  optionState: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
  optionStateActive: { color: colors3.primary, fontWeight: '700' },
  hint: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
  error: { ...typography3.bodyMd, fontSize: 14, color: colors3.error },
  retry: { ...typography3.bodyMd, fontWeight: '700', color: colors3.primary },
});
