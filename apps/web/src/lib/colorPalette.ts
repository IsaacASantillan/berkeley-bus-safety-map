// ── Stop severity palette (collision density per stop) ───────────────────────
export const SEVERITY_HEX: Record<string, string> = {
  RED:    '#7c3aed',  // purple  — highest collision density
  ORANGE: '#ef4444',  // red     — high collision density
  YELLOW: '#eab308',  // yellow  — moderate
  GREEN:  '#22c55e',  // green   — low
  GRAY:   '#94a3b8',  // gray    — none
};

export const SEVERITY_LABEL: Record<string, string> = {
  RED:    '21+ collisions nearby',
  ORANGE: '13–20 collisions nearby',
  YELLOW: '7–12 collisions nearby',
  GREEN:  '1–6 collisions nearby',
  GRAY:   'No collisions nearby',
};

// ── Collision dot severity (by individual injury severity field) ──────────────

/** Shared color scale for individual collision injury severity.
 *  Used by both map dots and StopDrawer severity badges. */
export function getCollisionSeverityColor(severity: string): string {
  const s = (severity ?? '').toLowerCase();
  if (s.includes('fatal'))   return '#dc2626';  // red
  if (s.includes('serious')) return '#ea580c';  // orange
  if (s.includes('minor') || s.includes('possible')) return '#ca8a04';  // amber
  return '#94a3b8';  // gray — no injury / unspecified
}

// Labels matching getCollisionSeverityColor for use in legends
export const COLLISION_SEVERITY_LEGEND = [
  { color: '#dc2626', label: 'Fatal' },
  { color: '#ea580c', label: 'Serious injury' },
  { color: '#ca8a04', label: 'Minor / possible injury' },
  { color: '#94a3b8', label: 'No injury / unspecified' },
] as const;

// ── Category palette (for area circles) ──────────────────────────────────────

const CATEGORY_PALETTE: Record<string, string> = {
  'Speed Laws':               '#e74c3c',
  'Right of Way':             '#f39c12',
  'Traffic Signal/Sign':      '#f1c40f',
  'Improper Turning':         '#2ecc71',
  'Turning, Starting, Signaling': '#2ecc71',
  'DUI':                      '#9b59b6',
  'Other Improper Driving':   '#3498db',
  'Unsafe Lane Change':       '#1abc9c',
  'Following Too Closely':    '#e67e22',
  'Pedestrian':               '#d35400',
  'Other Hazardous Movement': '#8e44ad',
  'Unknown / Not Stated':     '#95a5a6',
};

const FALLBACK_COLORS = [
  '#16a085', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50',
  '#f39c12', '#d35400', '#c0392b', '#7f8c8d', '#2ecc71',
];

const assignedFallbacks: Record<string, string> = {};
let fallbackIndex = 0;

export function getCategoryColor(category: string): string {
  if (!category) return '#94a3b8';
  if (CATEGORY_PALETTE[category]) return CATEGORY_PALETTE[category];

  const lower = category.toLowerCase();
  for (const [key, color] of Object.entries(CATEGORY_PALETTE)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return color;
    }
  }

  if (!assignedFallbacks[category]) {
    assignedFallbacks[category] = FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
    fallbackIndex++;
  }
  return assignedFallbacks[category];
}
