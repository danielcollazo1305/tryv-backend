// Post de corrida no app (E10b): logica PURA (sem React, sem rede), testada no Node (Claude outputs/try_corrida_app.mjs).
// Servidor (E10a): POST /posts type='run' + reference_id (corrida propria, 1 post por corrida; 409 ja publicada; 422 corrida de outro/inexistente/
// menor com imagem); PostOut.activity (resumo, nunca rota); GET /runs/{id}/route-public (so dono maior de 18; pontos sem as pontas de 200 m).
// O app tem que funcionar tambem contra o servidor ANTIGO: sem `activity` o card fica como era; route-public 404 = sem opcao de mapa.

export const RUN_MAP_PRIVACY_TEXT = 'O início e o fim do percurso (200 m) ficam escondidos.';
export const MAX_ROUTE_POINTS = 300;

// ------------------------------------------------------------------------------------------------------------ formatacao
function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** "5,23 km" (virgula, duas casas). Ausente/negativo/invalido = "--". */
export function formatRunDistance(meters: unknown): string {
  if (!finite(meters) || meters < 0) return '--';
  return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
}

/** "42:10" ou "1:02:10". Ausente/negativo/invalido = "--". */
export function formatRunDuration(totalSeconds: unknown): string {
  if (!finite(totalSeconds) || totalSeconds < 0) return '--';
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return hours > 0 ? `${hours}:${mm}:${String(seconds).padStart(2, '0')}` : `${mm}:${String(seconds).padStart(2, '0')}`;
}

