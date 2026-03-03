# Berkeley Bus Stop Safety Map

An interactive map showing AC Transit bus stops within Berkeley, CA colored by nearby incident density (calls for service, collisions). Click any stop to see an incident report and related news coverage.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 · TypeScript · Vite · TailwindCSS · MapLibre GL JS · react-query |
| Backend | Fastify · TypeScript · pg (node-postgres) |
| Database | PostgreSQL + PostGIS |
| Data pipeline | Node.js scripts (GTFS, Socrata, GDELT) |
| Monorepo | pnpm workspaces |

---

## Prerequisites

- **Node.js 20+**
- **pnpm** (`npm install -g pnpm`)
- **PostgreSQL 14+** with **PostGIS 3** installed

### Install PostGIS on macOS (Homebrew)

```bash
brew install postgis
brew services start postgresql@16   # adjust version as needed
```

### Create the database

```bash
psql postgres -c "CREATE DATABASE berkeley_safety;"
psql berkeley_safety -c "CREATE EXTENSION postgis;"
psql berkeley_safety -c "CREATE EXTENSION pg_trgm;"
```

Verify PostGIS is working:
```bash
psql berkeley_safety -c "SELECT PostGIS_Version();"
```

---

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
# Copy root template to each package that needs it
cp .env.example data-pipeline/.env
cp apps/api/.env.example apps/api/.env
```

Edit both `.env` files and set at minimum:
```
DATABASE_URL=postgresql://YOUR_USER@localhost:5432/berkeley_safety
```

The default dataset IDs for Berkeley Open Data are pre-filled. If a dataset has changed, look up the correct ID at [data.cityofberkeley.info](https://data.cityofberkeley.info) and update `BERKELEY_BOUNDARY_DATASET_ID` and `BERKELEY_CFS_DATASET_ID`.

### 3. Run the data pipeline

```bash
# Run all steps: migrations → boundary → stops → crimes → summary → links
pnpm pipeline:run

# Or step by step:
pnpm pipeline:setup                            # migrations only
pnpm --filter @bss/pipeline ingest:boundary
pnpm --filter @bss/pipeline ingest:stops
pnpm --filter @bss/pipeline ingest:crimes
pnpm --filter @bss/pipeline compute:summary
pnpm --filter @bss/pipeline refresh:links
```

> **Note on calls-for-service ingestion**: The Berkeley Socrata dataset IDs sometimes change. If you get a 404, visit [data.cityofberkeley.info](https://data.cityofberkeley.info), find the current "Calls for Service" dataset, copy its ID from the URL, and update `BERKELEY_CFS_DATASET_ID` in your `.env`.

> **Note on GTFS**: If the AC Transit GTFS URL changes, update `ACTRANSIT_GTFS_URL` in your `.env`. The latest feed URL can always be found at [actransit.org/schedule-data](https://www.actransit.org/schedule-data).

### 4. Start the API server

```bash
pnpm dev:api
# → http://localhost:3001
```

Test it:
```bash
curl http://localhost:3001/api/health
curl "http://localhost:3001/api/stops" | head -c 500
```

### 5. Start the frontend

In a second terminal:
```bash
pnpm dev
# → http://localhost:5173
```

---

## Project Structure

```
isaacplanningmap/
├── apps/
│   ├── web/                # React frontend
│   │   └── src/
│   │       ├── components/ # Map, Sidebar, StopDrawer, Legend
│   │       ├── hooks/      # react-query hooks
│   │       └── lib/        # api.ts, colors.ts, cn.ts
│   └── api/                # Fastify REST API
│       └── src/
│           ├── routes/     # boundary.ts, stops.ts
│           └── db.ts
├── packages/
│   └── shared/             # Shared TypeScript types
│       └── src/index.ts
├── data-pipeline/
│   ├── migrations/         # 001_initial.sql
│   └── scripts/            # ingest_*.js, compute_*.js, refresh_*.js
├── .env.example
└── pnpm-workspace.yaml
```

---

## API Reference

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/boundary` | Berkeley city boundary as GeoJSON |
| `GET /api/stops` | Stops list (with optional filters) |
| `GET /api/stops/:stopId` | Stop detail with incidents + news links |
| `POST /api/admin/refresh` | Admin endpoint (requires `x-admin-token` header) |

**Query params for `/api/stops`:**
- `bbox` — `minLon,minLat,maxLon,maxLat`
- `q` — text search on stop name
- `minSeverity` — `GREEN` | `YELLOW` | `ORANGE` | `RED`
- `timeWindow` — `12mo` | `3yr` | `all`

---

## Severity Color Rules

| Color | Condition |
|---|---|
| Red | 4+ incidents within 50 m |
| Orange | 3 incidents |
| Yellow | 2 incidents |
| Green | 1 incident |
| Gray | 0 incidents |

Radius is configurable via `INCIDENT_RADIUS_METERS` env var (default: 50 m).

---

## Data Sources

| Dataset | Source |
|---|---|
| Bus stops | [AC Transit GTFS](https://www.actransit.org/schedule-data) |
| City boundary | [Berkeley Open Data](https://data.cityofberkeley.info) |
| Calls for service | [Berkeley Open Data](https://data.cityofberkeley.info) |
| News links | [GDELT Project](https://gdeltproject.org) — free, no key required |
| Traffic collisions | [TIMS / SWITRS](https://tims.berkeley.edu) — optional module |

---

## Deployment

### API (Render / Railway / Fly.io)

1. Create a PostgreSQL instance with PostGIS enabled
2. Deploy `apps/api` as a Node.js service with `DATABASE_URL` and `ADMIN_TOKEN` set
3. Run the pipeline scripts once against the production DB

### Frontend (Vercel / Cloudflare Pages)

1. Set `VITE_API_BASE_URL` to your deployed API URL
2. Build command: `pnpm --filter @bss/web build`
3. Output directory: `apps/web/dist`

---

> **Disclaimer**: Incident coverage is based on available public data and search results. It may be incomplete, delayed, or inaccurate. This tool is for informational purposes only.
