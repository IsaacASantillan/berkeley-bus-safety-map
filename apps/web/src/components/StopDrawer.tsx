import { useState, useMemo } from 'react';
import { X, MapPin, Car, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';
import type { StopSummary, StopDetail, CollisionRecord } from '../types/index.js';
import { SEVERITY_HEX, getCollisionSeverityColor } from '../lib/colorPalette.js';
import { cn } from '../lib/cn.js';

interface StopDrawerProps {
  stop:    StopSummary | null;
  detail:  StopDetail  | null;
  onClose: () => void;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon, title, count, color, open, onToggle,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  color: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-5 py-3 bg-slate-50
                 hover:bg-slate-100 transition border-b border-slate-200"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          {count}
        </span>
      </div>
      {open
        ? <ChevronDown className="w-4 h-4 text-slate-400" />
        : <ChevronRight className="w-4 h-4 text-slate-400" />}
    </button>
  );
}

// ── Collision row ─────────────────────────────────────────────────────────────

function CollisionRow({ c }: { c: CollisionRecord }) {
  const severityColor = getCollisionSeverityColor(c.severity);

  return (
    <li className="py-2.5 border-b border-slate-100 last:border-0 px-5">
      <div className="flex items-start gap-2.5">
        <span
          className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
          style={{ backgroundColor: severityColor }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800 leading-snug">{c.category}</p>
          {c.description && c.description !== c.category && (
            <p className="text-xs text-slate-500 mt-0.5 leading-snug">{c.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
            <span className="text-xs text-slate-500">{formatDate(c.datetime)}</span>
            {c.severity && (
              <span
                className="text-xs font-medium px-1.5 py-0.5 rounded text-white"
                style={{ backgroundColor: severityColor }}
              >
                {c.severity}
              </span>
            )}
            {c.involved && (
              <span className="text-xs text-slate-400">{c.involved}</span>
            )}
          </div>
          {c.location && (
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {c.location}
              {c.distance_mi !== undefined && (
                <span className="ml-1 text-slate-300">({c.distance_mi} mi)</span>
              )}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

export function StopDrawer({ stop, detail, onClose }: StopDrawerProps) {
  const [showCollisions, setShowCollisions] = useState(true);

  const isOpen = stop !== null;
  const collisions = detail?.collisions ?? [];

  const biggestOffender = useMemo(() => {
    if (!collisions.length) return null;
    const counts: Record<string, number> = {};
    for (const c of collisions) {
      counts[c.category] = (counts[c.category] ?? 0) + 1;
    }
    let best = '';
    let bestCount = 0;
    for (const [cat, count] of Object.entries(counts)) {
      if (count > bestCount) { best = cat; bestCount = count; }
    }
    return { category: best, count: bestCount };
  }, [collisions]);

  const sevColor = stop
    ? SEVERITY_HEX[stop.collision_severity] ?? SEVERITY_HEX.GRAY
    : SEVERITY_HEX.GRAY;

  return (
    <>
      {isOpen && (
        <div className="absolute inset-0 bg-black/10 z-20" onClick={onClose} />
      )}

      <div
        className={cn(
          'absolute right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-30 flex flex-col',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {!stop ? null : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-shrink-0">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-slate-800 leading-snug">{stop.stop_name}</h2>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {stop.lat.toFixed(5)}, {stop.lon.toFixed(5)}
                  </span>
                  {stop.route && (
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                      Route {stop.route}
                    </span>
                  )}
                  {stop.zip && (
                    <span className="text-xs text-slate-400">ZIP {stop.zip}</span>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stats */}
            <div className="px-5 py-3 border-b border-slate-100 flex-shrink-0 grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: sevColor }} />
                <div>
                  <p className="text-2xl font-bold leading-none" style={{ color: sevColor }}>
                    {stop.collision_count}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    collision{stop.collision_count !== 1 ? 's' : ''} nearby
                  </p>
                </div>
              </div>
              {biggestOffender ? (
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1 mb-0.5">
                    <TrendingUp className="w-3 h-3 text-slate-400" />
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Top type</p>
                  </div>
                  <p className="text-sm font-bold text-slate-800 leading-snug line-clamp-2">
                    {biggestOffender.category}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{biggestOffender.count} incident{biggestOffender.count !== 1 ? 's' : ''}</p>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-3 flex items-center">
                  <p className="text-xs text-slate-400 italic">No incidents recorded</p>
                </div>
              )}
            </div>

            {/* Incident list */}
            <div className="flex-1 overflow-y-auto">
              <SectionHeader
                icon={Car}
                title="Traffic Collisions"
                count={collisions.length}
                color="#ef4444"
                open={showCollisions}
                onToggle={() => setShowCollisions(v => !v)}
              />
              {showCollisions && (
                collisions.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-slate-400 italic">
                    No collisions recorded near this stop.
                  </p>
                ) : (
                  <ul>
                    {collisions.map(c => <CollisionRow key={c.id} c={c} />)}
                  </ul>
                )
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50 flex-shrink-0">
              <p className="text-xs text-slate-400">
                Stop ID: <span className="font-mono">{stop.stop_id}</span>
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