/** "5:23 /km". Ausente/zero/invalido = "--". Arredonda os segundos (59,6 vira 1:00 do minuto seguinte, nunca "5:60"). */
export function formatRunPace(secondsPerKm: unknown): string {
  if (!finite(secondsPerKm) || secondsPerKm <= 0) return '--';
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} /km`;
}

const TYPE_LABELS: Record<string, string> = {
  run: 'Corrida',
  bike: 'Pedalada',
  walk: 'Caminhada',
  swim: 'Natação',
  fight: 'Luta',
  hiit: 'HIIT',
  other: 'Atividade',
};

/** Nome do tipo de atividade para mostrar; tipo desconhecido ou ausente = "Atividade". */
export function activityTypeLabel(type: unknown): string {
  return typeof type === 'string' && TYPE_LABELS[type] ? TYPE_LABELS[type] : 'Atividade';
}

// -------------------------------------------------------------------------------------------------------------- resumo
export interface RunActivity {
  activity_type: string;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number | null;
  started_at: string | null;
}

/**
 * PostOut.activity -> resumo seguro. Servidor antigo (campo ausente), null ou formato errado = null (o card fica como era).
 * Descarta qualquer outro campo (se algum dia vier rota ou coordenada, nao passa daqui).
 */
export function normalizeActivity(raw: unknown): RunActivity | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!finite(r.distance_meters) || !finite(r.duration_seconds)) return null;
  return {
    activity_type: typeof r.activity_type === 'string' ? r.activity_type : 'other',
    distance_meters: r.distance_meters,
    duration_seconds: r.duration_seconds,
    avg_pace_seconds_per_km: finite(r.avg_pace_seconds_per_km) ? r.avg_pace_seconds_per_km : null,
    started_at: typeof r.started_at === 'string' ? r.started_at : null,
  };
}

export interface ActivityStrip {
  label: string;
  distance: string;
  duration: string;
  pace: string;
}

/** Textos da faixa de resumo do card (so tipo, distancia, tempo e ritmo; nada de local). */
export function activityStrip(activity: RunActivity): ActivityStrip {
  return {
    label: activityTypeLabel(activity.activity_type),
    distance: formatRunDistance(activity.distance_meters),
    duration: formatRunDuration(activity.duration_seconds),
    pace: formatRunPace(activity.avg_pace_seconds_per_km),
  };
}

// ----------------------------------------------------------------------------------------------------------------- idade
/** Maior de 18 anos pela data de nascimento (YYYY-MM-DD). Sem data ou invalida = false (mesma regra do servidor: sem data nao e adulto). */
export function isAdultByBirthDate(dateOfBirth: unknown, today: Date = new Date()): boolean {
  if (typeof dateOfBirth !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  let age = today.getFullYear() - y;
  const had = today.getMonth() + 1 > mo || (today.getMonth() + 1 === mo && today.getDate() >= d);
  if (!had) age -= 1;
  return age >= 18;
}

// -------------------------------------------------------------------------------------------------------- mapa (route-public)
export interface MapPoint {
  latitude: number;
  longitude: number;
}

/**
 * Resposta de GET /runs/{id}/route-public -> pontos para desenhar, ou null se nao ha mapa a oferecer (available=false, lista curta ou formato
 * errado). Aceita no maximo 300 pontos (o servidor ja reduz; aqui e uma trava) e ignora pontos invalidos.
 */
export function normalizePublicRoute(raw: unknown): MapPoint[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { available?: unknown; points?: unknown };
  if (r.available !== true || !Array.isArray(r.points)) return null;
  const pts: MapPoint[] = [];
  for (const p of r.points) {
    const lat = (p as { lat?: unknown } | null)?.lat;
    const lng = (p as { lng?: unknown } | null)?.lng;
    if (finite(lat) && finite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) pts.push({ latitude: lat, longitude: lng });
  }
  if (pts.length < 2) return null;
  if (pts.length <= MAX_ROUTE_POINTS) return pts;
  const step = (pts.length - 1) / (MAX_ROUTE_POINTS - 1);
  return Array.from({ length: MAX_ROUTE_POINTS }, (_, i) => pts[Math.round(i * step)]);
}

export type MapAvailability = 'checking' | 'available' | 'short' | 'forbidden' | 'unsupported' | 'error';

/** Erro de route-public -> por que nao ha mapa: 404 = servidor antigo (sem a rota); 403 = menor/sem data; outro = falha momentanea. */
export function mapAvailabilityFromError(err: unknown): MapAvailability {
  const status = (err as { response?: { status?: unknown } } | null | undefined)?.response?.status;
  if (status === 404) return 'unsupported';
  if (status === 403) return 'forbidden';
  return 'error';
}

/** Mostrar o interruptor "Incluir mapa do percurso"? So adulto com mapa disponivel; menor/sem data nunca. */
export function canOfferMap(isAdult: boolean, availability: MapAvailability): boolean {
  return isAdult && availability === 'available';
}

/** Explicacao curta quando o mapa nao e oferecido (null = nao precisa explicar). */
export function mapUnavailableNote(isAdult: boolean, availability: MapAvailability): string | null {
  if (!isAdult) return null;
  if (availability === 'short') return 'Percurso curto demais para mostrar o mapa sem revelar o início e o fim.';
  if (availability === 'error') return 'Não foi possível preparar o mapa agora. Você pode publicar só o resumo.';
  return null;
}

/** O mapa vai no post? So se o interruptor esta ligado E ha mapa a oferecer (padrao: desligado). */
export function includeMapEffective(switchOn: boolean, isAdult: boolean, availability: MapAvailability): boolean {
  return switchOn && canOfferMap(isAdult, availability);
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Enquadramento que cobre os pontos com margem de 30% (e um minimo para percurso quase reto/parado). */
export function regionForPoints(points: MapPoint[], minDelta = 0.004): MapRegion {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.3, minDelta),
    longitudeDelta: Math.max((maxLng - minLng) * 1.3, minDelta),
  };
}

// ----------------------------------------------------------------------------------------------------------------- publicar
export interface RunPostPayload {
  type: 'run';
  reference_id: string;
  caption?: string;
  media_url?: string;
  origin: 'manual';
}

/** Corpo de POST /posts: media_url SO quando ha mapa enviado; legenda so se nao vazia. Sem rota nem coordenada. */
export function buildRunPostPayload(args: { runId: string; caption?: string | null; mapUrl?: string | null }): RunPostPayload {
  const payload: RunPostPayload = { type: 'run', reference_id: args.runId, origin: 'manual' };
  const caption = typeof args.caption === 'string' ? args.caption.trim() : '';
  if (caption !== '') payload.caption = caption;
  if (typeof args.mapUrl === 'string' && args.mapUrl !== '') payload.media_url = args.mapUrl;
  return payload;
}

export type PublishErrorKind = 'already_published' | 'rejected' | 'other';

/** Erro de POST /posts: 409 = corrida ja publicada (sem tentar de novo); 422 = mostrar a mensagem do servidor; resto = generico. */
export function classifyPublishError(err: unknown): PublishErrorKind {
  const status = (err as { response?: { status?: unknown } } | null | undefined)?.response?.status;
  if (status === 409) return 'already_published';
  if (status === 422) return 'rejected';
  return 'other';
}

export const ALREADY_PUBLISHED_MESSAGE = 'Esta corrida já foi publicada no feed.';

export type PublishStage = 'idle' | 'snapshot' | 'uploading' | 'saving' | 'map_failed' | 'done';

/** Botao Publicar ocupado (sem toque duplo): qualquer etapa em andamento. */
export function isPublishing(stage: PublishStage): boolean {
  return stage === 'snapshot' || stage === 'uploading' || stage === 'saving';
}

/** Opcoes depois de falhar o mapa (snapshot ou envio): tentar de novo (se faz sentido) e publicar so o resumo. */
export function mapFailureOptions(retryable: boolean): { retry: boolean; withoutMap: boolean } {
  return { retry: retryable, withoutMap: true };
}

/** Texto do progresso do publicar. */
export function publishProgressText(stage: PublishStage): string | null {
  if (stage === 'snapshot') return 'Preparando o mapa...';
  if (stage === 'uploading') return 'Enviando o mapa...';
  if (stage === 'saving') return 'Publicando...';
  return null;
}
