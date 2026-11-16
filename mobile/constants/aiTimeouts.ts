/**
 * Timeouts (ms) das chamadas de IA do app. Valor unico por funcao, sempre um pouco ACIMA do timeout do backend (backend/app/services/ai_client.py:
 * insights 60 s, analise de refeicao 90 s, plano de treino 180 s, ja com 1 retentativa de rede), para o app nao desistir antes do servidor
 * (se desistisse, o servidor continuaria gastando tokens e a pessoa veria um erro por uma resposta que ainda ia chegar).
 * Se mudar os padroes do backend (ou as variaveis AI_TIMEOUT_*_SECONDS no servidor), ajuste aqui junto.
 */
export const AI_TIMEOUT_INSIGHT_MS = 70_000;
export const AI_TIMEOUT_MEAL_MS = 100_000;
export const AI_TIMEOUT_WORKOUT_PLAN_MS = 190_000;
