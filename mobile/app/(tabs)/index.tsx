import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { AiWorkoutCard } from '@/components/AiWorkoutCard';
import { Button2 } from '@/components/Button2';
import { HeatmapDay, HeatmapGrid, todayKey } from '@/components/HeatmapGrid';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { HealthMetricsGrid } from '@/components/HealthMetricsGrid';
import { ImageCoverCard } from '@/components/ImageCoverCard';
import { InsightCard } from '@/components/InsightCard';
import { MonthComparisonCard } from '@/components/MonthComparisonCard';
import { PersonalRecordsCard } from '@/components/PersonalRecordsCard';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ReadinessCard } from '@/components/ReadinessCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { TrainersHighlight } from '@/components/TrainersHighlight';
import { TrainingFrequencyCard } from '@/components/TrainingFrequencyCard';
import { ActivityProgressCard } from '@/components/ActivityProgressCard';
import { WeightChart } from '@/components/WeightChart';
import { getApiErrorMessage } from '@/services/api';
import {
  Challenge,
  buildAutomaticChallengeHeatmapDays,
  buildChallengeHeatmapDays,
  challengeDayProgress,
  getChallengeProgress,
  listMyActiveChallenges,
  listMyChallengeCheckins,
} from '@/services/challenges';
import { HomeSummary, getHomeSummary } from '@/services/dashboard';
import { DailyInsight, getDailyInsight } from '@/services/insights';
import { exportPeriodReportPdf } from '@/services/pdfExport';
import { subscribeToDashboardChanges } from '@/utils/dashboardEvents';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

type ViewMode = { type: 'rolling' } | { type: 'month'; year: number; month: number };

// Largura de cada "pagina" do carrossel de desafios oficiais — mesma conta
// de largura util ja usada em graficos da tela (largura da tela menos o
// padding horizontal do container, spacing2.containerMargin dos dois
// lados), pra cada card do carrossel ocupar exatamente o espaco que o
// card unico (sem carrossel) ja ocupava.
const SCREEN_WIDTH = Dimensions.get('window').width;
const CHALLENGE_CARD_WIDTH = SCREEN_WIDTH - spacing2.containerMargin * 2;

