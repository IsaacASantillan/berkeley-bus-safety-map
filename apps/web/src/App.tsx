import { useState, useCallback } from 'react';
import { Map } from './components/Map.js';
import { Sidebar } from './components/Sidebar.js';
import { StopDrawer } from './components/StopDrawer.js';
import { useStops } from './hooks/useStops.js';
import type { StopsQuery } from './lib/api.js';

export default function App() {
  const [query, setQuery] = useState<StopsQuery>({ timeWindow: 'all' });
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const { data: stopsData } = useStops(query);
  const stopCount = stopsData?.length ?? 0;

  const handleBoundsChange = useCallback((bbox: [number, number, number, number]) => {
    setQuery(prev => ({ ...prev, bbox }));
  }, []);

  const handleQueryChange = useCallback((updates: StopsQuery) => {
    setQuery(updates);
  }, []);

  const handleStopClick = useCallback((stopId: string) => {
    setSelectedStopId(stopId);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setSelectedStopId(null);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100">
      {/* Left sidebar */}
      <Sidebar
        query={query}
        onQueryChange={handleQueryChange}
        stopCount={stopCount}
      />

      {/* Map + right drawer container */}
      <div className="relative flex-1 overflow-hidden">
        <Map
          query={query}
          onStopClick={handleStopClick}
          onBoundsChange={handleBoundsChange}
        />

        {/* Right stop detail drawer */}
        <StopDrawer
          stopId={selectedStopId}
          onClose={handleDrawerClose}
        />
      </div>
    </div>
  );
}
