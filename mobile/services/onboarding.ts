import { RegisterDraft } from '@/context/RegisterDraftContext';
import { UserUpdatePayload, updateProfile } from '@/services/user';
import { createWeightLog, toDateString } from '@/services/weightLogs';

interface FinishRegistrationParams {
  register: (name: string, email: string, password: string) => Promise<void>;
  draft: RegisterDraft;
}

/**
 * Fluxo final do onboarding expandido — reaproveita a MESMA sequencia que
 * ja existia (register + createWeightLog + updateProfile, tudo best-effort
 * depois que a conta em si foi criada com sucesso), so estendida com os
 * campos novos. Extraida pra uma funcao compartilhada porque agora existem
 * 2 pontos de saida do wizard que podem ser "o ultimo passo" (register-
 * calories.tsx quando nao ha meta especifica, register-estimate.tsx quando
 * ha) — sem isso, a logica de finalizacao ficaria duplicada nos dois.
 */
export async function finishRegistration({ register, draft }: FinishRegistrationParams): Promise<void> {
  await register(draft.name, draft.email, draft.password);

  // Tudo abaixo e best-effort: a conta ja foi criada com sucesso, entao
  // uma falha aqui (raro) nao deve travar o usuario — mesmo padrao que ja
  // existia pra peso/altura/objetivo antes desta tarefa.
  const weightValue = Number(draft.weight);
  if (weightValue > 0) {
    try {
      await createWeightLog({ weight_kg: weightValue, logged_at: toDateString(new Date()) });
    } catch {
      // silencioso de proposito
    }
  }

  const profilePatch: UserUpdatePayload = {};
  const heightValue = Number(draft.height);
  if (heightValue > 0) profilePatch.height = heightValue;
  if (draft.goal) profilePatch.goal = draft.goal;
  if (draft.dateOfBirth) profilePatch.date_of_birth = draft.dateOfBirth;
  if (draft.biologicalSex) profilePatch.biological_sex = draft.biologicalSex;
  const bodyFatValue = Number(draft.bodyFatPercentage);
  if (bodyFatValue > 0) profilePatch.body_fat_percentage = bodyFatValue;
  if (draft.trainingLevel) profilePatch.training_level = draft.trainingLevel;
  if (draft.equipment) profilePatch.available_equipment = draft.equipment;
  const calorieGoalValue = Number(draft.dailyCalorieGoal);
  if (calorieGoalValue > 0) profilePatch.daily_calorie_goal = calorieGoalValue;

  if (Object.keys(profilePatch).length > 0) {
    try {
      await updateProfile(profilePatch);
    } catch {
      // silencioso de proposito
    }
  }
}
