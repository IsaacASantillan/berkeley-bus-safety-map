import { useState, useCallback, useMemo } from 'react';
import { Map } from './components/Map.js';
import { StopDrawer } from './components/StopDrawer.js';
import { Legend } from './components/Legend.js';
import { DataQualityPanel } from './components/DataQualityPanel.js';
import { useAppData } from './hooks/useAppData.js';
import type { StopSummary } from './types/index.js';
import { Loader2, AlertTriangle, Bus } from 'lucide-react';

export default function App() {
  const data = useAppData();

  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const selectedStop = useMemo<StopSummary | null>(
    () => data.stops.find(s => s.stop_id === selectedStopId) ?? null,
    [data.stops, selectedStopId],
  );

  const selectedDetail     = selectedStopId ? (data.stopDetails[selectedStopId] ?? null) : null;
  const selectedCollisions = selectedDetail?.collisions ?? [];

  const handleStopClick = useCallback((stopId: string) => setSelectedStopId(stopId), []);
  const handleStopClose = useCallback(() => setSelectedStopId(null), []);

  if (data.loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading map data…</p>
          <p className="text-slate-400 text-sm mt-1">Processing stops and collisions</p>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-slate-800 mb-2">Could not load map data</h1>
          <p className="text-slate-600 text-sm mb-4">{data.error}</p>
          <div className="bg-slate-100 rounded-lg p-4 text-left text-xs font-mono text-slate-600 space-y-1">
            <p className="font-bold text-slate-700 font-sans text-sm">Quick fix:</p>
            <p>1. Copy CSVs to <code>data-pipeline/data/</code></p>
            <p>2. Run: <code>pnpm pipeline:csv</code></p>
            <p>3. Restart: <code>pnpm dev</code></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      {/* Top header bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3
                      bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <Bus className="w-5 h-5 text-indigo-600" />
          <h1 className="text-sm font-bold text-slate-800">Berkeley Bus Stop Safety Explorer</h1>
        </div>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>
            <span className="font-semibold text-slate-700">{data.stops.length}</span> stops
          </span>
          <span>
            <span className="font-semibold text-slate-700">
              {data.stops.reduce((s, st) => s + st.collision_count, 0).toLocaleString()}
            </span>{' '}
            collision links
          </span>
        </div>
        <div className="ml-auto text-xs text-slate-400 italic">
          Click a stop to view nearby collisions
        </div>
      </div>

      {/* Map fills viewport below header */}
      <div className="absolute inset-0 pt-10">
        <div className="relative h-full">
          <Map
            stops={data.stops}
            onStopClick={handleStopClick}
            selectedStopId={selectedStopId}
            selectedCollisions={selectedCollisions}
          />

          <Legend />

          <StopDrawer
            stop={selectedStop}
            detail={selectedDetail}
            onClose={handleStopClose}
          />

          <DataQualityPanel quality={data.quality} loading={data.loading} />
        </div>
      </div>
    </div>
  );
}
