/**
 * Idade minima do Tryv: 18 anos. MESMA regra do backend (backend/app/core/age_policy.py): o aniversario exato conta
 * (quem faz 18 hoje pode). O servidor continua sendo a fonte da verdade (usa o fuso America/Sao_Paulo); aqui e so a
 * validacao local para nao deixar a pessoa chegar ao fim do cadastro para ser barrada.
 */
export const MIN_REGISTRATION_AGE = 18;
export const UNDERAGE_MESSAGE = 'O Tryv é para maiores de 18 anos.';

export function ageInYears(dateOfBirth: Date, today: Date = new Date()): number {
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > dateOfBirth.getMonth() ||
    (today.getMonth() === dateOfBirth.getMonth() && today.getDate() >= dateOfBirth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

export function isUnderRegistrationAge(dateOfBirth: Date, today: Date = new Date()): boolean {
  return ageInYears(dateOfBirth, today) < MIN_REGISTRATION_AGE;
}
