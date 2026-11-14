import WidgetKit
import SwiftUI

// Widget de TELA INICIAL "Resumo do dia" (systemSmall e systemMedium): passos com a meta, sono da noite, calorias e
// vitalidade. Independente da Live Activity (FreeWorkoutLiveActivity.swift): nao compartilha nem altera nada dela.
//
// Os dados NAO sao calculados aqui. O app grava um resumo em JSON no App Group (services/widgetSummary.ts ->
// Module.swift, funcao writeDailySummary, chave "dailySummary.v1") e pede o reload deste widget. A extensao so le,
// decodifica e desenha: sem rede, sem HealthKit.
//
// Compatibilidade: iOS 16.4 e o minimo. containerBackground(for: .widget) so existe no iOS 17+, entao o fundo passa por
// SummaryContainerBackground (iOS 17+: containerBackground; antes: background + padding). Nenhuma outra API acima do 16.

// MARK: - Constantes

/// Identificador deste widget. Module.swift (app) repete a mesma string para pedir o reload -- os 2 targets nao
/// compartilham este arquivo; se mudar aqui, mude la.
let summaryWidgetKind = "TryvFitSummaryWidget"

private let summaryStorageKey = "dailySummary.v1"
private let summarySupportedVersion = 1
/// Meta usada se o JSON vier sem `stepGoal`. A meta de verdade e a constante WIDGET_STEP_GOAL em services/widgetSummary.ts.
private let summaryFallbackStepGoal = 10_000.0

// MARK: - Cores (so .primary/.secondary e a cor de destaque do app)

private extension Color {
    /// Roxo do app (mesmo tom de constants/theme.ts) sobre fundo claro.
    static let summaryAccentLight = Color(red: 0x6B / 255.0, green: 0x38 / 255.0, blue: 0xD4 / 255.0)
    /// Lavanda mais clara, com contraste no modo escuro.
    static let summaryAccentDark = Color(red: 0xA7 / 255.0, green: 0x8B / 255.0, blue: 0xFA / 255.0)
}

private func summaryAccent(for scheme: ColorScheme) -> Color {
    scheme == .dark ? Color.summaryAccentDark : Color.summaryAccentLight
}

// MARK: - Dados

/// Espelho do JSON gravado por services/widgetSummary.ts. Campos ausentes ou null viram nil.
struct SummaryPayload: Decodable {
    let v: Int
    /// Epoch em milissegundos.
    let updatedAt: Double
    let steps: Double?
    let stepGoal: Double?
    /// Horas dormidas na noite que terminou HOJE (dia em que a pessoa acordou).
    let sleepHours: Double?
    let activeKcal: Double?
    let basalKcal: Double?
    /// Rotulo ja pronto do app ("Em forma", "Atenção", "Recuperar"); nil quando nao ha dado.
    let vitalityLabel: String?
    let vitalityScore: Double?

    var updatedDate: Date { Date(timeIntervalSince1970: updatedAt / 1000) }
    var goal: Double {
        if let stepGoal = stepGoal, stepGoal > 0 { return stepGoal }
        return summaryFallbackStepGoal
    }
    var stepsProgress: Double? {
        guard let steps = steps else { return nil }
        return min(max(steps / goal, 0), 1)
    }
    /// Calorias em repouso (basal) so contam se > 0; sem isso a energia ativa NUNCA e chamada de total.
    var hasBasal: Bool { (basalKcal ?? 0) > 0 }
    var hasCalories: Bool { activeKcal != nil || hasBasal }
    var hasAnyData: Bool { steps != nil || sleepHours != nil || hasCalories || vitalityLabel != nil }

    /// Dado de exemplo para a galeria de widgets e o placeholder.
    static func sample() -> SummaryPayload {
        SummaryPayload(
            v: summarySupportedVersion,
            updatedAt: Date().timeIntervalSince1970 * 1000,
            steps: 6_500,
            stepGoal: summaryFallbackStepGoal,
            sleepHours: 7.5,
            activeKcal: 420,
            basalKcal: 1_650,
            vitalityLabel: "Em forma",
            vitalityScore: 82
        )
    }
}

