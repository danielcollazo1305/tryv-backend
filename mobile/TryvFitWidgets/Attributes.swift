import ActivityKit
import WidgetKit
import SwiftUI
import AppIntents

/// App Group compartilhado entre o app principal e a extensao de widget
/// -- unica forma de passar dado entre os 2 processos sem UI (ver
/// comentario de MarkCurrentSetDoneIntent abaixo). Precisa bater com
/// `ios.entitlements`/plugin `groupIdentifier` em app.json (mesmo grupo
/// configurado nos 2 lugares -- sem isso, UserDefaults(suiteName:) abaixo
/// falha silenciosamente e cai no sandbox de cada processo, sem
/// compartilhar nada). Vive aqui (nao em Module.swift) porque este
/// arquivo ja e compilado nos 2 targets (app + extensao) pelo mecanismo
/// do plugin -- Module.swift so compila no target do app, mas como os 2
/// arquivos acabam no MESMO modulo quando compilados pro app, a
/// constante fica visivel de la tambem.
let sharedDefaultsSuiteName = "group.com.danielcollazo.tryvmobile"

/// Live Activity do treino livre em andamento. Fonte do tempo e o mesmo
/// `startedAt` ja salvo em WorkoutSessionDraftContext.tsx (draft
/// mode:'free'), passado uma vez ao iniciar a Activity.
struct FreeWorkoutActivityAttributes: ActivityAttributes {
    /// Um exercicio do treino, do ponto de vista da Live Activity --
    /// so o que a extensao precisa pra desenhar/navegar, nao o objeto
    /// completo de FreeSessionExerciseDraft (sets com peso/reps etc, que
    /// so importam dentro do app).
    public struct ExerciseSummary: Codable, Hashable {
        var name: String
        var totalSets: Int
        /// Indice da primeira serie NAO concluida DESTE exercicio
        /// especificamente, -1 se todas as series dele ja estao
        /// concluidas. Mesma convencao de "primeira serie nao concluida"
        /// de computeLiveActivityContentState (WorkoutSessionDraftContext.tsx),
        /// so que calculada por exercicio agora, nao so pro "atual".
        var firstIncompleteSetIndex: Int
    }

    public struct ContentState: Codable, Hashable {
        /// Todos os exercicios do treino, na mesma ordem em que foram
        /// adicionados -- precisa da lista inteira (nao so o "atual") pra
        /// dar pra navegar entre eles na propria Live Activity sem
        /// precisar abrir o app (ver NextExerciseIntent/PreviousExerciseIntent
        /// abaixo).
        var exercises: [ExerciseSummary]
        /// Indice em `exercises` do exercicio "automatico" -- primeiro
        /// com serie pendente, calculado no app
        /// (computeLiveActivityContentState). O app SEMPRE manda este
        /// campo certo em todo startActivity/updateActivity de verdade;
        /// os Intents de navegacao (abaixo) nunca mexem nele.
        var autoExerciseIndex: Int
        /// Indice em `exercises` do exercicio sendo VISUALIZADO na Live
        /// Activity agora -- comeca igual a autoExerciseIndex sempre que
        /// o app manda uma atualizacao de verdade (startActivity/
        /// updateActivity "resetam" a navegacao manual, de proposito: um
        /// update real do app deve ganhar de uma navegacao manual velha).
        /// NextExerciseIntent/PreviousExerciseIntent so mudam ESTE campo,
        /// localmente na extensao, via Activity.update() -- nunca tocam
        /// em UserDefaults compartilhado (navegacao de visualizacao nao e
        /// uma mudanca de dado real do treino, diferente de marcar
        /// serie).
        var viewedExerciseIndex: Int
    }

    /// Fixo pro resto da atividade (nao faz parte do ContentState) --
    /// startedAt em epoch ms, mesmo formato ja usado no JS
    /// (WorkoutSessionDraft.startedAt), convertido pra Date do lado Swift.
    var startedAtMs: Double
}

