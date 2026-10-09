import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Href, Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RetroFooter } from '@/components/retro/RetroFooter';
import { RetroText } from '@/components/retro/RetroText';
import { RETRO } from '@/components/retro/retroTheme';
import { MODALITY_META } from '@/constants/treinarModalities';
import { useAuth } from '@/context/AuthContext';
import { FIGHT_STYLE_OPTIONS } from '@/services/activities';
import { ModalityId } from '@/services/modalities';
import { getUserBadges } from '@/services/user';
import { isWorkoutPlanExpired, listWorkoutPlans } from '@/services/workouts';

interface Subtopic {
  key: string;
  label: string;
  hint?: string;
  href: Href;
}

const VALID_IDS: ModalityId[] = ['bike', 'halter', 'luva', 'tenis'];

const FREE_WORKOUT: Subtopic = {
  key: 'livre',
  label: 'Treino livre',
  hint: 'Escolha os exercícios na hora',
  href: '/workout-plan/free-session',
};

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/treinar');
}

export default function TreinarModalityScreen() {
  const { modalidade } = useLocalSearchParams<{ modalidade?: string }>();
  const id = VALID_IDS.find((v) => v === modalidade);

  // Rota invalida ou bike (que nao tem submenu): nunca fica numa tela vazia.
  if (!id) return <Redirect href="/treinar" />;
  if (id === 'bike') return <Redirect href={{ pathname: '/activity/new', params: { type: 'bike' } }} />;
  return <ModalityMenu id={id} />;
}

function ModalityMenu({ id }: { id: Exclude<ModalityId, 'bike'> }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const meta = MODALITY_META[id];

  // Halter: o que existe depende do plano de IA ativo e do personal vinculado.
  const [hasAiPlan, setHasAiPlan] = useState(false);
  const [hasTrainerLink, setHasTrainerLink] = useState(false);
  const [halterLoading, setHalterLoading] = useState(id === 'halter');

  useFocusEffect(
    useCallback(() => {
      if (id !== 'halter' || !user) return;
      let active = true;
      Promise.allSettled([listWorkoutPlans(), getUserBadges(user.id)]).then(([plans, badges]) => {
        if (!active) return;
        if (plans.status === 'fulfilled') {
          setHasAiPlan(plans.value.some((p) => !p.trainer_id && !isWorkoutPlanExpired(p)));
        }
        if (badges.status === 'fulfilled') {
          setHasTrainerLink(badges.value.teams.some((t) => t.professional_type === 'personal_trainer'));
        }
        setHalterLoading(false);
      });
      return () => {
        active = false;
      };
    }, [id, user])
  );

  const subtopics: Subtopic[] = useMemo(() => {
    if (id === 'tenis') {
      return [
        { key: 'run', label: 'Corrida', hint: 'Rastreio por GPS', href: { pathname: '/activity/new', params: { type: 'run' } } },
        { key: 'walk', label: 'Caminhada', hint: 'Rastreio por GPS', href: { pathname: '/activity/new', params: { type: 'walk' } } },
      ];
    }
    if (id === 'luva') {
      return FIGHT_STYLE_OPTIONS.map((o) => ({
        key: o.value,
        label: o.label,
        href: { pathname: '/activity/new', params: { type: 'fight', fight_style: o.value } } as Href,
      }));
    }
    // halter: as rotas reais ja existentes (o plano do dia e o do personal ficam na aba Treino).
    const list: Subtopic[] = [];
    if (hasAiPlan) list.push({ key: 'dia', label: 'Treino do dia', hint: 'Seu plano de IA', href: '/(tabs)/workout' });
    list.push(FREE_WORKOUT);
    if (hasTrainerLink) {
      list.push({ key: 'personal', label: 'Plano do Personal', hint: 'Treino do seu personal', href: '/(tabs)/workout' });
    }
    return list;
  }, [id, hasAiPlan, hasTrainerLink]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => {
    // Mantem a selecao valida quando a lista muda (halter carrega depois).
    if (!subtopics.some((s) => s.key === selectedKey)) setSelectedKey(subtopics[0]?.key ?? null);
  }, [subtopics, selectedKey]);

  const selected = subtopics.find((s) => s.key === selectedKey) ?? subtopics[0];

  const start = () => {
    if (selected) router.push(selected.href);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <View style={styles.itemBox}>
            <Image source={meta.image} resizeMode="contain" style={styles.itemImage} />
          </View>
          <View style={styles.titleTexts}>
            <RetroText size={8} color={RETRO.textDim}>Modalidade</RetroText>
            <RetroText size={12} color={RETRO.accent} numberOfLines={2}>
              {meta.title}
            </RetroText>
          </View>
        </View>

        <View style={styles.list}>
          {halterLoading && id === 'halter' && (
            <RetroText size={8} color={RETRO.textDim} style={styles.loading}>Carregando...</RetroText>
          )}
          {subtopics.map((s, index) => {
            const isSelected = s.key === selected?.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSelectedKey(s.key)}
                accessibilityRole="button"
                accessibilityLabel={`${index + 1}. ${s.label}${isSelected ? ', selecionado' : ''}`}
                accessibilityState={{ selected: isSelected }}
                style={[styles.item, isSelected && styles.itemSelected]}
              >
                <RetroText size={10} color={RETRO.accent} style={styles.pointer}>
                  {isSelected ? '▶' : ' '}
                </RetroText>
                <RetroText size={9} color={RETRO.textDim} style={styles.number}>
                  {String(index + 1).padStart(2, '0')}
                </RetroText>
                <View style={styles.itemTexts}>
                  <RetroText size={10} color={isSelected ? RETRO.text : RETRO.textSoft} numberOfLines={2}>
                    {s.label}
                  </RetroText>
                  {!!s.hint && isSelected && (
                    <RetroText size={7} color={RETRO.textDim} numberOfLines={2}>
                      {s.hint}
                    </RetroText>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <RetroFooter
        onBack={goBack}
        actionLabel="Iniciar"
        onAction={start}
        actionDisabled={!selected}
        actionAccessibilityLabel={selected ? `Iniciar ${selected.label}` : 'Iniciar'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: RETRO.bg },
  content: { paddingHorizontal: 12, paddingBottom: 12, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemBox: {
    width: 88,
    height: 88,
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: RETRO.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImage: { width: 80, height: 80 },
  titleTexts: { flex: 1, gap: 6 },
  list: { backgroundColor: RETRO.panel, borderWidth: 2, borderColor: RETRO.border, padding: 6, gap: 4 },
  loading: { padding: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 6, paddingVertical: 6, borderWidth: 2, borderColor: 'transparent' },
  itemSelected: { borderColor: RETRO.accent, backgroundColor: RETRO.panelAlt },
  pointer: { width: 14 },
  number: { width: 22 },
  itemTexts: { flex: 1, gap: 4 },
});