enum SummaryStore {
    /// Le e decodifica o resumo do App Group. nil = nada gravado, JSON invalido ou versao desconhecida.
    static func load() -> SummaryPayload? {
        guard
            let defaults = UserDefaults(suiteName: sharedDefaultsSuiteName),
            let json = defaults.string(forKey: summaryStorageKey),
            let data = json.data(using: .utf8),
            let payload = try? JSONDecoder().decode(SummaryPayload.self, from: data),
            payload.v == summarySupportedVersion
        else { return nil }
        return payload
    }
}

/// So vale o resumo gravado NO MESMO DIA da entrada e com algum dado; do contrario o widget mostra o estado vazio
/// (nunca os passos de ontem como se fossem de hoje).
private func summaryValid(_ payload: SummaryPayload?, on date: Date) -> SummaryPayload? {
    guard let payload = payload, payload.hasAnyData else { return nil }
    return Calendar.current.isDate(payload.updatedDate, inSameDayAs: date) ? payload : nil
}

// MARK: - Formatacao (pt-BR)

private let summaryNumberFormatter: NumberFormatter = {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.locale = Locale(identifier: "pt_BR")
    formatter.maximumFractionDigits = 0
    return formatter
}()

private let summaryTimeFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pt_BR")
    formatter.timeZone = TimeZone.autoupdatingCurrent
    formatter.dateFormat = "HH:mm"
    return formatter
}()

/// "8.123"
private func summaryFormatCount(_ value: Double) -> String {
    guard value.isFinite else { return "—" }
    return summaryNumberFormatter.string(from: NSNumber(value: value.rounded())) ?? String(Int(value.rounded()))
}

/// Mesmo formato do app (utils/sleepFormat.ts): "7h 43m", "7h 00m", "45m".
private func summaryFormatSleep(_ hours: Double) -> String {
    guard hours.isFinite else { return "—" }
    let totalMinutes = max(0, Int((hours * 60).rounded()))
    let wholeHours = totalMinutes / 60
    let minutes = totalMinutes % 60
    if wholeHours == 0 { return "\(minutes)m" }
    let paddedMinutes = minutes < 10 ? "0\(minutes)" : "\(minutes)"
    return "\(wholeHours)h \(paddedMinutes)m"
}

private func summaryFormatKcal(_ value: Double) -> String {
    "\(summaryFormatCount(value)) kcal"
}

// MARK: - Fundo (iOS 17+ containerBackground; antes, background + padding)

private struct SummaryContainerBackground: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(for: .widget) {
                Color(.systemBackground)
            }
        } else {
            content
                .padding()
                .background(Color(.systemBackground))
        }
    }
}

// MARK: - Timeline

struct SummaryEntry: TimelineEntry {
    let date: Date
    /// nil = estado vazio ("Abra o Tryv para sincronizar").
    let summary: SummaryPayload?
}

struct SummaryProvider: TimelineProvider {
    func placeholder(in context: Context) -> SummaryEntry {
        SummaryEntry(date: Date(), summary: SummaryPayload.sample())
    }

    func getSnapshot(in context: Context, completion: @escaping (SummaryEntry) -> Void) {
        let now = Date()
        if context.isPreview {
            completion(SummaryEntry(date: now, summary: SummaryPayload.sample()))
        } else {
            completion(SummaryEntry(date: now, summary: summaryValid(SummaryStore.load(), on: now)))
        }
    }

    /// Os dados so mudam quando o app grava (e ele mesmo pede o reload), entao nao ha polling. Duas entradas: agora e a
    /// meia-noite, quando o resumo de hoje deixa de valer e o widget cai no estado vazio ate o app gravar de novo.
    func getTimeline(in context: Context, completion: @escaping (Timeline<SummaryEntry>) -> Void) {
        let now = Date()
        let stored = SummaryStore.load()
        let calendar = Calendar.current
        let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))
            ?? now.addingTimeInterval(12 * 60 * 60)
        let entries = [
            SummaryEntry(date: now, summary: summaryValid(stored, on: now)),
            SummaryEntry(date: midnight, summary: summaryValid(stored, on: midnight)),
        ]
        completion(Timeline(entries: entries, policy: .after(midnight)))
    }
}

// MARK: - Views

