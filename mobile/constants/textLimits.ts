/**
 * Limites de caracteres dos textos que outras pessoas veem. MESMOS valores do backend
 * (backend/app/services/content_filter_guard.py: CAPTION_MAX, COMMENT_MAX, NAME_MAX, ...); o servidor continua sendo a
 * fonte da verdade (responde 422 em portugues se passar), o app so impede de digitar alem do limite.
 * Ao mudar um valor no backend, mude aqui tambem.
 */
export const CAPTION_MAX_LENGTH = 1000;
export const COMMENT_MAX_LENGTH = 500;
export const NAME_MAX_LENGTH = 60;
export const SQUAD_NAME_MAX_LENGTH = 60;
export const CHALLENGE_TITLE_MAX_LENGTH = 120;
export const CHALLENGE_DESCRIPTION_MAX_LENGTH = 5000;
export const TRAINER_BIO_MAX_LENGTH = 5000;
export const TRAINER_CERTIFICATIONS_MAX_LENGTH = 5000;
