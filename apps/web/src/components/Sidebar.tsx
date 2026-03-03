import { useState, useCallback } from 'react';
import { Search, Bus, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { Legend } from './Legend.js';
import type { StopsQuery } from '../lib/api.js';

interface SidebarProps {
  query: StopsQuery;
  onQueryChange: (q: StopsQuery) => void;
  stopCount: number;
}

const TIME_WINDOWS = [
  { value: 'all',  label: 'All time' },
  { value: '12mo', label: 'Last 12 months' },
  { value: '3yr',  label: 'Last 3 years' },
];

const SEVERITIES = [
  { value: '',       label: 'Any severity' },
  { value: 'GREEN',  label: '1+ incidents' },
  { value: 'YELLOW', label: '2+ incidents' },
  { value: 'ORANGE', label: '3+ incidents' },
  { value: 'RED',    label: '4+ incidents' },
];

export function Sidebar({ query, onQueryChange, stopCount }: SidebarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [searchText, setSearchText] = useState(query.q ?? '');

  const handleSearch = useCallback((val: string) => {
    setSearchText(val);
    onQueryChange({ ...query, q: val || undefined });
  }, [query, onQueryChange]);

  const handleTimeWindow = useCallback((val: string) => {
    onQueryChange({ ...query, timeWindow: val || undefined });
  }, [query, onQueryChange]);

  const handleSeverity = useCallback((val: string) => {
    onQueryChange({ ...query, minSeverity: val || undefined });
  }, [query, onQueryChange]);

  return (
    <aside className="w-80 h-full flex flex-col bg-white border-r border-slate-200 shadow-lg z-10">
      {/* Header */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <Bus className="w-5 h-5 text-indigo-600" />
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">
            Berkeley Bus Safety
          </h1>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Incident reports near AC Transit stops within Berkeley city limits.
        </p>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search stop name…"
            value={searchText}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
                       placeholder-slate-400 text-slate-700 transition"
          />
        </div>
      </div>

      {/* Filters toggle */}
      <div className="px-4 py-2.5 border-b border-slate-100">
        <button
          onClick={() => setShowFilters(f => !f)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 transition"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          <ChevronDown
            className={cn('w-3.5 h-3.5 transition-transform', showFilters && 'rotate-180')}
          />
        </button>

        {showFilters && (
          <div className="mt-3 space-y-3">
            {/* Time window */}
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium">
                Time window
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TIME_WINDOWS.map(tw => (
                  <button
                    key={tw.value}
                    onClick={() => handleTimeWindow(tw.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition',
                      (query.timeWindow ?? 'all') === tw.value
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'
                    )}
                  >
                    {tw.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Min severity */}
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium">
                Min. severity
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SEVERITIES.map(sv => (
                  <button
                    key={sv.value}
                    onClick={() => handleSeverity(sv.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition',
                      (query.minSeverity ?? '') === sv.value
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'
                    )}
                  >
                    {sv.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stop count */}
      <div className="px-5 py-2.5 border-b border-slate-100">
        <p className="text-xs text-slate-500">
          Showing <span className="font-semibold text-slate-700">{stopCount}</span> stops
        </p>
      </div>

      {/* Legend */}
      <div className="px-4 py-4 flex-1 overflow-y-auto">
        <Legend />
      </div>

      {/* Data sources footer */}
      <div className="px-4 py-4 border-t border-slate-100 bg-slate-50">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Data sources
        </p>
        <ul className="text-xs text-slate-500 space-y-1 leading-relaxed">
          <li>
            <a href="https://www.actransit.org/schedule-data" target="_blank" rel="noreferrer"
               className="text-indigo-600 hover:underline">
              AC Transit GTFS
            </a>{' '}— bus stops
          </li>
          <li>
            <a href="https://data.cityofberkeley.info" target="_blank" rel="noreferrer"
               className="text-indigo-600 hover:underline">
              Berkeley Open Data
            </a>{' '}— city boundary &amp; crime data
          </li>
          <li>
            <a href="https://gdeltproject.org" target="_blank" rel="noreferrer"
               className="text-indigo-600 hover:underline">
              GDELT Project
            </a>{' '}— related news links
          </li>
        </ul>
        <p className="mt-2 text-xs text-slate-400 leading-relaxed italic">
          Coverage is based on available public data and may be incomplete.
        </p>
      </div>
    </aside>
  );
}
