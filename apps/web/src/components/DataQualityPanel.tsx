import { useState } from 'react';
import type { DataQuality } from '../types/index.js';
import { ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import { cn } from '../lib/cn.js';

interface DataQualityPanelProps {
  quality: DataQuality | null;
  loading: boolean;
}

export function DataQualityPanel({ quality, loading }: DataQualityPanelProps) {
  const [open, setOpen] = useState(false);

  if (loading || !quality) return null;

  return (
    <div className={cn(
      'absolute bottom-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-sm border-t border-slate-200',
      'transition-all duration-300',
    )}>
      {/* Compact bar */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            <span>
              <strong className="text-slate-700">{quality.stops.loaded}</strong> stops ·{' '}
              <strong className="text-slate-700">{quality.collisions.loaded.toLocaleString()}</strong> collisions ·{' '}
              radius <strong className="text-slate-700">{quality.radius_miles} mi</strong>
            </span>
          </span>
          <span className="text-slate-400">
            Processed in {(quality.processing_time_ms / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Data Quality</span>
          {open
            ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            : <ChevronUp className="w-3.5 h-3.5 text-slate-400" />}
        </div>
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-2">
              Bus Stops
            </p>
            <ul className="space-y-1 text-slate-600">
              <li>Total in CSV: <span className="font-mono font-bold">{quality.stops.total_in_csv}</span></li>
              <li>Loaded: <span className="font-mono font-bold text-green-600">{quality.stops.loaded}</span></li>
            </ul>
            <p className="mt-2 text-slate-400 leading-snug">
              Source: <code>berkeleyuniquestops.csv</code> — lat/lon used directly.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-2">
              Traffic Collisions
            </p>
            <ul className="space-y-1 text-slate-600">
              <li>Total in CSV: <span className="font-mono font-bold">{quality.collisions.total_in_csv.toLocaleString()}</span></li>
              <li>Loaded: <span className="font-mono font-bold text-green-600">{quality.collisions.loaded.toLocaleString()}</span></li>
            </ul>
            <p className="mt-2 text-slate-400 leading-snug">
              Source: <code>collisiondata.csv</code> — x/y converted from EPSG:3857 to WGS84.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
