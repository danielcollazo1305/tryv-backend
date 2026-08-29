import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { HeatmapDay, HeatmapGrid, computeCurrentStreak, todayKey as getTodayKey } from '@/components/HeatmapGrid';
import { TrainingDay, getTrainingFrequency, parseLocalDate } from '@/services/dashboard';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

function currentMonthParam(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthTitle(): string {
  const label = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function intensityLabel(intensity: number): string {
  if (intensity === 0) return 'Sem treino';
  if (intensity === 1) return '1 treino';
  if (intensity === 2) return '2 treinos';
  return '3 ou mais treinos';
}

function formatSelectedDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}

/**
 * "Frequencia de treino" da Home — recurso gratuito
 * (/dashboard/training-frequency), desacoplado do resumo Pro
 * (/dashboard/home-summary): busca os proprios dados, sempre do mes civil
 * atual, sem depender do seletor de mes que continua exclusivo das
 * estatisticas pagas mais abaixo na tela.
 *
 * Retemado pro sistema visual novo "prism-glass" (ver colors3 em
 * constants/theme.ts) — GlassCard no lugar do FlatCard (o tema claro nao
 * distingue card "flat" vs "glass", todo card e prism-glass), calendario
 * usa HeatmapGrid variant="light".
 *
 * O painel de sequencia atual (fundo roxo translucido + icone circular em
 * gradiente) e uma adicao real (dado ja existente, days_trained/
 * days_total) que o HTML de referencia nao modela (a versao dele so mostra
 * um calendario estatico sem streak nenhum) — mantive porque e um recurso
 * de verdade ja aprovado antes, so retemado pra paleta clara. O mockup
 * tambem sugere "Melhor sequência: N dias" nesse tipo de painel, que NAO
 * tem fonte real (nao existe calculo de maior sequencia historica em lugar
 * nenhum do backend) — continua omitido.
 *
 * userId opcional: reaproveitado no perfil publico de outra pessoa
 * (social/[userId].tsx) — mesma decisao de visibilidade do
 * WeeklyActivityChart (sem gate de seguidor).
 */
export function TrainingFrequencyCard({ userId }: { userId?: string } = {}) {
  const [days, setDays] = useState<TrainingDay[] | null>(null);
  const [daysTrained, setDaysTrained] = useState(0);
  const [daysTotal, setDaysTotal] = useState(0);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<TrainingDay | null>(null);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const data = await getTrainingFrequency({ month: currentMonthParam() }, userId);
      setDays(data.training_frequency);
      setDaysTrained(data.days_trained);
      setDaysTotal(data.days_total);
      setSelected(null);
    } catch {
      setError(true);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const todayKey = getTodayKey();

  // Sequencia calculada so sobre o mes civil atual (unico dado que este
  // card busca) — se ela ainda estiver ativa no dia 1 do mes (hitLeftEdge),
  // pode continuar no mes anterior, mas nao ha como saber sem buscar mais
  // dado (GET /dashboard/training-frequency so foi chamado com o mes
  // atual). Documentado em vez de inventar o restante: mostra "N+" nesse
  // caso, sinalizando que e um piso, nao o total exato.
  const streak = days ? computeCurrentStreak(days, todayKey) : null;

  let content: React.ReactNode;

  if (error) {
    content = (
      <Text style={styles.emptyText}>
        {userId ? 'Nao foi possivel carregar a frequencia de treino.' : 'Nao foi possivel carregar sua frequencia de treino.'}
      </Text>
    );
  } else if (!days) {
    content = <Text style={styles.emptyText}>Carregando...</Text>;
  } else if (days.length === 0) {
    content = (
      <Text style={styles.emptyText}>
        {userId ? 'Ainda sem atividades registradas.' : 'Sem dados neste mes ainda.'}
      </Text>
    );
  } else {
    content = (
      <>
        <HeatmapGrid
          days={days as HeatmapDay[]}
          todayKey={todayKey}
          onSelectDay={(day) => setSelected({ date: day.date, intensity: day.intensity })}
          variant="light"
        />

        <View style={styles.footer}>
          <Text style={styles.selectedText}>
            {selected
              ? `${formatSelectedDate(selected.date)} — ${intensityLabel(selected.intensity)}`
              : 'Toque num dia para ver o detalhe'}
          </Text>
        </View>
      </>
    );
  }

  return (
    <GlassCard style={styles.card} padding={24}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Constância</Text>
        <Text style={styles.monthLabel}>{monthTitle()}</Text>
      </View>

      {!!streak && streak.count > 0 && (
        <View style={styles.streakPanel}>
          <LinearGradient
            colors={[colors3.primary, colors3.onPrimaryFixed]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.streakIcon}
          >
            <Ionicons name="arrow-up" size={16} color={colors3.onPrimary} />
          </LinearGradient>
          <View style={styles.streakTexts}>
            <View style={styles.streakCountRow}>
              <Text style={styles.streakCount}>
                {streak.count}
                {streak.hitLeftEdge ? '+' : ''}
              </Text>
              <Text style={styles.streakCountLabel}>{streak.count === 1 ? 'dia seguido' : 'dias seguidos'}</Text>
            </View>
            <Text style={styles.streakNote}>
              {daysTrained} de {daysTotal} dias ativos
            </Text>
          </View>
        </View>
      )}

      {content}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing3.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...typography3.labelMd, textTransform: 'uppercase', color: colors3.onSurfaceVariant },
  monthLabel: { ...typography3.bodyMd, color: colors3.onSurface },

  streakPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius3.lg,
    backgroundColor: 'rgba(107, 56, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(107, 56, 212, 0.25)',
  },
  streakIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors3.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  streakTexts: { flex: 1, gap: 2 },
  streakCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  streakCount: { ...typography3.headlineMd, fontSize: 22, lineHeight: 24, letterSpacing: -0.8, color: colors3.onSurface },
  streakCountLabel: { ...typography3.bodyMd, fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors3.primary },
  streakNote: { ...typography3.bodyMd, fontSize: 11, lineHeight: 15, color: colors3.onSurfaceVariant, marginTop: 2 },

  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },

  footer: { gap: spacing3.xs, marginTop: spacing3.xs, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.5)', paddingTop: spacing3.md },
  selectedText: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant, textAlign: 'center' },
});
