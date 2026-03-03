# Berkeley Bus Stop Safety & Incident Explorer

An interactive web map showing AC Transit bus stops in Berkeley colored by nearby incident density, with clickable detail panels, six area summary circles, and a full data-quality report.

## Features

- **606 AC Transit bus stops** rendered on a map, colored by nearby collision severity (RED → GREEN → GRAY)
- **Click any stop** to open a detail drawer with:
  - Collision count within 1 mile (precise spatial join)
  - Calls for service in the same ZIP code (approximate — see limitations)
  - Two-section incident table: Traffic Collisions + Calls for Service
  - Date filter (Last 30d / 6 months / 1 year / All time) and keyword search
- **6 large area circles** from K-means clustering, each colored by its dominant collision type
- **Click any area circle** for a summary panel: dominant category, top collision types, total counts
- **Legend** panel explaining severity colors and area circle color mapping
- **Data Quality bar** at the bottom showing loaded/dropped record counts and notes

---

## Quick Start

### Requirements
- **Node.js** >= 18
- **pnpm** >= 8 (`npm install -g pnpm`)

### 1. Install dependencies
```bash
pnpm install
```

### 2. Place CSV files

Copy the three CSV files into `data-pipeline/data/`:
```
data-pipeline/data/
  berkeleyuniquestops.csv
  callsforservice.csv
  collisiondata.csv
```
> The pipeline also searches the project root as a fallback.

### 3. Run the data pipeline
```bash
pnpm pipeline:csv
```
This reads the CSVs and writes pre-processed JSON to `apps/web/public/data/`. Takes ~3 seconds.

### 4. Start the dev server
```bash
pnpm dev
```
Open http://localhost:5173

---

## Project Structure

```
isaacplanningmap/
├── apps/web/                      # React frontend
│   ├── public/data/               # Pipeline JSON outputs
│   │   ├── stops.json
│   │   ├── stop-details.json
│   │   ├── calls-by-zip.json
│   │   ├── clusters.json
│   │   └── data-quality.json
│   └── src/
│       ├── App.tsx
│       ├── types/index.ts
│       ├── lib/haversine.ts       # Haversine distance + circle polygon
│       ├── lib/colorPalette.ts    # Category -> color mapping
│       ├── hooks/useAppData.ts    # Loads all JSON
│       └── components/
│           ├── Map.tsx
│           ├── StopDrawer.tsx
│           ├── Legend.tsx
│           └── DataQualityPanel.tsx
├── data-pipeline/
│   ├── data/                      # Place CSVs here
│   └── scripts/process-csvs.js   # Pipeline script
├── DATA_DICTIONARY.md
└── README.md
```

---

## CSV Column Mappings

### berkeleyuniquestops.csv
- Stop ID: `stp_identi`
- Stop name: `stp_descri`
- Lat/lon: `latitude` / `longitude` (WGS84, direct)
- Route: `route`

### callsforservice.csv
- ID: `Incident_Number`
- Datetime: `CreateDatetime`
- Category: `Call_Type` (normalised: "CFS XXX - Label" -> "Label")
- Address: `Block_Address`
- ZIP: `ZIP_Code` (used for proximity approximation)

### collisiondata.csv
- ID: `ObjectId`
- Datetime: `DateTime`
- Location: `Accident Location`
- Category: `PCF Category` (e.g. Speed Laws, Right of Way, DUI)
- Severity: `Injury Severity`
- Coordinates: `x` / `y` in **EPSG:3857 (Web Mercator)** — converted to WGS84:
  ```
  lon = x / 20037508.34 * 180
  lat = atan(exp(y * PI / 20037508.34)) * 360 / PI - 90
  ```

---

## Performance

| Dataset | Records | Approach |
|---|---|---|
| Stops | 606 | Direct render |
| Collisions | ~16,000 | Haversine spatial join in pipeline (~2.5 s, 9.7M pairs) |
| Calls for service | ~317,000 | No GPS in CSV; grouped by ZIP code, capped 500/ZIP |

---

## Known Limitations

1. **Calls for service have no GPS coordinates** in the CSV. Proximity uses ZIP code overlap, not a true 1-mile spatial join.
2. **Collision x/y are EPSG:3857** and are converted mathematically — accurate to within meters.
3. **K-means is stochastic** — re-running the pipeline may produce slightly different cluster shapes.
4. **Calls capped at 500/ZIP** sorted most-recent first; collisions capped at 30/stop.
5. Approximately **1,333 calls** were dropped (no valid Berkeley ZIP code).

---

## Tech Stack
- React 19 + TypeScript + Vite 6
- MapLibre GL JS 5 (CARTO Positron basemap)
- Tailwind CSS 3 + Lucide React
- Node.js ESM pipeline with `csv-parse`
- No database, no live API — static JSON only