/// Botao "Marcar serie" da Live Activity -- age sobre o exercicio
/// VISUALIZADO (`state.viewedExerciseIndex`), nao necessariamente o
/// "atual" automatico (pode ser outro, se a pessoa navegou com
/// NextExerciseIntent/PreviousExerciseIntent antes de tocar aqui).
///
/// Empilha a identidade da serie marcada (exercicio + indice, capturados
/// ANTES do avanco local) numa lista em
/// UserDefaults(suiteName: sharedDefaultsSuiteName) -- "empilha" de
/// proposito (le a lista atual, concatena, regrava) em vez de
/// sobrescrever, pra suportar marcar varias series em sequencia so pela
/// Live Activity, com o app fechado, sem perder nenhuma entre uma leitura
/// e outra (services/liveActivity.ts readPendingSetUpdates() ->
/// Module.swift le e LIMPA essa lista quando o app volta ao primeiro
/// plano, ver WorkoutSessionDraftContext.tsx).
///
/// O avanco local (abaixo) agora e EXATO, nao uma aproximacao como antes
/// desta tarefa -- como o ContentState guarda `totalSets` de cada
/// exercicio individualmente, da pra saber com certeza se a serie
/// marcada era a ultima DESSE exercicio, sem precisar adivinhar nada
/// sobre outros exercicios.
///
/// LiveActivityIntent (App Intents, iOS 17+) exige `@available(iOS 17,
/// *)` -- dispositivo com iOS mais antigo so nao ve o botao (guard na
/// view), sem precisar subir a versao minima do app inteiro so por causa
/// dele (decisao ja tomada e comunicada numa tarefa anterior). Roda
/// sempre no processo do app -- mesmo com o app FECHADO, o sistema sobe
/// um processo em segundo plano so pra executar perform(), sem UI e sem
/// o JS bridge do React Native inicializado. Por isso perform() so pode
/// mexer em ActivityKit/UserDefaults -- nunca em nada do lado JS
/// diretamente.
@available(iOS 17.0, *)
struct MarkCurrentSetDoneIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Marcar serie concluida"

    func perform() async throws -> some IntentResult {
        guard let activity = Activity<FreeWorkoutActivityAttributes>.activities.first else {
            return .result()
        }
        var state = activity.content.state
        guard state.viewedExerciseIndex >= 0, state.viewedExerciseIndex < state.exercises.count else {
            return .result()
        }
        var exercise = state.exercises[state.viewedExerciseIndex]
        guard exercise.firstIncompleteSetIndex != -1 else {
            // Nada pendente NESTE exercicio (a pessoa pode ter navegado
            // pra um ja concluido) -- botao deveria estar desabilitado
            // nesse caso (ver MarkSetButton na view), isto e so uma
            // segunda trava de seguranca.
            return .result()
        }

        if let sharedDefaults = UserDefaults(suiteName: sharedDefaultsSuiteName) {
            var pending = sharedDefaults.array(forKey: "pendingSetUpdates") as? [[String: Any]] ?? []
            pending.append([
                "exerciseName": exercise.name,
                "setIndex": exercise.firstIncompleteSetIndex,
            ])
            sharedDefaults.set(pending, forKey: "pendingSetUpdates")
        }

        let nextSetIndex = exercise.firstIncompleteSetIndex + 1
        exercise.firstIncompleteSetIndex = nextSetIndex < exercise.totalSets ? nextSetIndex : -1
        state.exercises[state.viewedExerciseIndex] = exercise

        await activity.update(ActivityContent(state: state, staleDate: nil))
        return .result()
    }
}

/// Navegacao manual entre exercicios na propria Live Activity -- so muda
/// `viewedExerciseIndex`, localmente na extensao (ver comentario em
/// ContentState.viewedExerciseIndex acima pra entender por que isso NAO
/// mexe em UserDefaults nem precisa reconciliar com o app: e so
/// "o que a Live Activity esta mostrando agora", nao uma mudanca real no
/// treino). Sem efeito (retorna sem fazer nada) quando ja esta no
/// primeiro/ultimo exercicio -- a view tambem desabilita o botao nesse
/// caso, isto e so a segunda trava de seguranca, mesmo padrao de
/// MarkCurrentSetDoneIntent.
@available(iOS 17.0, *)
struct NextExerciseIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Proximo exercicio"

    func perform() async throws -> some IntentResult {
        guard let activity = Activity<FreeWorkoutActivityAttributes>.activities.first else {
            return .result()
        }
        var state = activity.content.state
        let nextIndex = state.viewedExerciseIndex + 1
        guard nextIndex < state.exercises.count else { return .result() }
        state.viewedExerciseIndex = nextIndex
        await activity.update(ActivityContent(state: state, staleDate: nil))
        return .result()
    }
}

/// Ver comentario de NextExerciseIntent acima -- mesma logica, sentido
/// contrario.
@available(iOS 17.0, *)
struct PreviousExerciseIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Exercicio anterior"

    func perform() async throws -> some IntentResult {
        guard let activity = Activity<FreeWorkoutActivityAttributes>.activities.first else {
            return .result()
        }
        var state = activity.content.state
        let previousIndex = state.viewedExerciseIndex - 1
        guard previousIndex >= 0 else { return .result() }
        state.viewedExerciseIndex = previousIndex
        await activity.update(ActivityContent(state: state, staleDate: nil))
        return .result()
    }
}
