# Data Dictionary

## Source CSV Files

All three CSV files live in `data-pipeline/data/` (or the project root — the pipeline checks both).

---

### 1. `berkeleyuniquestops.csv` — AC Transit Bus Stops

| Column | Used | Description |
|---|---|---|
| `OBJECTID` | — | Internal row ID |
| `stp_identi` | ✅ **stop_id** | Unique stop identifier (e.g. `0200010`) |
| `stp_511_id` | — | Regional 511 system ID |
| `stp_descri` | ✅ **stop_name** | Human-readable stop name / cross-street |
| `route` | ✅ **route** | AC Transit route(s) serving the stop |
| `longitude` | ✅ **lon** | WGS84 decimal degrees (negative = west) |
| `latitude` | ✅ **lat** | WGS84 decimal degrees |

**Notes:**
- 606 rows in the dataset; all have valid coordinates.
- Coordinate system: **WGS84 (EPSG:4326)** — no conversion needed.

---

### 2. `callsforservice.csv` — Berkeley PD Calls for Service

| Column | Used | Description |
|---|---|---|
| `Incident_Number` | ✅ **id** | Unique incident ID (e.g. `2026-00009487`) |
| `CreateDatetime` | ✅ **datetime** | ISO-ish timestamp: `2026/02/28 07:26:53+00` |
| `Call_Type` | ✅ **category** | Full call type (e.g. `CFS SEC - Security Check`) |
| `Source` | — | How the call was received (Telephone, 911 Call, etc.) |
| `Progress` | — | Status at time of export |
| `Priority` | — | BPD dispatch priority (Level 0–4) |
| `Dispositions` | — | Outcome / disposition code |
| `Block_Address` | ✅ **address** | Block-level address (e.g. `2100 MARTIN LUTHER KING JR WAY`) |
| `City` | — | Always `BERKELEY` for Berkeley calls |
| `ZIP_Code` | ✅ **zip** | 5-digit US ZIP code |
| `NonBerkeley_Address` | — | Used for mutual-aid calls outside city |
| `ObjectId` | — | Internal ArcGIS object ID |

**⚠️ Important limitation:**
The CSV export contains **no GPS coordinates**. The original source (Berkeley PD ArcGIS feature service) does include lat/lon fields, but those were not included in this export. The pipeline groups calls by their `ZIP_Code` field and stores up to 500 most-recent calls per ZIP. The stop detail panel shows calls for the stop's ZIP code as an approximation — **this is not a true 1-mile spatial join**.

**Category normalisation:** The `CFS XXX - ` prefix is stripped from `Call_Type` for display (e.g. `CFS SEC - Security Check` → `Security Check`).

---

### 3. `collisiondata.csv` — Traffic Collisions

| Column | Used | Description |
|---|---|---|
| `DateTime` | ✅ **datetime** | Collision date/time (local) |
| `Date` | — | Date portion |
| `Time` | — | Time portion |
| `Month` | — | Month number |
| `Year` | — | Year number |
| `Day of Week` | — | 0=Sunday, 6=Saturday |
| `Hour` | — | Hour of day (0–23) |
| `Accident Location` | ✅ **location** | Intersection description (e.g. `7th Street & Ashby Avenue`) |
| `PCF Description` | ✅ **description** | Full primary collision factor text (e.g. `VC 22350: Unsafe speed…`) |
| `PCF Category` | ✅ **category** | Broad category (e.g. `Speed Laws`, `Right of Way`, `DUI`) |
| `Involved Objects` | ✅ **involved** | Objects in collision (e.g. `2 Car`, `1 Ped, 1 Car`) |
| `Party at Fault` | — | Driver / Pedestrian / etc. |
| `Suspected Serious Injury` | — | Count |
| `Suspected Minor Injury` | — | Count |
| `Suspected Possible Injury` | — | Count |
| `Injury Severity` | ✅ **severity** | `No Injury`, `Unspecified Injury`, `Suspected Minor Injury`, etc. |
| `ObjectId` | ✅ **id** | Unique collision ID |
| `x` | ✅ **lon** (after conversion) | Easting in **EPSG:3857 (Web Mercator)** |
| `y` | ✅ **lat** (after conversion) | Northing in **EPSG:3857 (Web Mercator)** |

**Coordinate conversion (EPSG:3857 → WGS84):**
```
lon = x / 20037508.34 × 180
lat = atan(exp(y × π / 20037508.34)) × (360 / π) − 90
```
Records whose converted coordinates fall outside the bounding box `lat ∈ [37.5, 38.2]`, `lon ∈ [−122.6, −122.0]` are dropped (1 record in current data).

---

## Pipeline Output Files (`apps/web/public/data/`)

| File | Size | Description |
|---|---|---|
| `stops.json` | ~127 KB | All stops with lat/lon, collision severity, ZIP, cluster assignment |
| `stop-details.json` | ~4.7 MB | Per-stop: up to 30 most-recent collisions within 1 mile |
| `calls-by-zip.json` | ~624 KB | Up to 500 most-recent calls per Berkeley ZIP code |
| `clusters.json` | ~4 KB | 6 k-means clusters with centroid, radius, dominant category |
| `data-quality.json` | ~1 KB | Row counts, dropped records, processing time |

---

## Internal Data Models

### `Stop` (in `stops.json`)
```typescript
{
  stop_id:            string;   // e.g. "0200010"
  stop_name:          string;   // e.g. "Jackson St & 8th St"
  lat:                number;   // WGS84
  lon:                number;   // WGS84
  route:              string;   // e.g. "18 52"
  zip:                string | null;
  cluster_id:         number | null;  // 0–5
  collision_count:    number;   // collisions within 1 mile
  collision_severity: "RED"|"ORANGE"|"YELLOW"|"GREEN"|"GRAY";
  call_count_zip:     number;   // total calls in same ZIP
}
```

### Severity thresholds (collision_count × max injury severity)
| Color | Condition |
|---|---|
| RED | ≥10 collisions OR any fatal/serious injury |
| ORANGE | ≥5 collisions OR any injury ≥ minor |
| YELLOW | ≥2 collisions |
| GREEN | 1 collision |
| GRAY | 0 collisions |

### `Cluster` (in `clusters.json`)
```typescript
{
  id:                 number;    // 0–5
  label:              string;    // e.g. "West Berkeley"
  centroid:           { lat, lon };
  radius_miles:       number;    // max dist from centroid to member stop + 0.15 mi
  dominant_category:  string;    // most frequent PCF Category in circle
  top_categories:     Array<{ category, count, source }>;
  total_collisions:   number;    // collisions within cluster radius
  total_calls_zip:    number;    // calls in member ZIPs
  stop_count:         number;
  member_zips:        string[];
}
```
