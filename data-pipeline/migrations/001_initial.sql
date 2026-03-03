-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── City boundary ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_boundary (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  geom        GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS city_boundary_geom_idx ON city_boundary USING GIST (geom);

-- ── Bus stops ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stops (
  stop_id     TEXT PRIMARY KEY,
  stop_name   TEXT,
  stop_lat    DOUBLE PRECISION NOT NULL,
  stop_lon    DOUBLE PRECISION NOT NULL,
  geom        GEOMETRY(POINT, 4326) NOT NULL,
  in_city     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stops_geom_idx  ON stops USING GIST (geom);
CREATE INDEX IF NOT EXISTS stops_city_idx  ON stops (in_city);
CREATE INDEX IF NOT EXISTS stops_name_trgm ON stops USING GIN (stop_name gin_trgm_ops);

-- ── Incidents ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE incident_type_enum AS ENUM (
    'CALLS_FOR_SERVICE', 'COLLISION', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS incidents (
  incident_id   TEXT NOT NULL,
  incident_type incident_type_enum NOT NULL DEFAULT 'CALLS_FOR_SERVICE',
  category      TEXT,
  occurred_at   TIMESTAMPTZ,
  address       TEXT,
  source        TEXT NOT NULL,
  source_url    TEXT,
  geom          GEOMETRY(POINT, 4326),
  created_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (incident_id, incident_type)
);

CREATE INDEX IF NOT EXISTS incidents_geom_idx ON incidents USING GIST (geom);
CREATE INDEX IF NOT EXISTS incidents_type_idx ON incidents (incident_type);
CREATE INDEX IF NOT EXISTS incidents_date_idx ON incidents (occurred_at);

-- ── Stop incident summary ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stop_incident_summary (
  stop_id                TEXT PRIMARY KEY REFERENCES stops(stop_id) ON DELETE CASCADE,
  incident_count_total   INTEGER NOT NULL DEFAULT 0,
  incident_count_last_12mo INTEGER NOT NULL DEFAULT 0,
  severity_color         TEXT NOT NULL DEFAULT 'GRAY',
  updated_at             TIMESTAMPTZ DEFAULT now()
);

-- ── Stop links (news / reports) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stop_links (
  id           SERIAL PRIMARY KEY,
  stop_id      TEXT NOT NULL REFERENCES stops(stop_id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  title        TEXT NOT NULL,
  source       TEXT,
  published_at TIMESTAMPTZ,
  snippet      TEXT,
  query_used   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (stop_id, url)
);

CREATE INDEX IF NOT EXISTS stop_links_stop_idx ON stop_links (stop_id);

-- ── Geocoding cache ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geocode_cache (
  address    TEXT PRIMARY KEY,
  lat        DOUBLE PRECISION,
  lon        DOUBLE PRECISION,
  success    BOOLEAN NOT NULL DEFAULT false,
  cached_at  TIMESTAMPTZ DEFAULT now()
);
