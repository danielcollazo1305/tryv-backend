import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { RetroBar } from '@/components/retro/RetroBar';
import { RetroFooter } from '@/components/retro/RetroFooter';
import { RetroSegmentBar } from '@/components/retro/RetroSegmentBar';
import { RetroSlot } from '@/components/retro/RetroSlot';
import { RetroText } from '@/components/retro/RetroText';
import { RETRO } from '@/components/retro/retroTheme';
import { MODALITY_FALLBACK_ORDER, MODALITY_META } from '@/constants/treinarModalities';
import { useAuth } from '@/context/AuthContext';
import { Equipment, getEquipment } from '@/services/equipment';
import { ModalityId, ModalityStats, getModalities, lastSessionLabel } from '@/services/modalities';
import { parseUtcDate } from '@/services/challenges';
import { getInitials } from '@/utils/text';
import { formatKm } from '@/utils/equipmentUsage';

type Status = 'loading' | 'ready' | 'error';

const SIDE_PADDING = 12;
const COMMAND_COL = 96;
const ARROW_W = 32;
const SLOT_GAP = 6;

/** Modalidade inicial: a de treino mais recente; sem nenhum treino, Tenis. */
function pickInitialId(stats: ModalityStats[]): ModalityId {
  let best: ModalityStats | null = null;
  for (const m of stats) {
    if (!m.last_session_at) continue;
    if (!best || parseUtcDate(m.last_session_at).getTime() > parseUtcDate(best.last_session_at!).getTime()) best = m;
  }
  return best ? best.id : 'tenis';
}

/** Equipamento padrao da categoria (ou o primeiro ativo dela, se nenhum for marcado como padrao). */
function pickEquipment(items: Equipment[], category: 'tenis' | 'bike'): Equipment | null {
  const ofCategory = items.filter((e) => e.category === category && !e.retired_at);
  return ofCategory.find((e) => e.is_default) ?? ofCategory[0] ?? null;
}

