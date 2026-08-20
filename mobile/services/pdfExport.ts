import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import {
  ACTIVITY_TYPE_LABELS,
  ActivityType,
  PersonalRecords,
  formatDistanceKm,
  formatDuration,
  formatPace,
  getPersonalRecords,
} from '@/services/activities';
import {
  HomeSummary,
  MetricComparison,
  PeriodComparison,
  formatShortDate,
  getHomeSummary,
  getPeriodComparison,
} from '@/services/dashboard';
import { HeartRateReport, getHeartRateReport } from '@/services/heartRate';

const BRAND_PURPLE = '#8B5CF6';
const BG = '#0B0B0F';
const SURFACE = '#17171C';
const BORDER = '#27272E';
const TEXT = '#F5F5F7';
const TEXT_SECONDARY = '#9CA3AF';
const TEXT_MUTED = '#6B7280';

const PACE_REFERENCE_ORDER = ['1km', '5km', '10km'];

function fmtNum(value: number | null | undefined, decimals = 0): string {
  return value != null ? value.toFixed(decimals) : '--';
}

function deltaLabel(metric: MetricComparison): string {
  if (metric.delta_absolute == null) return 'sem comparacao';
  const sign = metric.delta_absolute > 0 ? '+' : '';
  const pct = metric.delta_percent != null ? ` (${sign}${metric.delta_percent.toFixed(0)}%)` : '';
  return `${sign}${metric.delta_absolute.toFixed(1)}${pct}`;
}

function buildHomeSummarySection(summary: HomeSummary): string {
  const weightChange =
    summary.weight_change_kg != null
      ? `${summary.weight_change_kg > 0 ? '+' : ''}${summary.weight_change_kg.toFixed(1)} kg`
      : '--';
  const calorieRow = summary.calorie_summary
    ? `<tr><td>Calorias consumidas (media/dia)</td><td>${fmtNum(summary.calorie_summary.avg_consumed, 0)} kcal</td></tr>
       ${
         summary.calorie_summary.avg_deficit != null
           ? `<tr><td>Deficit calorico (media/dia)</td><td>${fmtNum(summary.calorie_summary.avg_deficit, 0)} kcal</td></tr>`
           : ''
       }`
    : `<tr><td colspan="2" class="muted">Sem dados suficientes de refeicoes neste periodo.</td></tr>`;

  return `
    <section class="card">
      <h2>Resumo do periodo</h2>
      <table>
        <tr><td>Variacao de peso</td><td>${weightChange}</td></tr>
        <tr><td>Dias treinados</td><td>${summary.days_trained} de ${summary.days_total}</td></tr>
        ${calorieRow}
      </table>
    </section>`;
}

function buildPeriodComparisonSection(comparison: PeriodComparison): string {
  const rows: [string, MetricComparison, string][] = [
    ['Km percorridos', comparison.distance_km, 'km'],
    ['Treinos concluidos', comparison.workouts_count, ''],
    ['Kcal/dia (media)', comparison.avg_daily_calories, 'kcal'],
    ['Variacao de peso', comparison.weight_change_kg, 'kg'],
  ];

  const rowsHtml = rows
    .map(
      ([label, metric, unit]) => `
        <tr>
          <td>${label}</td>
          <td>${fmtNum(metric.current, unit === 'kg' ? 1 : 0)} ${unit}</td>
          <td>${fmtNum(metric.previous, unit === 'kg' ? 1 : 0)} ${unit}</td>
          <td>${deltaLabel(metric)}</td>
        </tr>`
    )
    .join('');

  return `
    <section class="card">
      <h2>Comparacao com o periodo anterior</h2>
      <p class="muted">
        ${formatShortDate(comparison.current_start)} a ${formatShortDate(comparison.current_end)}
        vs. ${formatShortDate(comparison.previous_start)} a ${formatShortDate(comparison.previous_end)}
      </p>
      <table>
        <tr><th>Metrica</th><th>Atual</th><th>Anterior</th><th>Delta</th></tr>
        ${rowsHtml}
      </table>
    </section>`;
}

function buildPersonalRecordsSection(records: PersonalRecords): string {
  const activityTypes = Object.keys(records.records_by_activity_type);
  if (activityTypes.length === 0) {
    return `
      <section class="card">
        <h2>Recordes pessoais (historico completo)</h2>
        <p class="muted">Sem recordes registrados ainda.</p>
      </section>`;
  }

  const blocks = activityTypes
    .map((activityType) => {
      const typeRecords = records.records_by_activity_type[activityType];
      const label = ACTIVITY_TYPE_LABELS[activityType as ActivityType] ?? activityType;
      const rows: string[] = [];
      if (typeRecords.longest_distance) {
        rows.push(`<tr><td>Maior distancia</td><td>${formatDistanceKm(typeRecords.longest_distance.distance_meters)} km</td></tr>`);
      }
      if (typeRecords.longest_duration) {
        rows.push(`<tr><td>Mais longa</td><td>${formatDuration(typeRecords.longest_duration.duration_seconds)}</td></tr>`);
      }
      PACE_REFERENCE_ORDER.forEach((refLabel) => {
        const pace = typeRecords.best_pace_by_reference[refLabel];
        if (pace) {
          rows.push(`<tr><td>Melhor pace (${refLabel})</td><td>${formatPace(pace.avg_pace_seconds_per_km)}</td></tr>`);
        }
      });
      return `<h3>${label}</h3><table>${rows.join('')}</table>`;
    })
    .join('');

  return `
    <section class="card">
      <h2>Recordes pessoais (historico completo)</h2>
      ${blocks}
    </section>`;
}

