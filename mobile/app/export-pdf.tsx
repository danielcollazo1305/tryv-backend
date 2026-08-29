import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { exportPeriodReportPdf } from '@/services/pdfExport';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

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

/**
 * Modal de exportacao de relatorio em PDF com intervalo livre — antes vivia
 * como card fixo sempre visivel na Home, movido pra ca (aberto pelo slide
 * "Relatorio em PDF" do carrossel "Para voce", ver ExportPdfCard.tsx) pra
 * liberar espaco fixo na Home sem perder a funcionalidade. Estado,
 * validacao e chamada de exportacao 100% identicos a versao anterior — so
 * o ponto de entrada mudou (era sempre visivel, agora e um modal sob
 * demanda). Nao fecha sozinho apos exportar com sucesso (a versao anterior
 * tambem nao fazia nada alem de exportar) — fechar e sempre uma acao
 * explicita do usuario, via botao de fechar.
 */
export default function ExportPdfScreen() {
  const { user } = useAuth();

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

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Exportar relatório</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors3.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <GlassCard style={styles.exportCard} padding={24}>
          <View>
            <Text style={styles.exportLabel}>Exportar relatório em PDF</Text>
            <Text style={styles.exportSubtitle}>Selecione o período do relatório</Text>
          </View>

          <View style={styles.exportDateRow}>
            <View style={styles.exportDateField}>
              <Text style={styles.exportDateLabel}>Data inicial</Text>
              <Pressable style={styles.exportDateButton} onPress={() => setShowExportStartPicker(true)}>
                <Ionicons name="calendar-outline" size={18} color={colors3.outline} />
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
                <Button3 label="Concluir" variant="secondary" onPress={() => setShowExportStartPicker(false)} />
              )}
            </View>

            <View style={styles.exportDateField}>
              <Text style={styles.exportDateLabel}>Data final</Text>
              <Pressable style={styles.exportDateButton} onPress={() => setShowExportEndPicker(true)}>
                <Ionicons name="calendar-outline" size={18} color={colors3.outline} />
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
                <Button3 label="Concluir" variant="secondary" onPress={() => setShowExportEndPicker(false)} />
              )}
            </View>
          </View>

          {!exportRangeValid && (
            <Text style={styles.error}>
              {exportEndDate < exportStartDate
                ? 'A data final precisa ser igual ou posterior a data inicial.'
                : `O período não pode ultrapassar ${MAX_EXPORT_RANGE_DAYS} dias (selecionado: ${exportRangeDays}).`}
            </Text>
          )}
          {!!exportError && <Text style={styles.error}>{exportError}</Text>}

          <Button3 label="Gerar PDF" onPress={handleExportPdf} loading={exporting} disabled={!exportRangeValid} />
        </GlassCard>
      </ScrollView>
    </ScreenBackground3>
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
  },
  title: { ...typography3.headlineMd },
  content: { padding: spacing3.containerMargin, paddingTop: 0 },

  exportCard: { gap: spacing3.md },
  exportLabel: { ...typography3.headlineMd, fontSize: 18, marginBottom: 4 },
  exportSubtitle: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant },
  exportDateRow: { flexDirection: 'row', gap: spacing3.md, alignItems: 'flex-start' },
  exportDateField: { flex: 1, minWidth: 0, gap: spacing3.sm },
  exportDateLabel: { ...typography3.labelSm, fontSize: 10, letterSpacing: 0.9, textTransform: 'uppercase', color: colors3.onSurfaceVariant },
  exportDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: radius3.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    paddingHorizontal: spacing3.sm + 4,
    paddingVertical: spacing3.sm + 4,
  },
  exportDateButtonText: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurface },
  error: { color: colors3.error, textAlign: 'center' },
});
