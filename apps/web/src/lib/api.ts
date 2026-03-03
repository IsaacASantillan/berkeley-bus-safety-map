import type { StopSummary, StopDetail } from '@bss/shared';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchBoundary(): Promise<GeoJSON.FeatureCollection> {
  return get<GeoJSON.FeatureCollection>('/api/boundary');
}

export interface StopsQuery {
  bbox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  q?: string;
  minSeverity?: string;
  timeWindow?: string;
}

export async function fetchStops(query: StopsQuery = {}): Promise<StopSummary[]> {
  const params = new URLSearchParams();
  if (query.bbox) params.set('bbox', query.bbox.join(','));
  if (query.q) params.set('q', query.q);
  if (query.minSeverity) params.set('minSeverity', query.minSeverity);
  if (query.timeWindow) params.set('timeWindow', query.timeWindow);

  const qs = params.toString();
  const data = await get<{ stops: StopSummary[] }>(`/api/stops${qs ? `?${qs}` : ''}`);
  return data.stops;
}

export async function fetchStopDetail(stopId: string, page = 1): Promise<StopDetail> {
  return get<StopDetail>(`/api/stops/${encodeURIComponent(stopId)}?page=${page}`);
}
