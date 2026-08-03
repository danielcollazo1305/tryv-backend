import { ActivityType } from '@/services/activities';
import { api } from '@/services/api';

export interface LiveActivity {
  id: string;
  user_id: string;
  activity_type: string;
  started_at: string;
  last_updated_at: string;
  last_lat: number | null;
  last_lng: number | null;
  distance_meters: number;
  elapsed_seconds: number;
  pace_seconds_per_km: number | null;
  heart_rate_bpm: number | null;
}

export interface LiveActivityUpdatePayload {
  lat: number;
  lng: number;
  distance_meters: number;
  elapsed_seconds: number;
  pace_seconds_per_km?: number | null;
  heart_rate_bpm?: number | null;
}

export async function startLiveActivity(activityType: ActivityType): Promise<LiveActivity> {
  const response = await api.post<LiveActivity>('/activities/live/start', { activity_type: activityType });
  return response.data;
}

export async function updateLiveActivity(id: string, payload: LiveActivityUpdatePayload): Promise<LiveActivity> {
  const response = await api.post<LiveActivity>(`/activities/live/${id}/update`, payload);
  return response.data;
}

export async function finishLiveActivity(id: string): Promise<void> {
  await api.post(`/activities/live/${id}/finish`);
}

export async function getLiveActivity(id: string): Promise<LiveActivity> {
  const response = await api.get<LiveActivity>(`/activities/live/${id}`);
  return response.data;
}
