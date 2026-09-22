import ExpoModulesCore
import ActivityKit

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

        AsyncFunction("startActivity") { (startedAtMs: Double, exerciseCount: Int, currentExerciseName: String, currentSetIndex: Int, currentExerciseTotalSets: Int, allSetsCompleted: Bool) async throws in
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
                exerciseCount: exerciseCount,
                currentExerciseName: currentExerciseName,
                currentSetIndex: currentSetIndex,
                currentExerciseTotalSets: currentExerciseTotalSets,
                allSetsCompleted: allSetsCompleted
            )
            let content = ActivityContent(state: contentState, staleDate: nil)
            _ = try Activity.request(attributes: attributes, content: content)
        }

        AsyncFunction("updateActivity") { (exerciseCount: Int, currentExerciseName: String, currentSetIndex: Int, currentExerciseTotalSets: Int, allSetsCompleted: Bool) async in
            guard #available(iOS 16.2, *) else { return }

            let contentState = FreeWorkoutActivityAttributes.ContentState(
                exerciseCount: exerciseCount,
                currentExerciseName: currentExerciseName,
                currentSetIndex: currentSetIndex,
                currentExerciseTotalSets: currentExerciseTotalSets,
                allSetsCompleted: allSetsCompleted
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
    }
}
