import ExpoModulesCore
import ActivityKit

/// [{"name": String, "totalSets": Int, "firstIncompleteSetIndex": Int}, ...]
/// vindo do JS (LiveActivityContentState.exercises, services/liveActivity.ts)
/// -> [FreeWorkoutActivityAttributes.ExerciseSummary]. Entradas que nao
/// batem o formato esperado sao ignoradas (compactMap) -- nao deveria
/// acontecer de verdade (o lado JS sempre manda os 3 campos), mas e mais
/// seguro que forcar um crash em runtime por um dado malformado.
private func parseExerciseSummaries(_ raw: [[String: Any]]) -> [FreeWorkoutActivityAttributes.ExerciseSummary] {
    raw.compactMap { dict in
        guard
            let name = dict["name"] as? String,
            let totalSets = dict["totalSets"] as? Int,
            let firstIncompleteSetIndex = dict["firstIncompleteSetIndex"] as? Int
        else { return nil }
        return FreeWorkoutActivityAttributes.ExerciseSummary(
            name: name,
            totalSets: totalSets,
            firstIncompleteSetIndex: firstIncompleteSetIndex
        )
    }
}

/// Ponte JS <-> Swift pra Live Activity do treino livre.
///
/// Nome da CLASSE tem que ser exatamente "ReactNativeWidgetExtensionModule"
/// -- nao e escolha nossa, e o nome fixo que o autolinking da Expo espera
/// (node_modules/react-native-widget-extension/expo-module.config.json
/// declara "modules": ["ReactNativeWidgetExtensionModule"], usado pra
/// gerar o ExpoModulesProvider.swift no prebuild). Renomear essa classe
/// pra outra coisa quebra o build com "cannot find X in scope" (erro real
/// visto num build anterior desta tarefa). O nome que a GENTE escolhe de
/// verdade e o da linha Name(...) abaixo -- esse sim e so o identificador
/// que o lado JS usa (requireNativeModule('TryvFitWidgets') em
/// services/liveActivity.ts), sem relacao com o nome da classe Swift.
///
/// AsyncFunction (nao Function + Task{} solto) de proposito -- bug real
/// encontrado apos validar em dispositivo: Function() que dispara um
/// Task{} novo e retorna na hora NAO da nenhuma garantia de ordem entre
/// chamadas -- um endActivity() seguido rapido de um startActivity() (ex:
/// concluir um treino e iniciar outro em sequencia) podia rodar os 2 Tasks
/// fora de ordem, deixando uma Live Activity travada mostrando dado velho
/// (startedAtMs antigo, ja que attributes sao imutaveis depois de criada
/// -- so ContentState pode ser atualizado). AsyncFunction devolve uma
/// Promise de verdade pro JS; o lado JS (WorkoutSessionDraftContext.tsx)
/// da awai em cada chamada antes da proxima, entao o corpo async de uma
/// termina de verdade (inclusive os awaits internos no ActivityKit) antes
/// da seguinte comecar -- sem essa corrida. Bonus: erro de verdade agora
/// vira Promise rejeitada, com stack trace completo do lado JS, em vez de
/// so um print() que nunca chegava no app.
public class ReactNativeWidgetExtensionModule: Module {
    public func definition() -> ModuleDefinition {
        Name("TryvFitWidgets")

        AsyncFunction("areActivitiesEnabled") { () -> Bool in
            if #available(iOS 16.2, *) {
                return ActivityAuthorizationInfo().areActivitiesEnabled
            } else {
                return false
            }
        }

        AsyncFunction("startActivity") { (startedAtMs: Double, exercises: [[String: Any]], autoExerciseIndex: Int) async throws in
            guard #available(iOS 16.2, *) else { return }

            // Encerra qualquer Live Activity de treino livre que ja
            // estivesse rodando antes de iniciar uma nova -- protege
            // contra uma orfa de uma sessao de teste/app-fechado anterior
            // que nunca passou por endActivity(). Com AsyncFunction, isso
            // agora roda ATE O FIM (await de verdade) antes do proximo
            // Activity.request, sem risco de race com uma chamada de
            // updateActivity/endActivity feita logo em seguida do lado JS.
            for activity in Activity<FreeWorkoutActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }

            let attributes = FreeWorkoutActivityAttributes(startedAtMs: startedAtMs)
            let contentState = FreeWorkoutActivityAttributes.ContentState(
                exercises: parseExerciseSummaries(exercises),
                autoExerciseIndex: autoExerciseIndex,
                // Comeca igual ao automatico -- so navegacao manual
                // (NextExerciseIntent/PreviousExerciseIntent) muda isso
                // depois, localmente na extensao.
                viewedExerciseIndex: autoExerciseIndex
            )
            let content = ActivityContent(state: contentState, staleDate: nil)
            _ = try Activity.request(attributes: attributes, content: content)
        }

        AsyncFunction("updateActivity") { (exercises: [[String: Any]], autoExerciseIndex: Int) async in
            guard #available(iOS 16.2, *) else { return }

            let contentState = FreeWorkoutActivityAttributes.ContentState(
                exercises: parseExerciseSummaries(exercises),
                autoExerciseIndex: autoExerciseIndex,
                // Todo update de verdade do app "reseta" uma navegacao
                // manual antiga de volta pro automatico -- de proposito
                // (ver comentario em ContentState.viewedExerciseIndex,
                // Attributes.swift): um dado real do treino mudou, entao
                // a Live Activity deve voltar a mostrar o exercicio
                // certo, nao ficar presa em algum outro que a pessoa
                // tinha navegado manualmente antes dessa mudanca.
                viewedExerciseIndex: autoExerciseIndex
            )
            let content = ActivityContent(state: contentState, staleDate: nil)
            for activity in Activity<FreeWorkoutActivityAttributes>.activities {
                await activity.update(content)
            }
        }

        AsyncFunction("endActivity") { () async in
            guard #available(iOS 16.2, *) else { return }

            for activity in Activity<FreeWorkoutActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }

        // ETAPA C -- le os toques pendentes que MarkCurrentSetDoneIntent
        // (Attributes.swift) empilhou em UserDefaults compartilhado
        // (App Group) enquanto o botao da Live Activity foi tocado com o
        // app fechado/minimizado, e LIMPA a lista em seguida -- lida uma
        // vez so por chamada, pra nao reaplicar o mesmo toque 2x se o JS
        // chamar de novo por qualquer motivo (ver
        // WorkoutSessionDraftContext.tsx, so chama isso ao voltar pro
        // primeiro plano). Retorna array de dicts (exerciseName/setIndex)
        // -- Expo Modules Core serializa isso pro JS sem precisar de
        // nenhum tipo Codable/Record customizado.
        AsyncFunction("readPendingSetUpdates") { () async -> [[String: Any]] in
            guard let sharedDefaults = UserDefaults(suiteName: sharedDefaultsSuiteName) else { return [] }
            let pending = sharedDefaults.array(forKey: "pendingSetUpdates") as? [[String: Any]] ?? []
            sharedDefaults.removeObject(forKey: "pendingSetUpdates")
            return pending
        }
    }
}
