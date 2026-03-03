// ── Severity / color ─────────────────────────────────────────────────────────

export type SeverityColor = "GRAY" | "GREEN" | "YELLOW" | "ORANGE" | "RED";

export function incidentCountToSeverity(count: number): SeverityColor {
  if (count >= 4) return "RED";
  if (count === 3) return "ORANGE";
  if (count === 2) return "YELLOW";
  if (count === 1) return "GREEN";
  return "GRAY";
}

export const SEVERITY_HEX: Record<SeverityColor, string> = {
  RED: "#EF4444",
  ORANGE: "#F97316",
  YELLOW: "#EAB308",
  GREEN: "#22C55E",
  GRAY: "#9CA3AF",
};

// ── Core entities ─────────────────────────────────────────────────────────────

export interface StopSummary {
  stop_id: string;
  stop_name: string | null;
  stop_lat: number;
  stop_lon: number;
  incident_count_total: number;
  incident_count_last_12mo: number;
  severity_color: SeverityColor;
}

export type IncidentType = "CALLS_FOR_SERVICE" | "COLLISION" | "OTHER";

export interface Incident {
  incident_id: string;
  incident_type: IncidentType;
  category: string | null;
  occurred_at: string | null; // ISO date string
  address: string | null;
  source: string;
  source_url: string | null;
}

export interface StopLink {
  url: string;
  title: string;
  source: string | null;
  published_at: string | null;
  snippet: string | null;
}

export interface StopDetail extends StopSummary {
  incidents: Incident[];
  links: StopLink[];
}

// ── API response shapes ────────────────────────────────────────────────────────

export interface BoundaryResponse {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface StopsResponse {
  stops: StopSummary[];
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
}
