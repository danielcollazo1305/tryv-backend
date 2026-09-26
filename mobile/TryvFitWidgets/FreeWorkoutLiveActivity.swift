import ActivityKit
import WidgetKit
import SwiftUI
import AppIntents

/// Mesmo roxo de colors3.primary (constants/theme.ts) -- Live Activity
/// nao tem acesso ao tema JS, entao hardcoded aqui. So esse valor: nao
/// existia nenhuma outra cor hex referenciada no Swift antes desta
/// tarefa.
private extension Color {
    static let tryvPurple = Color(red: 0x6B / 255.0, green: 0x38 / 255.0, blue: 0xD4 / 255.0)
}

/// Fundo claro, mesmo espirito do "prism-glass" do lado React Native
/// (GlassCard.tsx: rgba(255,255,255,.4)) -- opacidade bem mais alta que
/// o GlassCard real de proposito: `.activityBackgroundTint` NAO desenha
/// nenhum material/blur proprio por baixo (diferente de um
/// .background(.ultraThinMaterial) no React Native) -- e so uma cor
/// solida tingindo o card. Testado a 0.4 (mais fiel ao GlassCard) numa
/// tarefa anterior e ainda pareceu escuro no dispositivo real (o papel de
/// parede da tela de bloqueio, normalmente escuro, transparecia demais
/// por baixo) -- 0.92 mantem so um resquicio de translucidez sem
/// comprometer legibilidade.
///
/// So vale pra tela de bloqueio/banner -- `.activityBackgroundTint` NAO
/// tem nenhum efeito na Dynamic Island (confirmado via documentacao/
/// exemplos oficiais: esse modifier "controla a cor de fundo na tela de
/// bloqueio ou banner"). A Dynamic Island (compacta E expandida) sempre
/// renderiza contra o material escuro fixo do proprio sistema -- Apple
/// nao da nenhuma API pra customizar isso, entao nao ha "fundo claro"
/// possivel la; o que da pra controlar (e o que precisava de ajuste,
/// achado nesta tarefa) e garantir que TEXTO/ICONES na Dynamic Island
/// usem cores claras (legiveis no escuro fixo), nao as mesmas cores
/// escuras usadas na tela de bloqueio agora clara -- ver `tint` em
/// TransportControls/ExerciseNavButton abaixo.
private let backgroundTint = Color.white.opacity(0.92)
/// Texto escuro sobre fundo claro agora (era texto claro sobre fundo
/// escuro antes desta tarefa) -- 2 niveis, mesmo padrao de
/// primary/secondary text ja usado no resto do app (colors3.onSurface/
/// onSurfaceVariant).
private let textPrimary = Color.black.opacity(0.85)
private let textSecondary = Color.black.opacity(0.55)

/// "Serie 2 de 4" ou "Exercicio concluido" -- por EXERCICIO agora (nao
/// mais um "allSetsCompleted" global), ja que a Live Activity pode estar
/// mostrando qualquer exercicio do treino, nao so o "atual" automatico
/// (ver NextExerciseIntent/PreviousExerciseIntent, Attributes.swift).
private func setProgressLabel(_ exercise: FreeWorkoutActivityAttributes.ExerciseSummary) -> String {
    if exercise.firstIncompleteSetIndex == -1 {
        return "Exercicio concluido"
    }
    return "Serie \(exercise.firstIncompleteSetIndex + 1) de \(exercise.totalSets)"
}

