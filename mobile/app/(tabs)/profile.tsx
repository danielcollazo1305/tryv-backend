import React, { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/Avatar';
import { GlassCard } from '@/components/GlassCard';
import { HEALTHKIT_CONNECTED_KEY } from '@/components/HealthSummaryCard';
import { HeatmapDay, HeatmapGrid, todayKey } from '@/components/HeatmapGrid';
import { PostGrid2 } from '@/components/PostGrid2';
import { ProfileBadges2 } from '@/components/ProfileBadges2';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { requestHealthPermissions } from '@/services/health';
import {
  Challenge,
  buildAutomaticChallengeHeatmapDays,
  buildChallengeHeatmapDays,
  getChallengeProgress,
  listMyActiveChallenges,
  listMyChallengeCheckins,
} from '@/services/challenges';
import { getTrainingFrequency, getTrainingStreaks, getWorkoutProgress } from '@/services/dashboard';
import { Post, listFollowers, listFollowing, listUserPosts } from '@/services/social';
import { TrainerPublic, getMyTrainerProfile, getTrainer } from '@/services/trainers';
import { UserBadges, getUserBadges } from '@/services/user';
import { getInitials } from '@/utils/text';
import { colors2, colors3, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

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
function GridIcon({ name, tone = 'primary' }: { name: React.ComponentProps<typeof Ionicons>['name']; tone?: 'primary' | 'pro' }) {
  return (
    <LinearGradient
      colors={
        tone === 'pro'
          ? ['rgba(107, 56, 212, 0.22)', 'rgba(132, 85, 239, 0.1)']
          : ['rgba(107, 56, 212, 0.16)', 'rgba(107, 56, 212, 0.06)']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.tileIconWrap}
    >
      <Ionicons name={name} size={19} color={colors3.primary} />
    </LinearGradient>
  );
}

interface PersonalChallengeProgress {
  challenge: Challenge;
  trainer: TrainerPublic | null;
  heatmapDays: HeatmapDay[];
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
export default function ProfileScreen() {
  const { user } = useAuth();
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [badges, setBadges] = useState<UserBadges | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

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
   * Marketplace desativado pre-lancamento — este fetch (isTrainer) so
   * alimentava a opcao "Tornar-se profissional parceiro" / "Meu painel
   * profissional" mais abaixo, tambem comentada. Nao apagar: reativar os 2
   * blocos juntos no relancamento do marketplace de profissionais.
   *
   * useFocusEffect(
   *   useCallback(() => {
   *     let active = true;
   *     getMyTrainerProfile()
   *       .then(() => {
   *         if (active) setIsTrainer(true);
   *       })
   *       .catch(() => {
   *         if (active) setIsTrainer(false);
   *       });
   *     return () => {
   *       active = false;
   *     };
   *   }, [])
   * );
   */

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

  // Selo Pro / Team sao so exibicao — qualquer falha (ex: rede) simplesmente
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

  /*
   * Marketplace desativado pre-lancamento — secao "Desafios de
   * profissionais" comentada mais abaixo (junto com este fetch, exclusivo
   * dela). Nao apagar: reativar os 2 blocos juntos no relancamento.
   *
   * useFocusEffect(
   *   useCallback(() => {
   *     let active = true;
   *     listMyActiveChallenges({ is_official: false })
   *       .then(async (challenges) => {
   *         const withDetails = await Promise.all(
   *           challenges.map(async (challenge) => ({
   *             challenge,
   *             trainer: challenge.trainer_id ? await getTrainer(challenge.trainer_id).catch(() => null) : null,
   *             heatmapDays: await (challenge.goal_type === 'manual'
   *               ? listMyChallengeCheckins(challenge.id).then((checkins) => buildChallengeHeatmapDays(challenge, checkins))
   *               : getChallengeProgress(challenge.id).then((progress) => buildAutomaticChallengeHeatmapDays(challenge, progress))
   *             ).catch(() => []),
   *           }))
   *         );
   *         if (active) setPersonalChallenges(withDetails);
   *       })
   *       .catch(() => {
   *         if (active) setPersonalChallenges([]);
   *       });
   *     return () => {
   *       active = false;
   *     };
   *   }, [])
   * );
   */

  return (
    <ScreenBackground3>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <Text style={styles.logo}>Tryv</Text>

        <Avatar initials={user ? getInitials(user.name) : '?'} size={88} style={styles.avatar} />
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>

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
            Marketplace desativado pre-lancamento — badge "TEAM {profissional}"
            escondida aqui (so no Perfil, sem tocar em ProfileBadges2.tsx, que
            e compartilhado com social/[userId].tsx e settings/badges.tsx e
            continua mostrando TEAM normalmente nesses 2 lugares). PRO
            continua visivel normalmente. Nao apagar: so tirar o `teams: []`
            no relancamento.

            variant="light" — ProfileBadges2 ainda e escuro por padrao (os 2
            outros usos acima seguem sem migrar), mesmo padrao de prop
            variant ja usado em EmptyFollowingState/ObscuredCard/TextField2
            nesta sessao pra nao afetar quem ainda nao migrou.
          */}
          <ProfileBadges2 badges={badges ? { ...badges, teams: [] } : badges} variant="light" />
        </View>

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
                  <Text style={styles.tileLabel}>Tryv Pro</Text>
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
        </View>

        {/*
          Marketplace desativado pre-lancamento — secao "Desafios de
          profissionais" escondida (card com heatmap de desafio vinculado a
          um profissional). Nao apagar: reativar junto com o fetch de
          personalChallenges comentado acima.

          {personalChallenges.length > 0 && (
            <View style={styles.challengesSection}>
              <Text style={styles.sectionTitle}>Desafios de profissionais</Text>
              {personalChallenges.map(({ challenge, trainer, heatmapDays }) => (
                <Pressable
                  key={challenge.id}
                  onPress={() => router.push({ pathname: '/challenges/[id]', params: { id: challenge.id } })}
                >
                  <LiquiglassCard style={styles.challengeCard} padding={spacing2.md}>
                    <View style={styles.challengeCardHeader}>
                      <Ionicons name="trophy" size={16} color={colors2.primary} />
                      <View style={styles.challengeCardTexts}>
                        <Text style={styles.challengeCardTitle}>{challenge.title}</Text>
                        {!!trainer && <Text style={styles.challengeCardTrainer}>{trainer.user_name}</Text>}
                      </View>
                    </View>
                    <HeatmapGrid
                      days={heatmapDays}
                      todayKey={todayKey()}
                      cellSize={10}
                      showDayNumbers={false}
                      showWeekdayHeaders={false}
                    />
                  </LiquiglassCard>
                </Pressable>
              ))}
            </View>
          )}
        */}

        {/*
          Marketplace desativado pre-lancamento — 2 opcoes de navegacao
          escondidas: "Profissionais" (lista de descoberta) e "Tornar-se
          profissional parceiro" / "Meu painel profissional" (cadastro de
          profissional, junto com o fetch de isTrainer comentado acima). Nao
          apagar: reativar no relancamento do marketplace de profissionais.

          <Pressable style={styles.optionWrap} onPress={() => router.push('/trainers')}>
            <LiquiglassCard style={styles.optionCard} padding={spacing2.md}>
              <View style={styles.optionRow}>
                <View style={styles.optionIconWrap}>
                  <Ionicons name="people" size={20} color={colors2.primary} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Profissionais</Text>
                  <Text style={styles.optionSubtitle}>Encontre um profissional certificado</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
              </View>
            </LiquiglassCard>
          </Pressable>

          <Pressable
            style={styles.optionWrap}
            onPress={() => router.push(isTrainer ? '/trainers/me' : '/trainers/register')}
          >
            <LiquiglassCard style={styles.optionCard} padding={spacing2.md}>
              <View style={styles.optionRow}>
                <View style={styles.optionIconWrap}>
                  <Ionicons name={isTrainer ? 'clipboard' : 'ribbon'} size={20} color={colors2.primary} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>
                    {isTrainer ? 'Meu painel profissional' : 'Tornar-se profissional parceiro'}
                  </Text>
                  <Text style={styles.optionSubtitle}>
                    {isTrainer
                      ? 'Status, edição de perfil e pagamentos'
                      : 'Cadastre seu registro profissional e comece a atender'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
              </View>
            </LiquiglassCard>
          </Pressable>
        */}

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

        <View style={styles.postsSection}>
          <Text style={styles.sectionTitle}>Meus posts</Text>
          {myPosts.length > 0 ? (
            <PostGrid2 posts={myPosts} variant="light" />
          ) : (
            <Text style={styles.emptyText}>Você ainda não publicou nada.</Text>
          )}
        </View>
      </ScrollView>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    alignItems: 'center',
    paddingTop: spacing3.xl,
    padding: spacing3.containerMargin,
    paddingBottom: spacing3.xl,
  },
  logo: { ...typography3.displayLg, fontSize: 36, fontWeight: '800', color: colors3.primary, marginBottom: spacing3.lg },
  avatar: { marginBottom: spacing3.md },
  name: { ...typography3.headlineMd, fontSize: 22 },
  email: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginTop: spacing3.xs, marginBottom: spacing3.sm },

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
  tileFullSubtitle: { ...typography3.bodyMd, fontSize: 12.5, color: colors3.onSurfaceVariant },

  // challengesSection/challengeCard* — usados so pelo bloco "Desafios de
  // profissionais" comentado (marketplace escondido pre-lancamento, ver
  // acima). Deixados como estavam (colors2), inertes, ate o relancamento.
  challengesSection: { width: '100%', gap: spacing2.sm, marginBottom: spacing2.lg },
  challengeCard: { gap: spacing2.sm },
  challengeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  challengeCardTexts: { flex: 1, gap: 2 },
  challengeCardTitle: { ...typography2.bodyMd, fontWeight: '700', fontSize: 14 },
  challengeCardTrainer: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },

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
  sectionTitle: { ...typography3.headlineMd, fontSize: 18 },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
});
