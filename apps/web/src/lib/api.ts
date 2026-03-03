import type { StopSummary, StopDetail, Incident, StopLink } from '@bss/shared';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

// ── Static mode cache + helpers ────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = {
  GRAY: 0, GREEN: 1, YELLOW: 2, ORANGE: 3, RED: 4,
};

let _stops: StopSummary[] | null = null;
let _details: Record<string, { incidents: Incident[]; links: StopLink[] }> | null = null;

async function staticStops(): Promise<StopSummary[]> {
  if (!_stops) {
    const res = await fetch(`${import.meta.env.BASE_URL}data/stops.json`);
    if (!res.ok) throw new Error(`Failed to load stops: ${res.status}`);
    _stops = (await res.json()).stops;
  }
  return _stops!;
}

async function staticDetails() {
  if (!_details) {
    const res = await fetch(`${import.meta.env.BASE_URL}data/stop-details.json`);
    if (!res.ok) throw new Error(`Failed to load stop details: ${res.status}`);
    _details = await res.json();
  }
  return _details!;
}

// ── Live API helper ────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function fetchBoundary(): Promise<GeoJSON.FeatureCollection> {
  if (STATIC) {
    const res = await fetch(`${import.meta.env.BASE_URL}data/boundary.json`);
    if (!res.ok) throw new Error(`Failed to load boundary: ${res.status}`);
    return res.json();
  }
  return get<GeoJSON.FeatureCollection>('/api/boundary');
}

export interface StopsQuery {
  bbox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  q?: string;
  minSeverity?: string;
  timeWindow?: string;
}

export async function fetchStops(query: StopsQuery = {}): Promise<StopSummary[]> {
  if (STATIC) {
    let stops = await staticStops();

    if (query.bbox) {
      const [minLon, minLat, maxLon, maxLat] = query.bbox;
      stops = stops.filter(
        s => s.stop_lat >= minLat && s.stop_lat <= maxLat &&
             s.stop_lon >= minLon && s.stop_lon <= maxLon,
      );
    }

    if (query.q) {
      const q = query.q.toLowerCase();
      stops = stops.filter(s => s.stop_name?.toLowerCase().includes(q));
    }

    if (query.minSeverity) {
      const minRank = SEVERITY_RANK[query.minSeverity] ?? 0;
      stops = stops.filter(s => (SEVERITY_RANK[s.severity_color] ?? 0) >= minRank);
    }

    return stops;
  }

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
  if (STATIC) {
    const [stops, details] = await Promise.all([staticStops(), staticDetails()]);
    const summary = stops.find(s => s.stop_id === stopId);
    if (!summary) throw new Error(`Stop ${stopId} not found`);
    const detail = details[stopId] ?? { incidents: [], links: [] };
    return { ...summary, ...detail };
  }
  return get<StopDetail>(`/api/stops/${encodeURIComponent(stopId)}?page=${page}`);
}