function monthLabel(year: number, month: number): string {
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatExportDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Mesmo teto de 90 dias ja validado nos 3 endpoints da Exportacao PDF
// (home-summary, period-comparison, heart-rate/report) — checado aqui de
// novo so pra dar feedback imediato no client, sem esperar o 400 do
// backend ir e voltar.
const MAX_EXPORT_RANGE_DAYS = 90;

/** Numero de dias no intervalo [a, b], inclusive dos dois extremos — comparando so a parte de data, sem horario. */
function daysBetween(a: Date, b: Date): number {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? '';
  const insets = useSafeAreaInsets();

  const [viewMode, setViewMode] = useState<ViewMode>({ type: 'rolling' });

  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // O insight tem seu proprio ciclo de carregamento, independente do resto
  // do dashboard — pode demorar mais (gera via IA na primeira vez do dia) e
  // uma falha nele nao deve travar o resto da Home.
  const [insight, setInsight] = useState<DailyInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);

  // Exportacao de PDF com intervalo livre (item aprovado: sem atalhos
  // fixos "7/30 dias", a pessoa escolhe as 2 datas). Default de 30 dias
  // terminando hoje, so como ponto de partida razoavel (mesmo range do
  // botao antigo mais usado) — a pessoa pode ajustar livremente.
  const [exportStartDate, setExportStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return date;
  });
  const [exportEndDate, setExportEndDate] = useState(new Date());
  const [showExportStartPicker, setShowExportStartPicker] = useState(false);
  const [showExportEndPicker, setShowExportEndPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Previa de progresso no card Desafios — so pra desafios da aba "App"
  // (is_official), conforme pedido (Personal fica no Perfil). Ciclo de
  // carregamento proprio e independente: uma falha aqui nao deve afetar o
  // resto da Home, mesmo padrao do insight acima. Lista (nao mais so o mais
  // recente) porque agora pode haver mais de um desafio oficial ativo ao
  // mesmo tempo (ex: um de musculacao/corrida + um de alimentacao) — nesse
  // caso vira carrossel; com 0 ou 1, comportamento identico a antes.
  const [activeOfficialChallenges, setActiveOfficialChallenges] = useState<Challenge[]>([]);
  // HeatmapDay[] ja pronto por desafio — computado na busca (checkins reais
  // pra goal_type='manual', progresso calculado pros outros 3), pra nao
  // duplicar a decisao de qual fonte usar tambem no render.
  const [activeChallengeHeatmapById, setActiveChallengeHeatmapById] = useState<Record<string, HeatmapDay[]>>({});
  const [challengeCarouselIndex, setChallengeCarouselIndex] = useState(0);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params =
        viewMode.type === 'month'
          ? { month: `${viewMode.year}-${String(viewMode.month).padStart(2, '0')}` }
          : { period: '30d' };
      setSummary(await getHomeSummary(params));
    } catch (err) {
      // 402 aqui = require_pro_subscription (o resumo da Home e conteudo
      // Pro) — confirmado no codigo (backend/app/core/deps.py:75, HTTP 402
      // Payment Required, nao 403). Isso dispara sozinho toda vez que a
      // Home monta, pra QUALQUER usuario sem assinatura — nao e uma falha
      // real nem uma acao que o usuario tentou e foi barrado, entao nao
      // deve virar um banner vermelho de erro. Mesmo padrao ja usado por
      // MonthComparisonCard/ReadinessCard/PersonalRecordsCard/InsightCard:
      // some da tela em vez de mostrar a mensagem crua do backend.
      const isProRequired = axios.isAxiosError(err) && err.response?.status === 402;
      setSummary(null);
      if (!isProRequired) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar seu resumo.'));
      }
    } finally {
      setLoading(false);
    }
  }, [viewMode]);

  const exportRangeDays = daysBetween(exportStartDate, exportEndDate);
  const exportRangeValid = exportEndDate >= exportStartDate && exportRangeDays <= MAX_EXPORT_RANGE_DAYS;

  const handleExportStartDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowExportStartPicker(false);
    if (event.type === 'set' && selectedDate) setExportStartDate(selectedDate);
  };

  const handleExportEndDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowExportEndPicker(false);
    if (event.type === 'set' && selectedDate) setExportEndDate(selectedDate);
  };

  const handleExportPdf = async () => {
    if (!exportRangeValid) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportPeriodReportPdf(user?.name ?? '', exportStartDate, exportEndDate);
    } catch (err) {
      setExportError(getApiErrorMessage(err, 'Nao foi possivel exportar o relatorio em PDF.'));
    } finally {
      setExporting(false);
    }
  };

  const goToPreviousMonth = () => {
    if (viewMode.type === 'rolling') {
      const now = new Date();
      setViewMode({ type: 'month', year: now.getFullYear(), month: now.getMonth() + 1 });
      return;
    }
    let { year, month } = viewMode;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    setViewMode({ type: 'month', year, month });
  };

  const goToNextMonth = () => {
    if (viewMode.type === 'rolling') return;
    const now = new Date();
    let { year, month } = viewMode;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    // Passou do mes atual — volta pra visao "ultimos 30 dias" (nao ha "futuro" pra ver).
    if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) {
      setViewMode({ type: 'rolling' });
    } else {
      setViewMode({ type: 'month', year, month });
    }
  };

  const fetchInsight = useCallback(async () => {
    setInsightLoading(true);
    try {
      setInsight(await getDailyInsight());
    } catch {
      setInsight(null);
    } finally {
      setInsightLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSummary();
    }, [fetchSummary])
  );

  useFocusEffect(
    useCallback(() => {
      fetchInsight();
    }, [fetchInsight])
  );

  const fetchActiveOfficialChallenges = useCallback(async () => {
    try {
      const active = await listMyActiveChallenges({ is_official: true });
      const heatmapByChallenge = Object.fromEntries(
        await Promise.all(
          active.map(async (challenge) => {
            const days =
              challenge.goal_type === 'manual'
                ? buildChallengeHeatmapDays(challenge, await listMyChallengeCheckins(challenge.id))
                : buildAutomaticChallengeHeatmapDays(challenge, await getChallengeProgress(challenge.id));
            return [challenge.id, days] as const;
          })
        )
      );
      setActiveOfficialChallenges(active);
      setActiveChallengeHeatmapById(heatmapByChallenge);
      setChallengeCarouselIndex(0);
    } catch {
      setActiveOfficialChallenges([]);
      setActiveChallengeHeatmapById({});
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchActiveOfficialChallenges();
    }, [fetchActiveOfficialChallenges])
  );

  const handleChallengeCarouselScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / CHALLENGE_CARD_WIDTH);
    setChallengeCarouselIndex(index);
  };

  // Sinal explicito, alem do foco de navegacao: voltar de uma tela modal (ex:
  // /weight/new) nem sempre dispara o evento de foco do tab de forma
  // confiavel em todo dispositivo — isso garante o recarregamento mesmo assim.
  useEffect(() => subscribeToDashboardChanges(fetchSummary), [fetchSummary]);

  // Extraida pra ser reaproveitada tanto no caso de 1 desafio so (sem
  // carrossel, mesmo card/markup de sempre) quanto em cada pagina do
  // carrossel quando ha mais de um — evita duplicar o JSX do card.
  const renderChallengeProgressCard = (challenge: Challenge) => (
    <Pressable
      key={challenge.id}
      style={activeOfficialChallenges.length > 1 ? styles.challengeCarouselItem : undefined}
      onPress={() => router.push({ pathname: '/challenges/[id]', params: { id: challenge.id } })}
    >
      <LiquiglassCard style={styles.challengeProgressCard}>
        <View style={styles.challengeProgressHeader}>
          <View style={styles.challengeProgressIconWrap}>
            <Ionicons name="trophy" size={20} color={colors2.primary} />
          </View>
          <View style={styles.challengeProgressTexts}>
            <Text style={styles.challengeProgressTitle}>{challenge.title}</Text>
            <Text style={styles.challengeProgressSubtitle}>
              Dia {challengeDayProgress(challenge).current} de {challengeDayProgress(challenge).total}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
        </View>
        <HeatmapGrid
          days={activeChallengeHeatmapById[challenge.id] ?? []}
          todayKey={todayKey()}
          cellSize={10}
          showDayNumbers={false}
          showWeekdayHeaders={false}
        />
      </LiquiglassCard>
    </Pressable>
  );

  const weightChangeLabel =
    summary?.weight_change_kg != null
      ? `${summary.weight_change_kg > 0 ? '+' : ''}${summary.weight_change_kg.toFixed(1)}kg`
      : '--';
  const deficit = summary?.calorie_summary?.avg_deficit;
  const deficitLabel = deficit != null ? `${Math.round(deficit)}` : '--';

  return (
    <ScreenBackground2>
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing2.xl }]}
    >
      <View style={styles.header}>
        <View>
          {/*
            "Tryv" pequeno acima da saudacao (nao o displayHero inteiro de
            36px, que ficaria maior que a propria saudacao e competiria com
            ela) — reaproveita fontFamily/color base de typography2.displayHero,
            so com fontSize/lineHeight/letterSpacing reduzidos pra escala de
            tag de marca, e colors2.primary pra reforcar que e um elemento
            diferente da saudacao pessoal (essa fica em onSurface, cor padrao).
          */}
          <Text style={styles.logo}>Tryv</Text>
          <Text style={styles.greeting}>Olá, {firstName}</Text>
          <Text style={styles.subtitle}>Vamos treinar hoje?</Text>
        </View>
        <View style={styles.headerActions}>
          <ProfileAvatarButton size={40} />
          <Pressable onPress={logout} style={styles.logoutButton} hitSlop={12}>
            <Ionicons name="log-out-outline" size={22} color={colors2.onSurfaceVariant} />
          </Pressable>
        </View>
      </View>

      {/* 2. Card de Saude — primeiro bloco de conteudo depois da saudacao. */}
      <HealthMetricsGrid />

      {/*
        3. Progresso (Corrida/Musculacao, estilo Strava) — substitui o
        antigo card "Km rodados" (WeeklyActivityChart continua existindo,
        agora so usado no perfil publico de outra pessoa em
        social/[userId].tsx). Sem Pressable por fora feito o card antigo
        tinha: o card tem suas proprias abas/toggle tocaveis por dentro, e
        o botao "Veja mais do seu progresso" ja cobre a navegacao pra
        /activity que o chevron fazia.
      */}
      <ActivityProgressCard />

      {/* 4. Frequencia de treino — heatmap estilo GitHub. */}
      <TrainingFrequencyCard />

      {/*
        5. Exportar PDF — troca dos 2 atalhos fixos (7/30 dias) por um
        seletor de intervalo livre, mesmo padrao de campo de data ja usado
        em challenges/new.tsx (Pressable abrindo DateTimePicker inline no
        iOS / modal no Android). Teto de 90 dias validado aqui pra feedback
        imediato, e de novo no backend (validate_date_range) como rede de
        seguranca.
      */}
      <LiquiglassCard style={styles.exportCard}>
        <Text style={styles.exportLabel}>Exportar relatório em PDF</Text>

        <View style={styles.exportDateField}>
          <Text style={styles.exportDateLabel}>Data inicial</Text>
          <Pressable style={styles.exportDateButton} onPress={() => setShowExportStartPicker(true)}>
            <Ionicons name="calendar-outline" size={16} color={colors2.primary} />
            <Text style={styles.exportDateButtonText}>{formatExportDate(exportStartDate)}</Text>
          </Pressable>
          {showExportStartPicker && (
            <DateTimePicker
              value={exportStartDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleExportStartDateChange}
              maximumDate={exportEndDate}
            />
          )}
          {Platform.OS === 'ios' && showExportStartPicker && (
            <Button2 label="Concluir" variant="secondary" onPress={() => setShowExportStartPicker(false)} />
          )}
        </View>

        <View style={styles.exportDateField}>
          <Text style={styles.exportDateLabel}>Data final</Text>
          <Pressable style={styles.exportDateButton} onPress={() => setShowExportEndPicker(true)}>
            <Ionicons name="calendar-outline" size={16} color={colors2.primary} />
            <Text style={styles.exportDateButtonText}>{formatExportDate(exportEndDate)}</Text>
          </Pressable>
          {showExportEndPicker && (
            <DateTimePicker
              value={exportEndDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleExportEndDateChange}
              minimumDate={exportStartDate}
              maximumDate={new Date()}
            />
          )}
          {Platform.OS === 'ios' && showExportEndPicker && (
            <Button2 label="Concluir" variant="secondary" onPress={() => setShowExportEndPicker(false)} />
          )}
        </View>

        {!exportRangeValid && (
          <Text style={styles.error}>
            {exportEndDate < exportStartDate
              ? 'A data final precisa ser igual ou posterior a data inicial.'
              : `O período não pode ultrapassar ${MAX_EXPORT_RANGE_DAYS} dias (selecionado: ${exportRangeDays}).`}
          </Text>
        )}
        {!!exportError && <Text style={styles.error}>{exportError}</Text>}

        <Button2
          label="Exportar relatório em PDF"
          onPress={handleExportPdf}
          loading={exporting}
          disabled={!exportRangeValid}
        />
      </LiquiglassCard>

      {/*
        6. Desafios — se participa ativamente de desafio(s) "App" (oficial
        Tryv), o card vira uma previa de progresso real (heatmap + "Dia X
        de Y") em vez da imagem estatica, indo direto pro desafio em
        questao. Com mais de 1 desafio oficial ativo ao mesmo tempo (ex:
        musculacao/corrida + alimentacao no mesmo mes), vira carrossel —
        com 0 ou 1, comportamento identico a antes (sem carrossel
        desnecessario). Sem participacao ativa em nenhum, continua como
        antes (imagem + link generico pra aba Desafios). So considera
        desafios "App" aqui, conforme pedido — progresso de desafios
        "Personal" fica no Perfil.
      */}
      {activeOfficialChallenges.length === 0 ? (
        <ImageCoverCard
          image={require('../../assets/imagens/desafios-card.png')}
          title="Desafios"
          subtitle="Acompanhe desafios dos seus profissionais"
          accessibilityLabel="Grupo de pessoas correndo a noite"
          onPress={() => router.push('/challenges')}
        />
      ) : activeOfficialChallenges.length === 1 ? (
        renderChallengeProgressCard(activeOfficialChallenges[0])
      ) : (
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CHALLENGE_CARD_WIDTH}
            decelerationRate="fast"
            onMomentumScrollEnd={handleChallengeCarouselScrollEnd}
          >
            {activeOfficialChallenges.map(renderChallengeProgressCard)}
          </ScrollView>
          <View style={styles.challengeCarouselDots}>
            {activeOfficialChallenges.map((challenge, index) => (
              <View
                key={challenge.id}
                style={[styles.challengeCarouselDot, index === challengeCarouselIndex && styles.challengeCarouselDotActive]}
              />
            ))}
          </View>
        </View>
      )}

      {/* 7. Treino com IA — novo. */}
      <AiWorkoutCard />

      {/* 8. Acompanhamento profissional — agora fluxo em 2 passos (ver TrainersHighlight). */}
      <TrainersHighlight />

      {/*
        Conteudo Pro existente (comparacao mensal, seletor de mes,
        prontidao, insight do dia, recordes pessoais, resumo do periodo e
        evolucao de peso) — nao fazia parte da lista numerada de reorganizacao
        pedida, entao mantive tudo junto (mesma adjacencia de antes) e movi
        pro fim da Home: os itens 2-8 acima sao conteudo de "relance" +
        descoberta (gratuitos), enquanto isso aqui e relatorio/analise mais
        profunda (a maioria Pro) — faz mais sentido ficar depois, nao
        competindo com os cards de entrada rapida do topo. Decisao de
        design minha, nao especificada explicitamente no pedido.
      */}
      <View style={styles.monthSelector}>
        <Pressable onPress={goToPreviousMonth} hitSlop={8} style={styles.monthArrow}>
          <Ionicons name="chevron-back" size={20} color={colors2.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {viewMode.type === 'rolling' ? 'Últimos 30 dias' : monthLabel(viewMode.year, viewMode.month)}
        </Text>
        <Pressable
          onPress={goToNextMonth}
          hitSlop={8}
          style={styles.monthArrow}
          disabled={viewMode.type === 'rolling'}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={viewMode.type === 'rolling' ? colors2.outlineVariant : colors2.onSurfaceVariant}
          />
        </Pressable>
      </View>

      <MonthComparisonCard />

      <ReadinessCard />

      {insightLoading && (
        <View style={styles.insightLoading}>
          <ActivityIndicator size="small" color={colors2.violet} />
        </View>
      )}
      {!insightLoading && !!insight && <InsightCard text={insight.insight_text} />}

      <PersonalRecordsCard />

      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color={colors2.violet} style={styles.loading} />}

      {!loading && summary && (
        <>
          <LiquiglassCard style={styles.statsCard}>
            <Text style={styles.cardTitle}>
              {viewMode.type === 'rolling' ? 'Últimos 30 dias' : monthLabel(viewMode.year, viewMode.month)}
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{weightChangeLabel}</Text>
                <Text style={styles.statLabel}>peso</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{summary.days_trained}</Text>
                <Text style={styles.statLabel}>dias treinados</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{deficitLabel}</Text>
                <Text style={styles.statLabel}>kcal déficit/dia</Text>
              </View>
            </View>
          </LiquiglassCard>

          <LiquiglassCard style={styles.sectionCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Evolução de peso</Text>
              <Pressable onPress={() => router.push('/weight/new')} hitSlop={8}>
                <Ionicons name="add-circle-outline" size={22} color={colors2.primary} />
              </Pressable>
            </View>
            <WeightChart data={summary.weight_evolution} />
          </LiquiglassCard>
        </>
      )}
    </ScrollView>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  challengeProgressCard: { gap: spacing2.md },
  challengeProgressHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  challengeProgressIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeProgressTexts: { flex: 1, gap: 2 },
  challengeProgressTitle: { ...typography2.bodyMd, fontWeight: '700' },
  challengeProgressSubtitle: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
  challengeCarouselItem: { width: CHALLENGE_CARD_WIDTH },
  challengeCarouselDots: { flexDirection: 'row', justifyContent: 'center', gap: spacing2.xs, marginTop: spacing2.sm },
  challengeCarouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors2.outlineVariant },
  challengeCarouselDotActive: { backgroundColor: colors2.violet, width: 16 },
  flex: { flex: 1 },
  container: { padding: spacing2.containerMargin, gap: spacing2.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing2.md,
  },
  logo: {
    ...typography2.displayHero,
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: -0.4,
    color: colors2.primary,
    marginBottom: 2,
  },
  greeting: { ...typography2.headlineLgMobile, fontSize: 26 },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, marginTop: spacing2.xs },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: colors2.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing2.md,
    marginBottom: spacing2.sm,
  },
  monthArrow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { ...typography2.bodyMd, fontWeight: '600', minWidth: 140, textAlign: 'center' },
  exportCard: { gap: spacing2.md },
  exportLabel: { ...typography2.labelCaps, textTransform: 'none' },
  exportDateField: { gap: spacing2.xs },
  exportDateLabel: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },
  exportDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.sm,
    backgroundColor: colors2.surfaceContainer,
    borderRadius: radius2.md,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.sm + 4,
  },
  exportDateButtonText: { ...typography2.bodyMd },
  error: { color: colors2.danger, textAlign: 'center' },
  loading: { marginTop: spacing2.lg },
  insightLoading: { alignItems: 'flex-start', paddingVertical: spacing2.xs },
  statsCard: { gap: spacing2.md },
  cardTitle: { ...typography2.headlineMd, fontSize: 18 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start', flex: 1 },
  statNumber: { ...typography2.metricMono, fontSize: 22 },
  statLabel: { ...typography2.labelCaps, textTransform: 'none', marginTop: spacing2.xs },

  sectionCard: { gap: spacing2.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