private struct SummaryProgressBar: View {
    let progress: Double
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.secondary.opacity(0.25))
                Capsule()
                    .fill(summaryAccent(for: scheme))
                    .frame(width: max(proxy.size.width * progress, progress > 0 ? 4 : 0))
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}

private struct SummaryFooterView: View {
    let updatedAt: Date

    var body: some View {
        Text("Atualizado às \(summaryTimeFormatter.string(from: updatedAt))")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

private struct SummaryMetricView: View {
    let title: String
    let systemImage: String
    let value: String
    var detail: String? = nil
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(summaryAccent(for: scheme))
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Text(value)
                .font(.system(.title3, design: .rounded).weight(.bold))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if let detail = detail {
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct SummaryEmptyView: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.title2)
                .foregroundStyle(summaryAccent(for: scheme))
            Text("Abra o Tryv para sincronizar")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct SummarySmallView: View {
    let summary: SummaryPayload
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "figure.walk")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(summaryAccent(for: scheme))
                Text("Passos")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Text(summary.steps.map { summaryFormatCount($0) } ?? "—")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Text("Meta de \(summaryFormatCount(summary.goal))")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            SummaryProgressBar(progress: summary.stepsProgress ?? 0)
            Spacer(minLength: 0)
            SummaryFooterView(updatedAt: summary.updatedDate)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct SummaryMediumView: View {
    let summary: SummaryPayload

    private var stepsValue: String {
        summary.steps.map { summaryFormatCount($0) } ?? "—"
    }

    private var sleepValue: String {
        summary.sleepHours.map { summaryFormatSleep($0) } ?? "—"
    }

    /// Com basal: total (ativas + em repouso). Sem basal: so as ativas, com o rotulo "ativas" no titulo -- nunca "total".
    private var caloriesTitle: String {
        if summary.hasBasal { return "Calorias" }
        return summary.activeKcal != nil ? "Calorias ativas" : "Calorias"
    }

    private var caloriesValue: String {
        if summary.hasBasal {
            return summaryFormatKcal((summary.activeKcal ?? 0) + (summary.basalKcal ?? 0))
        }
        return summary.activeKcal.map { summaryFormatKcal($0) } ?? "—"
    }

    private var caloriesDetail: String? {
        guard summary.hasBasal else { return nil }
        return "\(summaryFormatCount(summary.activeKcal ?? 0)) ativas · \(summaryFormatCount(summary.basalKcal ?? 0)) em repouso"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    SummaryMetricView(
                        title: "Passos",
                        systemImage: "figure.walk",
                        value: stepsValue,
                        detail: "Meta de \(summaryFormatCount(summary.goal))"
                    )
                    SummaryProgressBar(progress: summary.stepsProgress ?? 0)
                }
                SummaryMetricView(
                    title: "Sono",
                    systemImage: "bed.double.fill",
                    value: sleepValue,
                    detail: summary.sleepHours != nil ? "Noite passada" : nil
                )
            }
            HStack(alignment: .top, spacing: 12) {
                SummaryMetricView(
                    title: caloriesTitle,
                    systemImage: "flame.fill",
                    value: caloriesValue,
                    detail: caloriesDetail
                )
                SummaryMetricView(
                    title: "Vitalidade",
                    systemImage: "waveform.path.ecg",
                    value: summary.vitalityLabel ?? "—",
                    detail: summary.vitalityScore.map { "Pontuação \(summaryFormatCount($0))" }
                )
            }
            Spacer(minLength: 0)
            SummaryFooterView(updatedAt: summary.updatedDate)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct SummaryWidgetView: View {
    let entry: SummaryEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        content.modifier(SummaryContainerBackground())
    }

    @ViewBuilder
    private var content: some View {
        if let summary = entry.summary {
            switch family {
            case .systemSmall:
                SummarySmallView(summary: summary)
            default:
                SummaryMediumView(summary: summary)
            }
        } else {
            SummaryEmptyView()
        }
    }
}

// MARK: - Widget

struct TryvFitSummaryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: summaryWidgetKind, provider: SummaryProvider()) { entry in
            SummaryWidgetView(entry: entry)
        }
        .configurationDisplayName("Resumo do dia")
        .description("Passos, sono, calorias e vitalidade de hoje.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