function equipmentBar(item: Equipment): { label: string; percent: number } | null {
  if (item.category === 'tenis') {
    if (item.wear_percent == null || item.lifespan_km == null || item.total_distance_km == null) return null;
    return {
      label: `Vida útil ${formatKm(item.total_distance_km)}/${formatKm(item.lifespan_km)} km`,
      percent: item.wear_percent,
    };
  }
  if (item.category === 'bike') {
    if (item.maintenance_percent == null || item.maintenance_interval_km == null || item.km_since_maintenance == null) return null;
    return {
      label: `Revisão ${formatKm(item.km_since_maintenance)}/${formatKm(item.maintenance_interval_km)} km`,
      percent: item.maintenance_percent,
    };
  }
  return null;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

function enterModality(id: ModalityId) {
  // Bike tem um unico caminho: vai direto ao rastreador GPS, sem submenu.
  if (id === 'bike') router.push({ pathname: '/activity/new', params: { type: 'bike' } });
  else router.push({ pathname: '/treinar/[modalidade]', params: { modalidade: id } });
}

export default function TreinarScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [status, setStatus] = useState<Status>('loading');
  const [stats, setStats] = useState<ModalityStats[] | null>(null);
  const [equipment, setEquipment] = useState<Equipment[] | null>(null);
  const [selectedId, setSelectedId] = useState<ModalityId>('tenis');
  const initializedRef = useRef(false);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    // Sem piscar: so mostra "carregando" quando ainda nao ha nenhum dado.
    if (!hasDataRef.current) setStatus('loading');
    const [modalitiesResult, equipmentResult] = await Promise.allSettled([getModalities(), getEquipment()]);
    if (equipmentResult.status === 'fulfilled') setEquipment(equipmentResult.value);
    if (modalitiesResult.status === 'fulfilled') {
      const list = modalitiesResult.value.modalities;
      setStats(list);
      hasDataRef.current = true;
      if (!initializedRef.current) {
        initializedRef.current = true;
        setSelectedId(pickInitialId(list));
      }
      setStatus('ready');
    } else if (!hasDataRef.current) {
      setStatus('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Ordem da API; se a API falhou, ordem de reserva (as 4 continuam navegaveis).
  const order: ModalityId[] = useMemo(() => (stats ? stats.map((m) => m.id) : MODALITY_FALLBACK_ORDER), [stats]);
  const selectedIndex = Math.max(0, order.indexOf(selectedId));
  const meta = MODALITY_META[order[selectedIndex]];
  const current = stats?.find((m) => m.id === meta.id) ?? null;

  const move = (delta: number) => setSelectedId(order[(selectedIndex + delta + order.length) % order.length]);

  // Slots dimensionados pela largura (320 pt cabe: 4 slots entre duas setas).
  const slotSize = Math.floor((width - SIDE_PADDING * 2 - ARROW_W * 2 - SLOT_GAP * 5) / 4);
  const bigSize = Math.min(220, Math.floor(width - SIDE_PADDING * 2 - COMMAND_COL - 10));

  const showLoading = status === 'loading';
  const showError = status === 'error';
  const dash = '--';

  const sessionsText = showLoading ? 'Carregando...' : current ? String(current.sessions_this_month) : dash;
  const distanceText = showLoading
    ? 'Carregando...'
    : current?.distance_km_this_month != null
      ? `${formatKm(current.distance_km_this_month)} km`
      : dash;
  const lastText = showLoading ? 'Carregando...' : current ? lastSessionLabel(current.last_session_at) : dash;

  const equipmentItem = meta.equipment && equipment ? pickEquipment(equipment, meta.equipment) : null;
  const bar = equipmentItem ? equipmentBar(equipmentItem) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <RetroBar label="Status" style={{ flex: 1 }} />
          <RetroBar label="Modalidade" highlighted style={{ flex: 1.5 }} />
          <RetroBar label="Comando" style={{ flex: 1.2 }} />
        </View>

        <View style={styles.statusRow}>
          <Avatar initials={user ? getInitials(user.name) : '?'} imageUrl={user?.avatar_url} thumbUrl={user?.avatar_thumb_url} size={32} />
          <RetroText size={9} numberOfLines={1} style={{ flex: 1 }}>
            {user?.name ?? ''}
          </RetroText>
        </View>

        <View style={styles.mainRow}>
          <View style={[styles.bigBox, { width: bigSize, height: bigSize }]}>
            <Image source={meta.image} resizeMode="contain" style={{ width: bigSize - 8, height: bigSize - 8 }} />
          </View>
          <View style={styles.commandCol}>
            <RetroBar
              label="Entrar"
              highlighted
              onPress={() => enterModality(meta.id)}
              accessibilityLabel={`Entrar em ${meta.title}`}
            />
            <RetroBar label="Voltar" onPress={goBack} />
          </View>
        </View>

        <View style={styles.slotRow}>
          <Pressable
            onPress={() => move(-1)}
            accessibilityRole="button"
            accessibilityLabel="Modalidade anterior"
            hitSlop={{ left: 6, right: 6 }}
            style={styles.arrow}
          >
            <RetroText size={14} color={RETRO.accent}>{'<'}</RetroText>
          </Pressable>
          {order.map((id) => (
            <RetroSlot
              key={id}
              source={MODALITY_META[id].image}
              size={slotSize}
              selected={id === meta.id}
              onPress={() => setSelectedId(id)}
              accessibilityLabel={`${MODALITY_META[id].title}${id === meta.id ? ', selecionada' : ''}`}
            />
          ))}
          <Pressable
            onPress={() => move(1)}
            accessibilityRole="button"
            accessibilityLabel="Próxima modalidade"
            hitSlop={{ left: 6, right: 6 }}
            style={styles.arrow}
          >
            <RetroText size={14} color={RETRO.accent}>{'>'}</RetroText>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Row label="N." value={`${selectedIndex + 1} / ${order.length}`} />
          <Row label="Modalidade" value={meta.title} highlight />
          <Row label="Sessões no mês" value={sessionsText} />
          {meta.hasDistance && <Row label="Distância" value={distanceText} />}
          <Row label="Último treino" value={lastText} />

          {meta.equipment && (
            <View style={styles.equipBlock}>
              <RetroText size={8} color={RETRO.textDim}>
                {meta.equipment === 'tenis' ? 'Tênis padrão' : 'Bike padrão'}
              </RetroText>
              {equipmentItem ? (
                <>
                  <RetroText size={9} numberOfLines={2}>
                    {equipmentItem.name}
                  </RetroText>
                  {bar && (
                    <>
                      <RetroSegmentBar percent={bar.percent} />
                      <RetroText size={8} color={RETRO.textSoft}>
                        {bar.label}
                      </RetroText>
                    </>
                  )}
                </>
              ) : (
                <Pressable
                  onPress={() => router.push('/inventory')}
                  accessibilityRole="button"
                  accessibilityLabel="Nenhum equipamento cadastrado. Abrir inventário."
                  style={styles.linkBox}
                >
                  <RetroText size={8} color={RETRO.warning}>
                    Nenhum equipamento cadastrado. Toque para cadastrar no inventário.
                  </RetroText>
                </Pressable>
              )}
            </View>
          )}

          <RetroText size={8} color={RETRO.textSoft} style={styles.desc}>
            {meta.description}
          </RetroText>

          {showError && (
            <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Tentar de novo" style={styles.retry}>
              <RetroText size={9} color={RETRO.danger}>Tentar de novo</RetroText>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => router.push('/activity/new')}
          accessibilityRole="button"
          accessibilityLabel="Outras atividades: natação, HIIT e outras"
          style={styles.others}
        >
          <RetroText size={8} color={RETRO.textDim}>Outras atividades</RetroText>
        </Pressable>
      </ScrollView>

      <RetroFooter
        onBack={goBack}
        actionLabel="Entrar"
        onAction={() => enterModality(meta.id)}
        actionAccessibilityLabel={`Entrar em ${meta.title}`}
      />
    </View>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.row}>
      <RetroText size={8} color={RETRO.textDim} style={styles.rowLabel}>
        {label}
      </RetroText>
      <RetroText size={9} color={highlight ? RETRO.accent : RETRO.text} style={styles.rowValue} numberOfLines={2}>
        {value}
      </RetroText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: RETRO.bg },
  content: { paddingHorizontal: SIDE_PADDING, paddingBottom: 12, gap: 10 },
  headerRow: { flexDirection: 'row', gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  mainRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bigBox: {
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: RETRO.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandCol: { width: COMMAND_COL, gap: 8 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: SLOT_GAP },
  arrow: { width: ARROW_W, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: RETRO.panel, borderWidth: 2, borderColor: RETRO.border, padding: 10, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  rowLabel: { flexShrink: 0 },
  rowValue: { flex: 1, textAlign: 'right' },
  equipBlock: { gap: 6, paddingTop: 6, borderTopWidth: 2, borderTopColor: RETRO.slotBorder },
  linkBox: { minHeight: 44, justifyContent: 'center' },
  desc: { paddingTop: 6, borderTopWidth: 2, borderTopColor: RETRO.slotBorder },
  retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  others: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