/// Selo/"capa" do treino -- equivalente a capa do album num player de
/// musica (referencia visual desta tarefa). Nao muda por exercicio de
/// proposito (nao ha imagem por exercicio disponivel aqui) -- so precisa
/// parar de ser espaco vazio, dar ancora visual ao card.
///
/// Icone real do app (TryvAppIcon, catalogo WidgetAssets.xcassets --
/// mesmo PNG de mobile/assets/icon.png, copiado pro catalogo porque
/// assets NAO sao compartilhados automaticamente entre targets do Xcode;
/// o plugin react-native-widget-extension so adiciona pastas .xcassets
/// na fase de build de Resources da extensao, um .png solto na pasta NAO
/// seria de fato empacotado no binario, so copiado pro disco-fonte) no
/// lugar do SF Symbol generico de haltere usado antes.
///
/// .aspectRatio(.fill) + .frame + .clipShape (nao so .fit + frame) --
/// corte residual reportado na Dynamic Island mesmo depois de um frame
/// explicito: a causa provavel era o CONTAINER (nao o icone) sendo
/// comprimido pelo layout da propria Dynamic Island abaixo do tamanho
/// pedido, sem nada garantindo que o conteudo nunca vazasse das bordas
/// arredondadas. .clipShape aqui e a garantia definitiva -- seja qual for
/// o tamanho real que o sistema conceder ao frame, o icone NUNCA aparece
/// fora do arredondado.
private struct WorkoutBadge: View {
    var size: CGFloat
    var cornerRadius: CGFloat

    var body: some View {
        Image("TryvAppIcon")
            .resizable()
            .aspectRatio(contentMode: .fill)
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}

/// Botao circular "marcar serie" (equivalente ao play/pause do player) --
/// age sobre `exercise` (o exercicio VISUALIZADO, passado pelo chamador
/// -- nao necessariamente o automatico). So em iOS 17+ (App Intents) e so
/// enquanto ESSE exercicio tiver serie pendente. Quando ele ja esta
/// concluido (ou iOS < 17), mostra um check estatico no lugar, sem
/// interacao -- mesmo espaco reservado nos 2 casos, pra nao pular o
/// layout ao mudar de estado/navegar.
private struct MarkSetButton: View {
    var exercise: FreeWorkoutActivityAttributes.ExerciseSummary
    var size: CGFloat = 44

