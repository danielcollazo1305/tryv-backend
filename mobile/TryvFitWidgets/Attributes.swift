import ActivityKit
import WidgetKit
import SwiftUI

/// Live Activity do treino livre em andamento. Fonte do tempo e o mesmo
/// `startedAt` ja salvo em WorkoutSessionDraftContext.tsx (draft
/// mode:'free'), passado uma vez ao iniciar a Activity.
struct FreeWorkoutActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var exerciseCount: Int
        /// "Serie atual" = a primeira serie NAO concluida, varrendo os
        /// exercicios na ordem em que foram adicionados (nao o exercicio
        /// que a pessoa esta olhando no carrossel do app, que e estado de
        /// UI local -- esse pointer e mais util aqui: "o que falta fazer",
        /// nao "o que esta na tela"). Calculado em
        /// WorkoutSessionDraftContext.tsx (computeLiveActivityContentState).
        var currentExerciseName: String
        /// Indice 0-based da serie atual DENTRO do exercicio atual.
        var currentSetIndex: Int
        var currentExerciseTotalSets: Int
        /// true quando nao ha mais nenhuma serie pendente em nenhum
        /// exercicio -- currentExerciseName/currentSetIndex nesse caso
        /// apontam pro ULTIMO exercicio/serie (so como fallback de
        /// exibicao, nao ha "proxima serie" de verdade).
        var allSetsCompleted: Bool
    }

    /// Fixo pro resto da atividade (nao faz parte do ContentState) --
    /// startedAt em epoch ms, mesmo formato ja usado no JS
    /// (WorkoutSessionDraft.startedAt), convertido pra Date do lado Swift.
    var startedAtMs: Double
}