function buildHeartRateSection(report: HeartRateReport, rangeLabel: string): string {
  if (report.daily.length === 0) {
    return `
      <section class="card">
        <h2>Relatorio de frequencia cardiaca</h2>
        <p class="muted">Sem amostras de frequencia cardiaca no periodo (${rangeLabel}).</p>
      </section>`;
  }

  return `
    <section class="card">
      <h2>Relatorio de frequencia cardiaca</h2>
      <p class="muted">${rangeLabel}</p>
      <table>
        <tr><td>FC media</td><td>${fmtNum(report.avg_bpm, 0)} bpm</td></tr>
        <tr><td>FC maxima</td><td>${fmtNum(report.max_bpm, 0)} bpm</td></tr>
        <tr><td>FC de repouso (estimada)</td><td>${fmtNum(report.resting_estimate.bpm, 0)} bpm</td></tr>
      </table>
      <p class="disclaimer">${report.resting_estimate.note}</p>
    </section>`;
}

function buildReportHtml(params: {
  userName: string;
  currentStart: string;
  currentEnd: string;
  homeSummary: HomeSummary;
  periodComparison: PeriodComparison;
  personalRecords: PersonalRecords;
  heartRateReport: HeartRateReport;
}): string {
  const now = new Date();
  const generatedAt = `${now.toLocaleDateString('pt-BR')} as ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const rangeLabel = `${formatShortDate(params.currentStart)} a ${formatShortDate(params.currentEnd)}`;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            background: ${BG};
            color: ${TEXT};
            font-family: -apple-system, Helvetica, Arial, sans-serif;
            padding: 32px;
            margin: 0;
          }
          .brand { color: ${BRAND_PURPLE}; font-weight: 800; font-size: 22px; letter-spacing: -0.5px; }
          .header { margin-bottom: 24px; border-bottom: 1px solid ${BORDER}; padding-bottom: 16px; }
          .header h1 { font-size: 20px; margin: 8px 0 4px; }
          .header p { color: ${TEXT_SECONDARY}; margin: 2px 0; font-size: 13px; }
          .generated { color: ${TEXT_MUTED}; font-size: 11px; margin-top: 6px; }
          .card {
            background: ${SURFACE};
            border: 1px solid ${BORDER};
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 16px;
          }
          h2 { font-size: 15px; margin: 0 0 8px; color: ${TEXT}; }
          h3 { font-size: 13px; margin: 12px 0 4px; color: ${BRAND_PURPLE}; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          td, th { padding: 6px 4px; border-bottom: 1px solid ${BORDER}; text-align: left; }
          th { color: ${TEXT_MUTED}; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
          .muted { color: ${TEXT_MUTED}; font-size: 12px; margin: 0 0 8px; }
          .disclaimer { color: ${TEXT_MUTED}; font-size: 10px; margin-top: 8px; font-style: italic; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand">Tryv</div>
          <h1>Relatorio Tryv &mdash; ${rangeLabel}</h1>
          <p>${params.userName}</p>
          <p class="generated">Gerado em ${generatedAt}</p>
        </div>
        ${buildHomeSummarySection(params.homeSummary)}
        ${buildPeriodComparisonSection(params.periodComparison)}
        ${buildPersonalRecordsSection(params.personalRecords)}
        ${buildHeartRateSection(params.heartRateReport, rangeLabel)}
      </body>
    </html>`;
}

/** 'YYYY-MM-DD' local — mesmo formato que os 3 endpoints esperam em start_date/end_date. */
function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Busca os 4 endpoints (todos gated Pro) em paralelo pro intervalo de datas
 * escolhido no seletor da Home (ate 90 dias, validado no client antes de
 * chamar isso e de novo no backend) — se qualquer um falhar (incluindo 402
 * de usuario free, ou 400 de intervalo invalido), Promise.all rejeita antes
 * de gerar qualquer PDF, entao nunca existe um relatorio pela metade.
 */
export async function exportPeriodReportPdf(userName: string, startDate: Date, endDate: Date): Promise<void> {
  const startDateKey = toDateKey(startDate);
  const endDateKey = toDateKey(endDate);

  const [homeSummary, periodComparison, personalRecords, heartRateReport] = await Promise.all([
    getHomeSummary({ start_date: startDateKey, end_date: endDateKey }),
    getPeriodComparison(startDateKey, endDateKey),
    getPersonalRecords(),
    getHeartRateReport({ startDate: startDateKey, endDate: endDateKey }),
  ]);

  const html = buildReportHtml({
    userName,
    currentStart: periodComparison.current_start,
    currentEnd: periodComparison.current_end,
    homeSummary,
    periodComparison,
    personalRecords,
    heartRateReport,
  });
  const { uri } = await Print.printToFileAsync({ html });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Compartilhamento nao esta disponivel neste dispositivo.');
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar relatorio' });
}