    var body: some View {
        let done = exercise.firstIncompleteSetIndex == -1
        Group {
            if #available(iOS 17.0, *), !done {
                Button(intent: MarkCurrentSetDoneIntent()) {
                    // iOS 26+ -- vidro interativo de verdade no lugar do
                    // circulo roxo solido; .tint(tryvPurple) mantem a cor
                    // da marca, .interactive() da o feedback de toque
                    // nativo do sistema (unico elemento tocavel desta
                    // view que ganha isso -- as setas de navegar ficaram
                    // de fora do escopo pedido). Mesmo GlassEffectContainer
                    // do card (acima) tambem envolve este botao, entao os
                    // 2 vidros (retangulo do card + circulo do botao)
                    // refletem luz de forma consistente entre si.
                    if #available(iOS 26.0, *) {
                        Image(systemName: "checkmark")
                            .font(.system(size: size * 0.42, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: size, height: size)
                            .glassEffect(.regular.tint(Color.tryvPurple).interactive(), in: .circle)
                    } else {
                        ZStack {
                            Circle().fill(Color.tryvPurple)
                            Image(systemName: "checkmark")
                                .font(.system(size: size * 0.42, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                }
                .buttonStyle(.plain)
            } else if done {
                ZStack {
                    Circle().fill(Color.green.opacity(0.18))
                    Image(systemName: "checkmark")
                        .font(.system(size: size * 0.42, weight: .bold))
                        .foregroundStyle(.green)
                }
            }
        }
        .frame(width: size, height: size)
    }
}

/// "<<" / ">>" de navegar entre exercicios -- so troca
/// `viewedExerciseIndex` localmente na extensao (ver comentario em
/// Attributes.swift). Desabilitado (nao escondido -- mantem o layout
/// estavel) no primeiro/ultimo exercicio, mesmo espirito de desabilitar
/// ja usado no carrossel do lado React Native.
@available(iOS 17.0, *)
private struct ExerciseNavButton<I: LiveActivityIntent>: View {
    var intent: I
    var systemImage: String
    var enabled: Bool
    /// Cor do icone -- precisa ser passada pelo chamador (nao um valor
    /// fixo aqui) porque este botao aparece em 2 fundos opostos: a tela
    /// de bloqueio (clara, precisa de icone escuro) e a Dynamic Island
    /// (sempre escura, fixa pelo sistema -- precisa de icone claro). Usar
    /// a mesma cor escura nos 2 lugares (bug real desta tarefa, achado
    /// via screenshot) deixava o icone quase invisivel na Dynamic Island.
    var tint: Color
    var size: CGFloat = 32

    var body: some View {
        Button(intent: intent) {
            Image(systemName: systemImage)
                .font(.system(size: size * 0.44, weight: .semibold))
                .foregroundStyle(tint.opacity(enabled ? 1 : 0.3))
                .frame(width: size, height: size)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

/// Linha de controles "<< [check] >>", mesmo grupo nos 2 lugares (tela de
/// bloqueio + Dynamic Island expandida) -- em iOS < 17, so o check
/// (estatico, sem interacao) aparece; nav de exercicio precisa de App
/// Intents (17+), entao nem tenta desenhar os botoes de seta nesse caso.
private struct TransportControls: View {
    var state: FreeWorkoutActivityAttributes.ContentState
    /// Ver comentario em ExerciseNavButton.tint -- padrao escuro (tela de
    /// bloqueio, clara); chamador passa `.white` explicitamente pra uso
    /// dentro da Dynamic Island (sempre escura).
    var navTint: Color = textPrimary
    var checkButtonSize: CGFloat = 44
    var navButtonSize: CGFloat = 32

    var body: some View {
        let index = state.viewedExerciseIndex
        let exercise = state.exercises.indices.contains(index) ? state.exercises[index] : nil

        HStack(spacing: 6) {
            if #available(iOS 17.0, *) {
                ExerciseNavButton(intent: PreviousExerciseIntent(), systemImage: "backward.fill", enabled: index > 0, tint: navTint, size: navButtonSize)
            }
            if let exercise {
                MarkSetButton(exercise: exercise, size: checkButtonSize)
            }
            if #available(iOS 17.0, *) {
                ExerciseNavButton(intent: NextExerciseIntent(), systemImage: "forward.fill", enabled: index < state.exercises.count - 1, tint: navTint, size: navButtonSize)
            }
        }
    }
}

/// Live Activity do treino livre, estilo player de musica (capa +
/// titulo/subtitulo + progresso + controles de navegacao/check a
/// direita) -- cronometro via Text(timerInterval:), renderizado pelo
/// proprio sistema (sem nenhum timer/push do lado do app pra manter
/// contando). `state.exercises`/`viewedExerciseIndex` = calculado em
/// WorkoutSessionDraftContext.tsx + navegacao local (ver comentario em
/// Attributes.swift).
struct FreeWorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FreeWorkoutActivityAttributes.self) { context in
            let startDate = Date(timeIntervalSince1970: context.attributes.startedAtMs / 1000)
            let index = context.state.viewedExerciseIndex
            let exercise = context.state.exercises.indices.contains(index) ? context.state.exercises[index] : nil

            let card = HStack(spacing: 14) {
                WorkoutBadge(size: 56, cornerRadius: 14)

                VStack(alignment: .leading, spacing: 3) {
                    Text(exercise?.name ?? "")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(textPrimary)
                        .lineLimit(1)
                    Text(exercise.map(setProgressLabel) ?? "")
                        .font(.system(size: 13))
                        .foregroundStyle(textSecondary)
                        .lineLimit(1)
                    Text(timerInterval: startDate...Date.distantFuture, countsDown: false)
                        .font(.system(size: 15, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Color.tryvPurple)
                }

                Spacer(minLength: 8)

                TransportControls(state: context.state)
            }
            .padding(16)

            // iOS 26+ -- vidro de verdade (.glassEffect, API nativa da
            // "Liquid Glass") no lugar do .activityBackgroundTint solido.
            // GlassEffectContainer envolvendo o card INTEIRO (nao so o
            // HStack) de proposito: o botao de check (MarkSetButton) tem
            // seu PROPRIO .glassEffect(...circle...) mais fundo na arvore
            // -- o container compartilhado e o que faz os 2 pedacos de
            // vidro (card retangular + botao circular) refletirem luz de
            // forma consistente entre si, em vez de cada um calcular seu
            // proprio vidro isolado (recomendacao da Apple pra vidros
            // proximos/adjacentes). Aplicado DEPOIS de padding/layout, na
            // ordem recomendada pela Apple.
            //
            // iOS < 26 -- continua com .activityBackgroundTint (unica API
            // pre-26 que de fato pinta o fundo da Live Activity na tela
            // de bloqueio; um .background(.ultraThinMaterial) simples
            // nao e garantido fazer isso do mesmo jeito -- .activityBackgroundTint
            // existe justamente pra cobrir esse caso especifico do
            // sistema).
            Group {
                if #available(iOS 26.0, *) {
                    GlassEffectContainer {
                        card.glassEffect(.regular, in: .rect(cornerRadius: 20))
                    }
                } else {
                    card.activityBackgroundTint(backgroundTint)
                }
            }
            .activitySystemActionForegroundColor(textPrimary)
        } dynamicIsland: { context in
            let startDate = Date(timeIntervalSince1970: context.attributes.startedAtMs / 1000)
            let index = context.state.viewedExerciseIndex
            let exercise = context.state.exercises.indices.contains(index) ? context.state.exercises[index] : nil

            return DynamicIsland {
                // iOS 26+ -- tentativa de "clarear" as regioes da Dynamic
                // Island com .glassEffect() (modifier comum do SwiftUI,
                // nao exclusivo de Live Activity). O PAINEL geral da
                // Dynamic Island continua sendo escuro fixo do sistema
                // sempre (nao ha API pra mudar isso -- ver comentario em
                // backgroundTint acima), mas um card de vidro claro
                // SOBRE o conteudo de cada regiao e algo que da pra
                // tentar. Se a Apple de fato deixa esse card aparecer
                // sobre o painel fixo, ou normaliza/ignora, so da pra
                // confirmar testando num dispositivo real -- nao achei
                // documentacao especifica sobre glassEffect dentro de
                // regioes de Dynamic Island (diferente da tela de
                // bloqueio, onde a API foi desenhada pra esse uso).
                let diLeadingTint: Color = {
                    if #available(iOS 26.0, *) { return textPrimary } else { return .primary }
                }()
                DynamicIslandExpandedRegion(.leading) {
                    let content = HStack(spacing: 8) {
                        WorkoutBadge(size: 32, cornerRadius: 8)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(exercise?.name ?? "")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(diLeadingTint)
                                .lineLimit(1)
                            Text(exercise.map(setProgressLabel) ?? "")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .padding(6)

                    if #available(iOS 26.0, *) {
                        content.glassEffect(.regular, in: .rect(cornerRadius: 14))
                    } else {
                        content
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: startDate...Date.distantFuture, countsDown: false)
                        .font(.system(size: 16, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Color.tryvPurple)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    // navTint precisa acompanhar o fundo real desta
                    // regiao: continua escuro (precisa de icone branco)
                    // em iOS < 26, mas vira um card de vidro CLARO em iOS
                    // 26+ (precisa de icone escuro) -- usar .white fixo
                    // aqui (bug real corrigido numa tarefa anterior pro
                    // caso escuro) deixaria os icones de seta quase
                    // invisiveis contra o vidro claro no iOS 26+.
                    let navTint: Color = {
                        if #available(iOS 26.0, *) { return textPrimary } else { return .white }
                    }()
                    let content = HStack {
                        Spacer()
                        TransportControls(state: context.state, navTint: navTint, checkButtonSize: 36, navButtonSize: 28)
                        Spacer()
                    }
                    .padding(.vertical, 4)

                    if #available(iOS 26.0, *) {
                        GlassEffectContainer {
                            content.glassEffect(.regular, in: .rect(cornerRadius: 18))
                        }
                    } else {
                        content
                    }
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill")
                    .foregroundStyle(Color.tryvPurple)
            } compactTrailing: {
                Text(timerInterval: startDate...Date.distantFuture, countsDown: false)
                    .monospacedDigit()
                    .frame(width: 44)
            } minimal: {
                Image(systemName: "dumbbell.fill")
                    .foregroundStyle(Color.tryvPurple)
            }
        }
    }
}
