import ActivityKit
import WidgetKit
import SwiftUI

/// "Serie 2 de 4" ou "Todas as series concluidas" -- mesmo texto nos 2
/// lugares que mostram isso (tela de bloqueio + Dynamic Island expandida).
private func setProgressLabel(_ state: FreeWorkoutActivityAttributes.ContentState) -> String {
    if state.allSetsCompleted {
        return "Todas as series concluidas"
    }
    return "Serie \(state.currentSetIndex + 1) de \(state.currentExerciseTotalSets)"
}

/// Live Activity do treino livre. Cronometro via Text(timerInterval:),
/// renderizado pelo proprio sistema (sem nenhum timer/push do lado do app
/// pra manter contando). Exercicio/serie atual = ContentState calculado em
/// WorkoutSessionDraftContext.tsx (ver comentario em Attributes.swift).
struct FreeWorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FreeWorkoutActivityAttributes.self) { context in
            let startDate = Date(timeIntervalSince1970: context.attributes.startedAtMs / 1000)

            HStack {
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.currentExerciseName)
                        .font(.headline)
                        .lineLimit(1)
                    Text(setProgressLabel(context.state))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(timerInterval: startDate...Date.distantFuture, countsDown: false)
                        .font(.title3)
                        .monospacedDigit()
                    Text("\(context.state.exerciseCount) exercicios")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
            .activityBackgroundTint(Color.black)
            .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            let startDate = Date(timeIntervalSince1970: context.attributes.startedAtMs / 1000)

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.currentExerciseName)
                            .font(.caption)
                            .lineLimit(1)
                        Text(setProgressLabel(context.state))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: startDate...Date.distantFuture, countsDown: false)
                        .monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("\(context.state.exerciseCount) exercicios no treino")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: "figure.strengthtraining.traditional")
            } compactTrailing: {
                Text(timerInterval: startDate...Date.distantFuture, countsDown: false)
                    .monospacedDigit()
                    .frame(width: 44)
            } minimal: {
                Image(systemName: "figure.strengthtraining.traditional")
            }
        }
    }
}
