// ── Core domain types ────────────────────────────────────────────────────────

export type SeverityColor = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'GRAY';

export interface StopSummary {
  stop_id:            string;
  stop_name:          string;
  lat:                number;
  lon:                number;
  route:              string;
  zip:                string | null;
  cluster_id:         number | null;
  collision_count:    number;
  collision_severity: SeverityColor;
}

export interface StopsPayload {
  generated_at: string;
  stops: StopSummary[];
}

// ── Incident types ───────────────────────────────────────────────────────────

export interface CollisionRecord {
  id:           string;
  datetime:     string | null;
  category:     string;      // PCF Category
  description:  string;      // PCF Description
  location:     string;      // Accident Location
  severity:     string;      // Injury Severity
  involved:     string;      // Involved Objects
  lat:          number;      // WGS84 — used for fly-to and map dots
  lon:          number;
  distance_mi?: number;
}

// ── Stop detail (for drawer) ─────────────────────────────────────────────────

export interface StopDetail {
  collisions: CollisionRecord[];
}

export type StopDetailMap = Record<string, StopDetail>;

// ── Data quality ──────────────────────────────────────────────────────────────

export interface DataQuality {
  generated_at:        string;
  processing_time_ms:  number;
  radius_miles:        number;
  k_clusters:          number;
  stops: {
    total_in_csv:       number;
    loaded:             number;
    dropped_no_coords:  number;
  };
  collisions: {
    total_in_csv:       number;
    loaded:             number;
    dropped_no_coords:  number;
    note:               string;
  };
}

// ── App state ─────────────────────────────────────────────────────────────────

export type DateFilter = '30d' | '6mo' | '1yr' | 'all';

export interface AppData {
  stops:       StopSummary[];
  stopDetails: StopDetailMap;
  quality:     DataQuality | null;
  loading:     boolean;
  error:       string | null;
}
