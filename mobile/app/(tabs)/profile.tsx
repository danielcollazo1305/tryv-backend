import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/Avatar';
import { AvatarConsentModal } from '@/components/AvatarConsentModal';
import { AvatarSourceToggle } from '@/components/AvatarSourceToggle';
import { GlassCard } from '@/components/GlassCard';
import { HEALTHKIT_CONNECTED_KEY } from '@/components/HealthSummaryCard';
import { HeatmapDay, HeatmapGrid, todayKey } from '@/components/HeatmapGrid';
import { OverallCard } from '@/components/OverallCard';
import { PillTabs } from '@/components/PillTabs';
import { FeedEmpty, FeedError, FeedFooterLoading, FeedLoading } from '@/components/profile/FeedStateViews';
import { GALLERY_COLUMNS, GalleryCell } from '@/components/profile/GalleryCell';
import { HistoryFilterChips, HistoryRow, MonthHeader } from '@/components/profile/HistoryParts';
import { AchievementsTab } from '@/components/profile/AchievementsTab';
import { ProfileIdentity } from '@/components/profile/ProfileIdentity';
import { ProgressTab } from '@/components/profile/ProgressTab';
import { usePagedFeed } from '@/components/profile/usePagedFeed';
import { useWeightPoints } from '@/components/profile/useWeightPoints';
import { openSupportEmail } from '@/components/moderation/ReportSheet';
import { PostGrid2 } from '@/components/PostGrid2';
import { ProfileBadges2 } from '@/components/ProfileBadges2';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { getApiErrorMessage } from '@/services/api';
import { requestHealthPermissions } from '@/services/health';
import { PurchaseError, isPurchasesAvailable, restorePurchases, syncProAfterPurchase } from '@/services/purchases';
import { MANAGE_SUBSCRIPTIONS_URL } from '@/constants/legal';
import { isDevModeEnabled, setDevModeEnabled } from '@/services/devMode';
import { TapState, nextTap } from '@/services/devTaps';
import {
  getGrantedHealthConnectPermissions,
  initializeHealthConnect,
  insertHealthConnectDebugFcSonoTreino,
  insertHealthConnectDebugTestData,
  isHealthConnectAvailable,
  requestHealthConnectPermissions,
} from '@/services/healthConnect';
import {
  Challenge,
  buildAutomaticChallengeHeatmapDays,
  buildChallengeHeatmapDays,
  getChallengeProgress,
  listMyActiveChallenges,
  listMyChallengeCheckins,
} from '@/services/challenges';
import { getTrainingFrequency, getTrainingStreaks, getWorkoutProgress } from '@/services/dashboard';
import {
  HistoryListRow,
  OpenOverrides,
  buildHistoryRows,
  groupHistoryByMonth,
  historyTotalText,
  shouldAutoLoadMore,
  toggleMonth,
} from '@/services/activityGroupsState';
import { getGallery, getMyActivities } from '@/services/profileFeed';
import {
  GalleryItem,
  HISTORY_FILTERS,
  HistoryItem,
  INITIAL_VISITED,
  PROFILE_TABS,
  ProfileTab,
  markVisited,
} from '@/services/profileFeedState';
import { Post, listFollowers, listFollowing, listUserPosts } from '@/services/social';
import { AVATAR_CONSENT_VERSION, AVATAR_LOADING_TEXT, AVATAR_MINOR_MESSAGE, isAvatarRestricted } from '@/services/avatarFlow';
import { UserBadges, deleteMyAvatar, getUserBadges, uploadAvatarSelfie } from '@/services/user';
import { shareInvite } from '@/utils/invite';
import { getInitials } from '@/utils/text';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/** "2026-08" — mesmo formato/convencao ja usado em TrainingFrequencyCard.tsx (mes civil atual). */
function currentMonthParam(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Chip de icone do grid unificado do Perfil — gradiente sutil em vez de
 * fundo chapado (acabamento "premium" pedido no mockup aprovado). tone
 * "pro" so pro card Tryv Pro, levemente mais saturado.
 */
function GridIcon({ name, tone = 'primary' }: { name: React.ComponentProps<typeof Ionicons>['name']; tone?: 'primary' | 'pro' | 'danger' }) {
  return (
    <LinearGradient
      colors={
        tone === 'pro'
          ? ['rgba(107, 56, 212, 0.22)', 'rgba(132, 85, 239, 0.1)']
          : tone === 'danger'
            ? ['rgba(186, 26, 26, 0.16)', 'rgba(186, 26, 26, 0.06)']
            : ['rgba(107, 56, 212, 0.16)', 'rgba(107, 56, 212, 0.06)']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.tileIconWrap}
    >
      <Ionicons name={name} size={19} color={tone === 'danger' ? colors3.error : colors3.primary} />
    </LinearGradient>
  );
}

/**
 * Migrado pro tema claro "prism-glass" (colors3/GlassCard/ScreenBackground3)
 * — segunda migracao visual desta tela (a primeira foi liquiglass/colors2,
 * ver git log). So troca de tokens/componentes visuais, nenhum
 * useFocusEffect ou logica de dados foi alterada.
 *
 * PostGrid2/ProfileBadges2 ainda sao compartilhados com telas que nao
 * migraram (social/[userId].tsx, e settings/badges.tsx no caso do 2o) —
 * ganharam uma prop `variant` (padrao 'dark', 'light' so aqui), mesmo
 * padrao ja usado em EmptyFollowingState/ObscuredCard/TextField2 antes
 * nesta sessao.
 *
 * Cabecalho "Tryv" no topo: mesmo estilo de wordmark ja usado em
 * Home/Feed/Refeicoes/Login (typography3.displayLg, fontSize 36, weight
 * 800, cor primary).
 */
const historyKey = (item: HistoryItem) => item.id;
const galleryKey = (item: GalleryItem) => item.post_id;

export default function ProfileScreen() {
  const { user, refreshUser, refreshIsPro } = useAuth();
  const [restoringPurchases, setRestoringPurchases] = useState(false);

  // Modo desenvolvedor (depuracao da Vitalidade): escondido; 7 toques seguidos na linha de versao, em Configuracoes, o liga (e, de novo, o desliga).
  const [devMode, setDevMode] = useState(false);
  const devTapsRef = useRef<TapState | null>(null);
  useEffect(() => {
    void isDevModeEnabled().then(setDevMode);
  }, []);
  const handleVersionTap = () => {
    const { state, triggered } = nextTap(devTapsRef.current, Date.now());
    devTapsRef.current = state;
    if (!triggered) return;
    const next = !devMode;
    setDevMode(next);
    void setDevModeEnabled(next);
    Alert.alert(next ? 'Modo desenvolvedor ativado' : 'Modo desenvolvedor desativado');
  };
  const versionLabel = `Versão ${Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '—'}${
    Constants.nativeBuildVersion ? ` (${Constants.nativeBuildVersion})` : ''
  }`;

  // "Restaurar compras" (exigencia da Apple): restaura no SDK e pergunta ao servidor; so o servidor diz se e Pro.
  const handleRestorePurchases = async () => {
    if (!user || restoringPurchases) return;
    if (!isPurchasesAvailable()) {
      Alert.alert('Compras indisponíveis', 'Não foi possível acessar as compras neste momento. Tente novamente mais tarde.');
      return;
    }
    setRestoringPurchases(true);
    try {
      await restorePurchases(user.id);
      const result = await syncProAfterPurchase(refreshIsPro);
      if (result.isPro) Alert.alert('Compras restauradas', 'Sua assinatura Tryv Fit Pro está ativa.');
      else if (result.pending) Alert.alert('Ainda confirmando', 'Estamos confirmando sua assinatura. Tente novamente em instantes.');
      else Alert.alert('Nada para restaurar', 'Não encontramos uma assinatura ativa nesta conta Apple.');
    } catch (error) {
      Alert.alert(
        'Não foi possível restaurar',
        error instanceof PurchaseError ? error.message : 'Verifique sua conexão e tente novamente.'
      );
    } finally {
      setRestoringPurchases(false);
    }
  };
  // Abas (E4): cada uma busca so quando aberta pela 1a vez e guarda o resultado; trocar de aba nao refaz a chamada.
  const [tab, setTab] = useState<ProfileTab>('history');
  const [visited, setVisited] = useState(INITIAL_VISITED);
  const [historyFilterKey, setHistoryFilterKey] = useState('all');
  const historyType = HISTORY_FILTERS.find((f) => f.key === historyFilterKey)?.type;
  const history = usePagedFeed<HistoryItem>({
    fetchPage: (request) => getMyActivities({ ...request, type: historyType }),
    keyOf: historyKey,
    enabled: tab === 'history',
    resetKey: historyFilterKey,
  });
  const gallery = usePagedFeed<GalleryItem>({
    fetchPage: (request) => getGallery('me', request),
    keyOf: galleryKey,
    enabled: tab === 'gallery',
  });
  const weight = useWeightPoints(tab === 'progress');
  // Historico por mes (so apresentacao: todos os itens continuam carregados; mes recolhido so esconde as linhas). O mes atual e o anterior comecam
  // abertos; a escolha da pessoa vale ate trocar o filtro.
  const [openMonths, setOpenMonths] = useState<OpenOverrides>({});
  const selectHistoryFilter = (key: string) => {
    setOpenMonths({});
    setHistoryFilterKey(key);
  };
  const historyGroups = useMemo(() => groupHistoryByMonth(history.state.items), [history.state.items]);
  const historyRows = useMemo(
    () => buildHistoryRows(historyGroups, openMonths, historyFilterKey, history.state.hasMore),
    [historyGroups, openMonths, historyFilterKey, history.state.hasMore]
  );
  // Carrega mais paginas SOZINHO so enquanto o mes atual e o anterior (abertos) ainda podem estar incompletos; uma tentativa por tamanho da lista
  // (se uma pagina falhar nao fica tentando em laco: o botao no fim da lista continua disponivel).
  const autoLoadedAtRef = useRef(-1);
  useEffect(() => {
    const s = history.state;
    if (tab !== 'history' || !s.loaded || s.loading || s.loadingMore || s.refreshing || s.error) return;
    if (!shouldAutoLoadMore(s.items, s.hasMore)) return;
    if (autoLoadedAtRef.current === s.items.length) return;
    autoLoadedAtRef.current = s.items.length;
    history.loadMore();
  }, [tab, history.state, history.loadMore]);
  useEffect(() => {
    autoLoadedAtRef.current = -1; // trocou o filtro: recomeca
  }, [historyFilterKey]);
  // Convidar amigos para o app: cancelar a folha de compartilhar nao e erro (nada aparece); falha inesperada vira um aviso e a tela segue normal.
  const invitingRef = useRef(false);
  const handleInvite = async () => {
    if (invitingRef.current) return;
    invitingRef.current = true;
    try {
      if ((await shareInvite()) === 'failed') {
        Alert.alert('Não foi possível convidar', 'Não foi possível abrir o compartilhamento agora. Tente de novo em instantes.');
      }
    } finally {
      invitingRef.current = false;
    }
  };
  const selectTab = (next: ProfileTab) => {
    setTab(next);
    setVisited((prev) => markVisited(prev, next));
  };
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [badges, setBadges] = useState<UserBadges | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Avatar por IA (POST /users/me/avatar) -- mesmo padrao de escolha
  // camera/galeria de app/meal/add.tsx (2 botoes, nao Alert.alert), so que
  // dentro de um modal em vez de embutido na tela (aqui o gatilho e tocar
  // no Avatar do topo, nao um estagio de tela inteira como no wizard).
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarRemoving, setAvatarRemoving] = useState(false);
  // Consentimento ANTES de enviar a foto (OpenAI + imagem escolhida visivel a outros); menores/sem data de nascimento nao enviam foto.
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [pendingPick, setPendingPick] = useState<'camera' | 'library' | null>(null);
  const [avatarToggleKey, setAvatarToggleKey] = useState(0);
  const avatarRestricted = isAvatarRestricted(user?.date_of_birth);

  // Grid de consistencia (6 cards) — dados reais:
  // - Sequencia atual / Melhor sequencia: GET /dashboard/training-streaks
  //   (endpoint novo, sem filtro de periodo — sobre TODO o historico do
  //   usuario). Antes a sequencia atual vinha de computeCurrentStreak()
  //   sobre o training_frequency do MES atual, o que sub-contava sempre
  //   que a sequencia real comecasse antes do dia 1 (bug corrigido junto
  //   com a adicao de "Melhor sequencia", que nao tinha fonte nenhuma —
  //   ver investigacao). Mesmo bug documentado (e mitigado com um "N+")
  //   em TrainingFrequencyCard.tsx da Home, que continua como estava —
  //   fica pendente pra decidirem depois se corrigem la tambem.
  // - Dias ativos no mes: days_trained de /dashboard/training-frequency
  //   (esse SIM e por design um dado mensal, sem bug — nao mudou).
  // - Total de treinos: sessions_count de /dashboard/progress/workout
  //   (period=monthly) — nao dá pra somar as intensidades do heatmap pra
  //   isso (intensity satura em "3 ou mais", perde precisao).
  const [daysTrainedThisMonth, setDaysTrainedThisMonth] = useState(0);
  const [sessionsThisMonth, setSessionsThisMonth] = useState<number | null>(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState<number | null>(null);

  /*
   * DEBUG TEMPORARIO — investigacao do bug "historico de Saude sempre da
   * erro": a flag HEALTHKIT_CONNECTED_KEY (Keychain via expo-secure-store)
   * sobrevive a desinstalar/reinstalar o app (Keychain no iOS nao e limpo
   * por reinstalacao), entao um device que testou o HealthKit antes do
   * build atual pode ter essa flag "true" sem nunca ter concluido uma
   * autorizacao de verdade NESTE binario — o app entao pula
   * requestAuthorization achando que ja esta conectado. Este botao apaga a
   * flag e chama requestHealthPermissions() de novo, forcando o dialogo
   * real do sistema a aparecer.
   *
   * debug de HealthKit, escondido pre-lancamento — reativar manualmente
   * durante desenvolvimento se necessario.
   *
   * const handleDebugResetHealthKit = async () => {
   *   setResettingHealthKit(true);
   *   try {
   *     await SecureStore.deleteItemAsync(HEALTHKIT_CONNECTED_KEY);
   *     const granted = await requestHealthPermissions();
   *     console.log('[DEBUG resetHealthKit] requestHealthPermissions() ->', granted);
   *     if (granted) {
   *       await SecureStore.setItemAsync(HEALTHKIT_CONNECTED_KEY, 'true');
   *     }
   *     Alert.alert(
   *       'HealthKit resetado',
   *       granted
   *         ? 'Flag limpa e permissao solicitada de novo. Confira Ajustes > Saude > Acesso a Apps agora — o Tryv deveria aparecer na lista.'
   *         : 'Flag limpa, mas requestHealthPermissions() retornou false (ou lancou excecao — ver console). O app ainda pode nao aparecer em Ajustes > Saude.'
   *     );
   *   } catch (err) {
   *     console.error('[DEBUG resetHealthKit] falhou:', err);
   *     Alert.alert('Erro ao resetar', 'Veja o console pra detalhes.');
   *   } finally {
   *     setResettingHealthKit(false);
   *   }
   * };
   */

  /*
   * DEBUG TEMPORARIO — teste isolado do Health Connect (Etapa 2, ver
   * services/healthConnect.ts). So validava initialize()/requestPermission()/
   * getGrantedPermissions() de verdade no emulador Android antes de integrar.
   *
   * debug do Health Connect, escondido apos validacao da Etapa 2 (validada em
   * device real, emulador Android) — reativar manualmente durante
   * desenvolvimento se necessario. Mesmo padrao do debug de HealthKit acima.
   *
   * const [testingHealthConnect, setTestingHealthConnect] = useState(false);
   *
   * const handleDebugTestHealthConnect = async () => {
   *   if (Platform.OS !== 'android') {
   *     Alert.alert('So Android', 'Health Connect so existe no Android -- este teste nao se aplica a este device.');
   *     return;
   *   }
   *   setTestingHealthConnect(true);
   *   try {
   *     const available = await isHealthConnectAvailable();
   *     console.log('[DEBUG healthConnect] isHealthConnectAvailable() ->', available);
   *     if (!available) {
   *       Alert.alert(
   *         'Health Connect indisponivel',
   *         'getSdkStatus() nao retornou SDK_AVAILABLE -- app Health Connect no emulador nao instalado ou precisa atualizar. Ver console.'
   *       );
   *       return;
   *     }
   *
   *     const initialized = await initializeHealthConnect();
   *     console.log('[DEBUG healthConnect] initializeHealthConnect() ->', initialized);
   *     if (!initialized) {
   *       Alert.alert('Falha ao inicializar', 'initializeHealthConnect() retornou false -- ver console.');
   *       return;
   *     }
   *
   *     const granted = await requestHealthConnectPermissions();
   *     console.log('[DEBUG healthConnect] requestHealthConnectPermissions() ->', granted);
   *
   *     const grantedNow = await getGrantedHealthConnectPermissions();
   *     console.log('[DEBUG healthConnect] getGrantedHealthConnectPermissions() ->', grantedNow);
   *
   *     Alert.alert(
   *       'Health Connect testado',
   *       grantedNow.length > 0
   *         ? `Permissoes concedidas: ${grantedNow.map((p) => p.recordType).join(', ')}`
   *         : 'Nenhuma permissao concedida (usuario negou, ou dialogo nao apareceu -- ver console).'
   *     );
   *   } catch (err) {
   *     console.error('[DEBUG healthConnect] falhou:', err);
   *     Alert.alert('Erro no teste', 'Veja o console pra detalhes.');
   *   } finally {
   *     setTestingHealthConnect(false);
   *   }
   * };
   */

  /**
   * DEBUG TEMPORARIO — insere 1 dia de dado real (Steps + ActiveCaloriesBurned)
   * no Health Connect do emulador, so pra validar a Etapa 3 (o Health Connect
   * nao tem tela de "adicionar registro manual" nem jeito de popular via adb —
   * ver insertHealthConnectDebugTestData em services/healthConnect.ts).
   * REMOVER esta funcao e o botao que a chama assim que a Etapa 3 estiver
   * validada — o Tryv nao escreve dado de saude em producao.
   */
  const [seedingHealthConnectData, setSeedingHealthConnectData] = useState(false);
  // Guarda SINCRONA de reentrancia dos 2 botoes de debug de escrita: o
  // setState de "seeding..." so desabilita o botao no proximo frame, entao
  // um toque duplo rapido disparava o handler 2x -> registros duplicados no
  // Health Connect (sem clientRecordId, o HC nao deduplica). Mesmo padrao do
  // importingRef em app/activity/healthkit.tsx. Um ref so pros 2 botoes
  // (nao faz sentido rodar os dois ao mesmo tempo).
  const seedingHealthConnectRef = useRef(false);

  const generateAvatar = async (uri: string) => {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      await uploadAvatarSelfie(uri, AVATAR_CONSENT_VERSION);
      await refreshUser();
      setAvatarToggleKey((key) => key + 1);
      setAvatarPickerVisible(false);
    } catch (err) {
      setAvatarError(getApiErrorMessage(err, 'Não foi possível gerar seu avatar, tente novamente.'));
    } finally {
      setAvatarUploading(false);
    }
  };

  // "Remover avatar": so aparece com avatar. Confirma, chama DELETE /users/me/avatar e atualiza o usuario (as
  // iniciais voltam em todo o app). Um novo avatar pode ser gerado depois, como antes.
  const handleRemoveAvatar = () => {
    Alert.alert('Remover foto e avatar', 'Sua foto e seu avatar serão apagados e suas iniciais aparecerão no lugar. Você pode enviar outra foto depois.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setAvatarRemoving(true);
          setAvatarError(null);
          try {
            await deleteMyAvatar();
            await refreshUser();
            setAvatarPickerVisible(false);
          } catch (err) {
            setAvatarError(getApiErrorMessage(err, 'Não foi possível remover seu avatar, tente novamente.'));
          } finally {
            setAvatarRemoving(false);
          }
        },
      },
    ]);
  };

  // Nada e enviado antes do aceite: o toque em "Tirar foto"/"Escolher da galeria" abre o aviso primeiro (uma vez por abertura da tela).
  const requestAvatarPick = (kind: 'camera' | 'library') => {
    setAvatarError(null);
    if (consentAccepted) {
      if (kind === 'camera') handleTakeAvatarPhoto();
      else handlePickAvatarFromLibrary();
      return;
    }
    setPendingPick(kind);
    setConsentVisible(true);
  };

  const handleConsentAccept = () => {
    const kind = pendingPick;
    setConsentAccepted(true);
    setConsentVisible(false);
    setPendingPick(null);
    if (kind === 'camera') handleTakeAvatarPhoto();
    else if (kind === 'library') handlePickAvatarFromLibrary();
  };

  const handleConsentDecline = () => {
    setConsentVisible(false);
    setPendingPick(null);
  };

  const handleTakeAvatarPhoto = async () => {
    setAvatarError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setAvatarError('Permissão de câmera negada. Habilite nas configurações do celular.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets[0]) {
      generateAvatar(result.assets[0].uri);
    }
  };

  const handlePickAvatarFromLibrary = async () => {
    setAvatarError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setAvatarError('Permissão de galeria negada. Habilite nas configurações do celular.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      generateAvatar(result.assets[0].uri);
    }
  };

  const handleCloseAvatarPicker = () => {
    if (avatarUploading) return;
    setAvatarPickerVisible(false);
    setAvatarError(null);
  };

  const handleDebugSeedHealthConnectData = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Só Android', 'Health Connect só existe no Android -- este teste não se aplica a este device.');
      return;
    }
    if (seedingHealthConnectRef.current) return;
    seedingHealthConnectRef.current = true;
    setSeedingHealthConnectData(true);
    try {
      const { steps, kcal } = await insertHealthConnectDebugTestData();
      console.log('[DEBUG healthConnect] insertHealthConnectDebugTestData() ->', { steps, kcal });
      Alert.alert(
        'Dado de teste inserido',
        `${steps} passos e ${kcal} kcal ativas cobrindo hoje. Va pra Home ou Atividades pra conferir.`
      );
    } catch (err) {
      console.error('[DEBUG healthConnect] insertHealthConnectDebugTestData() falhou:', err);
      Alert.alert('Erro ao inserir dado', 'Veja o console pra detalhes.');
    } finally {
      seedingHealthConnectRef.current = false;
      setSeedingHealthConnectData(false);
    }
  };

  /**
   * DEBUG TEMPORARIO — mesma logica do botao acima, agora pra FC (amostras),
   * Sono (1 sessao com estagios) e 1 treino de corrida com rota GPS, pra
   * validar as Etapas 4-6 (ver insertHealthConnectDebugFcSonoTreino em
   * services/healthConnect.ts). REMOVER esta funcao e o botao que a chama
   * assim que as Etapas 4-6 estiverem validadas.
   */
  const [seedingHealthConnectFcSonoTreino, setSeedingHealthConnectFcSonoTreino] = useState(false);

  const handleDebugSeedHealthConnectFcSonoTreino = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Só Android', 'Health Connect só existe no Android -- este teste não se aplica a este device.');
      return;
    }
    if (seedingHealthConnectRef.current) return;
    seedingHealthConnectRef.current = true;
    setSeedingHealthConnectFcSonoTreino(true);
    try {
      const result = await insertHealthConnectDebugFcSonoTreino();
      console.log('[DEBUG healthConnect] insertHealthConnectDebugFcSonoTreino() ->', result);
      Alert.alert(
        'Dado de teste inserido',
        `${result.heartRateSamples} amostras de FC, ~${result.sleepHours.toFixed(1)}h de sono (última noite) e 1 corrida de ${result.workoutMinutes}min com rota GPS. Confira FC/Sono na Home e "Importar treinos" em Atividades.`
      );
    } catch (err) {
      console.error('[DEBUG healthConnect] insertHealthConnectDebugFcSonoTreino() falhou:', err);
      Alert.alert('Erro ao inserir dado', 'Veja o console pra detalhes.');
    } finally {
      seedingHealthConnectRef.current = false;
      setSeedingHealthConnectFcSonoTreino(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      listUserPosts(user.id)
        .then((posts) => {
          if (active) setMyPosts(posts);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [user])
  );

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      Promise.all([listFollowers(user.id), listFollowing(user.id)])
        .then(([followers, following]) => {
          if (active) {
            setFollowersCount(followers.length);
            setFollowingCount(following.length);
          }
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [user])
  );

  // O selo Pro e so exibicao — qualquer falha (ex: rede) simplesmente
  // nao mostra nada, sem bloquear o resto do perfil.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      getUserBadges(user.id)
        .then((data) => {
          if (active) setBadges(data);
        })
        .catch(() => {
          if (active) setBadges(null);
        });
      return () => {
        active = false;
      };
    }, [user])
  );

  // Grid de consistencia — falha em qualquer uma das chamadas so deixa o
  // card correspondente sem numero (0/"--"), nao bloqueia o resto do perfil.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getTrainingFrequency({ month: currentMonthParam() })
        .then((data) => {
          if (active) setDaysTrainedThisMonth(data.days_trained);
        })
        .catch(() => {
          if (active) setDaysTrainedThisMonth(0);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getWorkoutProgress('monthly')
        .then((data) => {
          if (active) setSessionsThisMonth(data.sessions_count);
        })
        .catch(() => {
          if (active) setSessionsThisMonth(null);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getTrainingStreaks()
        .then((data) => {
          if (active) {
            setCurrentStreak(data.current_streak_days);
            setBestStreak(data.best_streak_days);
          }
        })
        .catch(() => {
          if (active) {
            setCurrentStreak(0);
            setBestStreak(null);
          }
        });
      return () => {
        active = false;
      };
    }, [])
  );

  // ---- Perfil com abas (E4): cabecalho + abas (Historico, Galeria, Progresso, Conquistas) numa FlatList so; "Configuracoes" e "Meus posts" no rodape.
  const consistencyTiles = (
    <View style={styles.grid}>
          <View style={styles.gridRow}>
            <View style={styles.gridCell}>
              <GlassCard variant="card" style={styles.tile}>
                <GridIcon name="flash" />
                <Text style={styles.tileLabel}>Sequência atual</Text>
                <Text style={styles.tileValue}>
                  {currentStreak}
                  <Text style={styles.tileUnit}> {currentStreak === 1 ? 'dia' : 'dias'}</Text>
                </Text>
              </GlassCard>
            </View>
            <View style={styles.gridCell}>
              <GlassCard variant="card" style={styles.tile}>
                <GridIcon name="trophy" />
                <Text style={styles.tileLabel}>Melhor sequência</Text>
                {bestStreak != null ? (
                  <Text style={styles.tileValue}>
                    {bestStreak}
                    <Text style={styles.tileUnit}> {bestStreak === 1 ? 'dia' : 'dias'}</Text>
                  </Text>
                ) : (
                  <Text style={[styles.tileValue, styles.tileValueMuted]}>--</Text>
                )}
              </GlassCard>
            </View>
          </View>

          <View style={styles.gridRow}>
            <View style={styles.gridCell}>
              <GlassCard variant="card" style={styles.tile}>
                <GridIcon name="barbell" />
                <Text style={styles.tileLabel}>Total de treinos</Text>
                <Text style={styles.tileValue}>{sessionsThisMonth ?? '--'}</Text>
              </GlassCard>
            </View>
            <View style={styles.gridCell}>
              <GlassCard variant="card" style={styles.tile}>
                <GridIcon name="calendar-outline" />
                <Text style={styles.tileLabel}>Dias ativos no mês</Text>
                <Text style={styles.tileValue}>{daysTrainedThisMonth}</Text>
              </GlassCard>
            </View>
          </View>

    </View>
  );

  const settingsSection = (
    <View style={styles.settingsSection}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Configurações
      </Text>
      <Text style={styles.email}>{user?.email}</Text>
        {/*
          Grid unificado premium (2 colunas) — substitui o grid de
          consistencia (6 tiles) + os 3 itens de lista que duplicavam Meta
          calorica/Tryv Pro. 7 cards no total, 1 estilo so: icone em chip
          com gradiente sutil, label pequeno, valor grande em mono. Cards de
          metrica (Sequencia atual/Melhor sequencia/Total de treinos/Dias
          ativos no mes) nao navegam, sem chevron. Cards de navegacao (Meta
          calorica diaria/Tryv Pro/Meus selos) navegam pra tela real —
          mesmos onPress de antes, nenhuma logica mudou. Impar (7): "Meus
          selos e conquistas" ocupa a linha inteira sozinho, em layout
          horizontal, em vez de deixar buraco vazio.

          Cada tile fica dentro de um wrapper (styles.gridCell/
          gridCellFull) que e o pai DIRETO do GlassCard — e nesse wrapper
          (nao no `style` do GlassCard, que so alcanca o `content` interno,
          2 niveis abaixo do `shadowWrapper` que de fato controla a largura
          na row) que a largura de 50%/100% e a sombra sao aplicadas. Bug
          antigo (statTile com flexBasis:'47%'+flexGrow:1 direto no `style`
          do GlassCard) causava ambiguidade de largura exatamente por isso:
          a porcentagem resolvia contra o `wrapper` interno do GlassCard,
          que por sua vez so tem largura definida se algo acima dele
          definir — cadeia circular sem ancora, dependendo da ordem de
          resolucao do Yoga. Com flex:1 no wrapper OUTER dentro de uma row,
          nao ha ambiguidade: o Yoga resolve a row primeiro (2 filhos
          flex:1 dividem o espaco restante apos o gap), e o GlassCard por
          dentro so preenche (alignItems:'stretch' e o padrao de todo View
          coluna) a largura que o wrapper ja decidiu.

          Sequencia atual/Melhor sequencia vem de GET
          /dashboard/training-streaks (endpoint real, sobre todo o
          historico do usuario). Se bestStreak falhar, fica null e mostra
          "--" (nao 0, pra nao confundir "sem dado" com "sequencia zero").
        */}
      <View style={styles.grid}>
          <View style={styles.gridRow}>
            <View style={styles.gridCell}>
              <Pressable onPress={() => router.push('/settings/calorie-goal')}>
                <GlassCard variant="card" style={styles.tile}>
                  <View style={styles.tileTopRow}>
                    <GridIcon name="flame" />
                    <Ionicons name="chevron-forward" size={16} color={colors3.outline} />
                  </View>
                  <Text style={styles.tileLabel}>Meta calórica diária</Text>
                  {user?.daily_calorie_goal != null ? (
                    <Text style={styles.tileValue}>
                      {Math.round(user.daily_calorie_goal)}
                      <Text style={styles.tileUnit}> kcal/dia</Text>
                    </Text>
                  ) : (
                    <Text style={[styles.tileValue, styles.tileValueMuted]}>Não definida</Text>
                  )}
                </GlassCard>
              </Pressable>
            </View>
            <View style={styles.gridCell}>
              <Pressable onPress={() => router.push('/subscriptions/pro')}>
                <GlassCard variant="card" style={styles.tile}>
                  <View style={styles.tileTopRow}>
                    <GridIcon name="star" tone="pro" />
                    <Ionicons name="chevron-forward" size={16} color={colors3.outline} />
                  </View>
                  <Text style={styles.tileLabel}>Tryv Fit Pro</Text>
                  <Text style={[styles.tileValue, badges?.is_pro && styles.tileValuePro]}>
                    {badges?.is_pro ? 'PRO' : 'Assinar'}
                  </Text>
                </GlassCard>
              </Pressable>
            </View>
          </View>

          <View style={styles.gridCellFull}>
            <Pressable onPress={() => router.push('/settings/badges')}>
              <GlassCard variant="card" style={[styles.tile, styles.tileFullRow]} padding={spacing3.md}>
                <GridIcon name="ribbon" />
                <View style={styles.tileFullTexts}>
                  <Text style={styles.tileFullTitle}>Meus selos e conquistas</Text>
                  <Text style={styles.tileFullSubtitle}>Status Pro e vínculos com profissionais</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors3.outline} />
              </GlassCard>
            </Pressable>
          </View>

          <View style={styles.gridCellFull}>
            <Pressable onPress={() => router.push('/inventory')}>
              <GlassCard variant="card" style={[styles.tile, styles.tileFullRow]} padding={spacing3.md}>
                <GridIcon name="bicycle" />
                <View style={styles.tileFullTexts}>
                  <Text style={styles.tileFullTitle}>Meu equipamento</Text>
                  <Text style={styles.tileFullSubtitle}>Tênis, bike, relógio e fita cardíaca</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors3.outline} />
              </GlassCard>
            </Pressable>
          </View>

          <View style={styles.gridCellFull}>
            <Pressable onPress={() => router.push('/settings/edit-profile')} accessibilityRole="button" accessibilityLabel="Editar perfil">
              <GlassCard variant="card" style={[styles.tile, styles.tileFullRow]} padding={spacing3.md}>
                <GridIcon name="create-outline" />
                <View style={styles.tileFullTexts}>
                  <Text style={styles.tileFullTitle}>Editar perfil</Text>
                  <Text style={styles.tileFullSubtitle}>@usuário, bio e link</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors3.outline} />
              </GlassCard>
            </Pressable>
          </View>

          <View style={styles.gridCellFull}>
            <Pressable onPress={() => router.push('/settings/blocked')} accessibilityRole="button">
              <GlassCard variant="card" style={[styles.tile, styles.tileFullRow]} padding={spacing3.md}>
                <GridIcon name="ban-outline" />
                <View style={styles.tileFullTexts}>
                  <Text style={styles.tileFullTitle}>Usuários bloqueados</Text>
                  <Text style={styles.tileFullSubtitle}>Quem você bloqueou no Social</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors3.outline} />
              </GlassCard>
            </Pressable>
          </View>

          <View style={styles.gridCellFull}>
            <Pressable onPress={() => void handleRestorePurchases()} disabled={restoringPurchases} accessibilityRole="button" accessibilityLabel="Restaurar compras">
              <GlassCard variant="card" style={[styles.tile, styles.tileFullRow]} padding={spacing3.md}>
                <GridIcon name="refresh-outline" />
                <View style={styles.tileFullTexts}>
                  <Text style={styles.tileFullTitle}>Restaurar compras</Text>
                  <Text style={styles.tileFullSubtitle}>Recupere o Tryv Fit Pro neste aparelho</Text>
                </View>
                {restoringPurchases ? (
                  <ActivityIndicator color={colors3.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors3.outline} />
                )}
              </GlassCard>
            </Pressable>
          </View>

          <View style={styles.gridCellFull}>
            <Pressable onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL).catch(() => {})} accessibilityRole="link" accessibilityLabel="Gerenciar assinatura">
              <GlassCard variant="card" style={[styles.tile, styles.tileFullRow]} padding={spacing3.md}>
                <GridIcon name="card-outline" />
                <View style={styles.tileFullTexts}>
                  <Text style={styles.tileFullTitle}>Gerenciar assinatura</Text>
                  <Text style={styles.tileFullSubtitle}>Cancele ou altere em Ajustes da Apple</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={colors3.outline} />
              </GlassCard>
            </Pressable>
          </View>

          <View style={styles.gridCellFull}>
            <Pressable onPress={() => openSupportEmail('Contato e denúncias no Tryv')} accessibilityRole="button">
              <GlassCard variant="card" style={[styles.tile, styles.tileFullRow]} padding={spacing3.md}>
                <GridIcon name="mail-outline" />
                <View style={styles.tileFullTexts}>
                  <Text style={styles.tileFullTitle}>Contato e denúncias</Text>
                  <Text style={styles.tileFullSubtitle}>Fale com a gente por e-mail</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors3.outline} />
              </GlassCard>
            </Pressable>
          </View>

          <View style={styles.gridCellFull}>
            <Pressable onPress={() => router.push('/settings/delete-account')} accessibilityRole="button" accessibilityLabel="Excluir conta">
              <GlassCard variant="card" style={[styles.tile, styles.tileFullRow]} padding={spacing3.md}>
                <GridIcon name="trash-outline" tone="danger" />
                <View style={styles.tileFullTexts}>
                  <Text style={[styles.tileFullTitle, styles.dangerText]}>Excluir conta</Text>
                  <Text style={styles.tileFullSubtitle}>Apague sua conta e seus dados</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors3.outline} />
              </GlassCard>
            </Pressable>
          </View>
      </View>

        {devMode && (
          <Pressable onPress={() => router.push('/dev-vitality' as never) /* rota nova: os tipos de rotas (.expo/types) so se atualizam no proximo expo start */} accessibilityRole="button" style={styles.versionRow}>
            <Text style={styles.devLink}>Depuração da Vitalidade</Text>
          </Pressable>
        )}
        <Pressable onPress={handleVersionTap} style={styles.versionRow} accessibilityLabel={versionLabel}>
          <Text style={styles.versionText}>{versionLabel}</Text>
        </Pressable>

        {/*
          debug de HealthKit, escondido pre-lancamento — reativar
          manualmente durante desenvolvimento se necessario. Ver
          handleDebugResetHealthKit comentado acima.

          <Pressable style={styles.optionWrap} onPress={handleDebugResetHealthKit} disabled={resettingHealthKit}>
            <GlassCard variant="card" style={styles.optionCard} padding={spacing3.md}>
              <View style={styles.optionRow}>
                <View style={styles.optionIconWrap}>
                  <Ionicons name="bug" size={20} color={colors3.error} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>[DEBUG] Resetar conexao HealthKit</Text>
                  <Text style={styles.optionSubtitle}>
                    {resettingHealthKit ? 'Resetando...' : 'Limpa a flag local e pede autorizacao de novo'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
              </View>
            </GlassCard>
          </Pressable>
        */}

        {/*
          debug do Health Connect, escondido apos validacao da Etapa 2
          (validada em device real, emulador Android) — reativar manualmente
          durante desenvolvimento se necessario. Ver handleDebugTestHealthConnect
          comentado acima. Mesmo padrao do debug de HealthKit.

          <Pressable style={styles.optionWrap} onPress={handleDebugTestHealthConnect} disabled={testingHealthConnect}>
            <GlassCard variant="card" style={styles.optionCard} padding={spacing3.md}>
              <View style={styles.optionRow}>
                <View style={styles.optionIconWrap}>
                  <Ionicons name="bug" size={20} color={colors3.error} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>[DEBUG] Testar Health Connect</Text>
                  <Text style={styles.optionSubtitle}>
                    {testingHealthConnect ? 'Testando...' : 'initialize() + requestPermission() (so Android)'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
              </View>
            </GlassCard>
          </Pressable>
        */}

        {/*
          DEBUG TEMPORARIO -- insere dado de teste (Steps + ActiveCaloriesBurned
          de hoje) no Health Connect do emulador, pra validar a Etapa 3 com
          numero real. So renderiza em desenvolvimento (__DEV__): nunca aparece
          em build de release/preview. REMOVER (funcao + botao) depois que a
          Etapa 3 for validada -- o Tryv nao escreve dado de saude em producao.
        */}
        {__DEV__ && (
          <Pressable
            style={styles.optionWrap}
            onPress={handleDebugSeedHealthConnectData}
            disabled={seedingHealthConnectData}
          >
            <GlassCard variant="card" style={styles.optionCard} padding={spacing3.md}>
              <View style={styles.optionRow}>
                <View style={styles.optionIconWrap}>
                  <Ionicons name="bug" size={20} color={colors3.error} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>[DEBUG] Inserir dado de teste (Health Connect)</Text>
                  <Text style={styles.optionSubtitle}>
                    {seedingHealthConnectData ? 'Inserindo...' : '8.500 passos + 320 kcal cobrindo hoje (só Android)'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
              </View>
            </GlassCard>
          </Pressable>
        )}

        {/*
          DEBUG TEMPORARIO -- insere FC (amostras), Sono (1 sessao com
          estagios) e 1 treino de corrida com rota GPS no Health Connect do
          emulador, pra validar as Etapas 4-6 com numero real. So renderiza em
          desenvolvimento (__DEV__): nunca aparece em build de release/preview.
          REMOVER (funcao + botao) depois que as Etapas 4-6 forem validadas --
          o Tryv nao escreve dado de saude em producao.
        */}
        {__DEV__ && (
          <Pressable
            style={styles.optionWrap}
            onPress={handleDebugSeedHealthConnectFcSonoTreino}
            disabled={seedingHealthConnectFcSonoTreino}
          >
            <GlassCard variant="card" style={styles.optionCard} padding={spacing3.md}>
              <View style={styles.optionRow}>
                <View style={styles.optionIconWrap}>
                  <Ionicons name="bug" size={20} color={colors3.error} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>[DEBUG] Inserir FC/Sono/Treino de teste (Health Connect)</Text>
                  <Text style={styles.optionSubtitle}>
                    {seedingHealthConnectFcSonoTreino ? 'Inserindo...' : 'Amostras de FC + noite de sono + corrida com rota (só Android)'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
              </View>
            </GlassCard>
          </Pressable>
        )}

    </View>
  );

  const postsSection = (
        <View style={styles.postsSection}>
          <Text style={styles.sectionTitle}>Meus posts</Text>
          {myPosts.length > 0 ? (
            <PostGrid2 posts={myPosts} variant="light" />
          ) : (
            <Text style={styles.emptyText}>Você ainda não publicou nada.</Text>
          )}
        </View>
  );

  const listHeader = (
    <View style={styles.listHeader}>
        <Text style={styles.logo}>Tryv Fit</Text>

        {/*
          Overall (carta de jogador): o card agora carrega a identidade (avatar + nome), entao
          o bloco avatar/nome que ficava aqui saiu. O avatar abaixo e o MESMO elemento de antes
          (Pressable que abre a troca/geracao de avatar, com o badge de camera), so em 64 px e
          passado pro card por prop. Avatar e nome aparecem mesmo se o overall falhar.
        */}
        <View style={styles.overallWrap}>
          <OverallCard
            name={user?.name ?? ''}
            avatar={
              <Pressable onPress={() => setAvatarPickerVisible(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Trocar avatar">
                <Avatar
                  initials={user ? getInitials(user.name) : '?'}
                  imageUrl={user?.avatar_url}
                  thumbUrl={user?.avatar_thumb_url}
                  size={64}
                  style={styles.avatarRing}
                />
                <View style={styles.avatarEditBadge}>
                  <Ionicons name="camera" size={12} color={colors3.onPrimary} />
                </View>
              </Pressable>
            }
          />
        </View>


        <Pressable style={styles.followStatsRow} onPress={() => router.push('/social/follows')}>
          <View style={styles.followStat}>
            <Text style={styles.followStatNumber}>{followersCount}</Text>
            <Text style={styles.followStatLabel}>Seguidores</Text>
          </View>
          <View style={styles.followStatDivider} />
          <View style={styles.followStat}>
            <Text style={styles.followStatNumber}>{followingCount}</Text>
            <Text style={styles.followStatLabel}>Seguindo</Text>
          </View>
        </Pressable>

        <View style={styles.badgesWrap}>
          {/*
            variant="light" — ProfileBadges2 ainda e escuro por padrao (os 2
            outros usos acima seguem sem migrar), mesmo padrao de prop
            variant ja usado em EmptyFollowingState/ObscuredCard/TextField2
            nesta sessao pra nao afetar quem ainda nao migrou.
          */}
          <ProfileBadges2 badges={badges} variant="light" />
        </View>

        <ProfileIdentity
          username={user?.username}
          bio={user?.bio}
          link={user?.link}
          onEdit={() => router.push('/settings/edit-profile')}
          onInvite={handleInvite}
        />
        <PillTabs tabs={PROFILE_TABS} selected={tab} onSelect={selectTab} />
        {tab === 'history' && <HistoryFilterChips selectedKey={historyFilterKey} onSelect={selectHistoryFilter} />}
        {tab === 'history' && !!historyTotalText(history.state.items.length, history.state.hasMore, historyFilterKey) && (
          <Text style={styles.historyTotal} accessibilityLiveRegion="polite">
            {historyTotalText(history.state.items.length, history.state.hasMore, historyFilterKey)}
          </Text>
        )}
        {visited.progress && (
          <View style={tab === 'progress' ? styles.tabBody : styles.hidden}>
            <ProgressTab
              points={weight.points}
              error={weight.error}
              onRetry={weight.retry}
              weightKg={user?.weight}
              heightCm={user?.height}
              bodyFatPercentage={user?.body_fat_percentage}
              consistency={consistencyTiles}
            />
          </View>
        )}
        {visited.achievements && (
          <View style={tab === 'achievements' ? styles.tabBody : styles.hidden}>
            <AchievementsTab badges={badges} currentStreak={currentStreak} bestStreak={bestStreak} />
          </View>
        )}
    </View>
  );

  const activeFeed = tab === 'history' ? history : tab === 'gallery' ? gallery : null;
  const listData: unknown[] = tab === 'history' ? historyRows : tab === 'gallery' ? gallery.state.items : [];
  const listEmpty =
    activeFeed === null ? null : activeFeed.state.loading || (!activeFeed.state.loaded && !activeFeed.state.error) ? (
      <FeedLoading />
    ) : activeFeed.state.error ? (
      <FeedError
        message={tab === 'history' ? 'Não foi possível carregar o histórico.' : 'Não foi possível carregar a galeria.'}
        onRetry={activeFeed.retry}
      />
    ) : tab === 'history' ? (
      historyFilterKey !== 'all' ? (
        <FeedEmpty icon="barbell-outline" title="Nenhuma atividade neste filtro" text="Tente outro filtro ou escolha Tudo para ver todas as atividades." />
      ) : (
        <FeedEmpty icon="barbell-outline" title="Nenhuma atividade ainda" text="Seus treinos, corridas e outras atividades aparecem aqui." />
      )
    ) : (
      <FeedEmpty icon="images-outline" title="Nenhuma foto ainda" text="As fotos dos posts que você publica aparecem aqui. Fotos de refeição não entram na galeria." />
    );
  const listFooter = (
    <View style={styles.listFooter}>
      <FeedFooterLoading visible={!!activeFeed?.state.loadingMore} />
      {tab === 'history' && history.state.hasMore && !history.state.loadingMore && history.state.loaded && (
        <Pressable
          onPress={() => history.loadMore()}
          style={styles.loadOlder}
          accessibilityRole="button"
          accessibilityLabel="Carregar atividades mais antigas"
        >
          <Text style={styles.loadOlderText}>Carregar atividades mais antigas</Text>
        </Pressable>
      )}
      {settingsSection}
      {postsSection}
    </View>
  );

  return (
    <ScreenBackground3>
      <FlatList
        key={tab === 'gallery' ? 'gallery' : 'list'}
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        data={listData}
        numColumns={tab === 'gallery' ? GALLERY_COLUMNS : 1}
        keyExtractor={(item) => (tab === 'gallery' ? (item as GalleryItem).post_id : (item as HistoryListRow).key)}
        renderItem={({ item }) => {
          if (tab === 'gallery') return <GalleryCell item={item as GalleryItem} />;
          const row = item as HistoryListRow;
          return row.kind === 'header' ? (
            <MonthHeader row={row} onToggle={() => setOpenMonths((prev) => toggleMonth(prev, { key: row.monthKey, defaultOpen: row.open }))} />
          ) : (
            <HistoryRow item={row.item} />
          );
        }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReachedThreshold={0.4}
        onEndReached={() => activeFeed?.loadMore()}
        refreshControl={
          activeFeed ? (
            <RefreshControl refreshing={activeFeed.state.refreshing} onRefresh={activeFeed.refresh} tintColor={colors3.primary} />
          ) : undefined
        }
      />


      <Modal visible={avatarPickerVisible} animationType="slide" transparent onRequestClose={handleCloseAvatarPicker}>
        <View style={styles.avatarModalBackdrop}>
          <View style={styles.avatarModalSheet}>
            <View style={styles.avatarModalHeader}>
              <Text style={styles.avatarModalTitle}>Foto e avatar</Text>
              <Pressable onPress={handleCloseAvatarPicker} hitSlop={12} disabled={avatarUploading || avatarRemoving}>
                <Ionicons name="close" size={24} color={colors3.onSurface} />
              </Pressable>
            </View>

            {!!avatarError && <Text style={styles.avatarModalError}>{avatarError}</Text>}

            {avatarUploading || avatarRemoving ? (
              <View style={styles.avatarModalLoading}>
                <ActivityIndicator size="large" color={colors3.primary} />
                <Text style={styles.avatarModalLoadingText}>{avatarRemoving ? 'Removendo sua foto e seu avatar...' : AVATAR_LOADING_TEXT}</Text>
              </View>
            ) : (
              <View style={styles.avatarPickButtons}>
                {!avatarRestricted && <AvatarSourceToggle onChanged={refreshUser} refreshKey={avatarToggleKey} />}
                {avatarRestricted && (
                  <Text style={styles.avatarModalError} accessibilityRole="alert">
                    {AVATAR_MINOR_MESSAGE}
                  </Text>
                )}
                {!avatarRestricted && (
                  <>
                    <Pressable style={styles.avatarPickButton} onPress={() => requestAvatarPick('camera')}>
                      <Ionicons name="camera" size={28} color={colors3.primary} />
                      <Text style={styles.avatarPickButtonText}>Tirar foto</Text>
                    </Pressable>
                    <Pressable style={styles.avatarPickButton} onPress={() => requestAvatarPick('library')}>
                      <Ionicons name="images" size={28} color={colors3.primary} />
                      <Text style={styles.avatarPickButtonText}>Escolher da galeria</Text>
                    </Pressable>
                  </>
                )}
                {!!user?.avatar_url && (
                  <Pressable
                    style={styles.avatarPickButton}
                    onPress={handleRemoveAvatar}
                    accessibilityRole="button"
                    accessibilityLabel="Remover foto e avatar"
                  >
                    <Ionicons name="trash-outline" size={28} color={colors3.error} />
                    <Text style={[styles.avatarPickButtonText, { color: colors3.error }]}>Remover foto e avatar</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
      <AvatarConsentModal visible={consentVisible} onAccept={handleConsentAccept} onDecline={handleConsentDecline} />
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  logo: { ...typography3.displayLg, fontSize: 36, fontWeight: '800', color: colors3.primary, marginBottom: spacing3.lg },
  // Borda do avatar sobre o card escuro do Overall.
  avatarRing: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)' },
  // Badge de camera sobre o avatar de 64 px; a borda tem a cor do fundo do card pra "recortar" o avatar quadrado; o selo continua redondo.
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors3.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1B1236',
  },
  email: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginTop: spacing3.xs, marginBottom: spacing3.sm },

  avatarModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  avatarModalSheet: {
    backgroundColor: colors3.background,
    borderTopLeftRadius: radius3.xl,
    borderTopRightRadius: radius3.xl,
    padding: spacing3.lg,
    paddingBottom: spacing3.xl,
    gap: spacing3.md,
  },
  avatarModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatarModalTitle: { ...typography3.headlineMd, fontSize: 18 },
  avatarModalError: { color: colors3.error, textAlign: 'center' },
  avatarModalLoading: { alignItems: 'center', paddingVertical: spacing3.xl },
  avatarModalLoadingText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginTop: spacing3.md },
  avatarPickButtons: { gap: spacing3.md },
  avatarPickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.md,
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    borderRadius: radius3.lg,
    padding: spacing3.lg,
  },
  avatarPickButtonText: { ...typography3.headlineMd, fontSize: 16 },

  followStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.lg,
    marginBottom: spacing3.lg,
  },
  followStat: { alignItems: 'center', minWidth: 72 },
  followStatDivider: { width: 1, height: 28, backgroundColor: colors3.outlineVariant },
  followStatNumber: { ...typography3.headlineLg, fontSize: 20, lineHeight: 24, color: colors3.onSurface },
  followStatLabel: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, marginTop: 2 },

  overallWrap: { marginBottom: spacing3.md, width: '100%' },
  badgesWrap: { marginBottom: spacing3.lg, width: '100%' },

  // Grid unificado premium (2 colunas) — ver comentario extenso na JSX
  // sobre por que a largura/sombra vivem no wrapper (gridCell/gridCellFull)
  // e nao no `style` do GlassCard.
  grid: { width: '100%', gap: spacing3.sm, marginBottom: spacing3.lg },
  gridRow: { flexDirection: 'row', gap: spacing3.sm },
  gridCell: {
    flex: 1,
    borderRadius: radius3.xl,
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  gridCellFull: {
    width: '100%',
    borderRadius: radius3.xl,
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  tile: { gap: spacing3.xs },
  tileTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tileIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius3.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
  // Unificado pro mesmo token de HealthMetricsGrid (typography3.headlineLg,
  // Inter_700Bold) -- era JetBrainsMono, inconsistente com o padrao de
  // referencia do mockup original (ver MonthComparisonCard/"Ultimos 30
  // dias" na Home, corrigidos antes).
  tileValue: {
    ...typography3.headlineLg,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.5,
    color: colors3.onSurface,
  },
  // letterSpacing:0 explicito -- sem isso, o -0.5 de tileValue (calibrado
  // pro numero grande em Bold) vazava aqui via [tileValue, tileValueMuted]
  // (RN so sobrescreve as chaves que tileValueMuted de fato redefine; como
  // ele nunca mexia em letterSpacing, o -0.5 continuava valendo). Pra um
  // numero curto ("--") isso e imperceptivel, mas pra "Nao definida" (13
  // caracteres) o tracking negativo acumulado fazia as letras
  // se espremerem/sobrepor — causa real do espacamento estranho relatado.
  tileValueMuted: {
    ...typography3.headlineMd,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
    color: colors3.onSurfaceVariant,
  },
  tileValuePro: { color: colors3.primary },
  tileUnit: { ...typography3.bodyMd, fontSize: 12, color: colors3.onSurfaceVariant },

  // "Meus selos e conquistas" — 7o card (impar), ocupa a linha inteira
  // sozinho em layout horizontal (mais parecido com item de lista largo).
  tileFullRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  tileFullTexts: { flex: 1, gap: 2 },
  tileFullTitle: { ...typography3.bodyMd, fontWeight: '700', fontSize: 15 },
  dangerText: { color: colors3.error },
  versionRow: { alignItems: 'center', paddingVertical: spacing3.md },
  versionText: { ...typography3.labelSm, textTransform: 'none', color: colors3.outline },
  devLink: { ...typography3.bodyMd, fontSize: 14, fontWeight: '700', color: colors3.primary, textDecorationLine: 'underline' },
  tileFullSubtitle: { ...typography3.bodyMd, fontSize: 12.5, color: colors3.onSurfaceVariant },

  // challengesSection/challengeCard* — usados so pelo bloco "Desafios de
  // profissionais" comentado (marketplace escondido pre-lancamento, ver
  // acima). Deixados como estavam (colors2), inertes, ate o relancamento.

  optionWrap: { width: '100%', marginBottom: spacing3.sm },
  optionCard: { width: '100%' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius3.md,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: { flex: 1, gap: 4 },
  optionTitle: { ...typography3.bodyMd, fontWeight: '700' },
  optionSubtitle: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },

  postsSection: { width: '100%', marginTop: spacing3.lg, gap: spacing3.sm },
  // Perfil com abas (E4)
  listContent: { paddingTop: spacing3.xl, padding: spacing3.containerMargin, paddingBottom: spacing3.xl },
  listHeader: { alignItems: 'center', width: '100%', gap: spacing3.sm },
  tabBody: { alignSelf: 'stretch', marginTop: spacing3.sm },
  hidden: { display: 'none' },
  listFooter: { width: '100%' },
  historyTotal: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, textAlign: 'center' },
  loadOlder: {
    minHeight: 48,
    marginVertical: spacing3.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius3.pill,
    borderWidth: 1,
    borderColor: colors3.primary,
  },
  loadOlderText: { ...typography3.labelMd, color: colors3.primary, textTransform: 'none' },
  settingsSection: { width: '100%', marginTop: spacing3.xl, alignItems: 'center', gap: spacing3.sm },
  sectionTitle: { ...typography3.headlineMd, fontSize: 18 },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
});
