import { X, MapPin, AlertTriangle, ExternalLink, Clock, Loader2 } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { SEVERITY_HEX, SEVERITY_BG } from '../lib/colors.js';
import { useStopDetail } from '../hooks/useStopDetail.js';
import type { SeverityColor, Incident } from '@bss/shared';

interface StopDrawerProps {
  stopId: string | null;
  onClose: () => void;
}

function formatDate(iso: string | null) {
  if (!iso) return 'Unknown date';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function IncidentRow({ incident }: { incident: Incident }) {
  return (
    <li className="py-2.5 border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-500 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-slate-700 font-medium leading-snug">
            {incident.category ?? incident.incident_type}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="text-xs text-slate-500">{formatDate(incident.occurred_at)}</span>
            {incident.address && (
              <span className="text-xs text-slate-400 truncate">· {incident.address}</span>
            )}
          </div>
          <span className="inline-block mt-1 text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
            {incident.source}
          </span>
        </div>
      </div>
    </li>
  );
}

export function StopDrawer({ stopId, onClose }: StopDrawerProps) {
  const { data: stop, isLoading, isError } = useStopDetail(stopId);

  const isOpen = stopId !== null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="absolute inset-0 bg-black/10 z-20"
          onClick={onClose}
        />
      )}

      {/* Drawer panel */}
      <div
        className={cn(
          'absolute right-0 top-0 h-full w-96 bg-white shadow-2xl z-30 flex flex-col',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isLoading ? (
              <div className="h-5 w-40 bg-slate-200 rounded animate-pulse" />
            ) : (
              <h2 className="text-base font-bold text-slate-800 leading-snug truncate">
                {stop?.stop_name ?? `Stop ${stopId}`}
              </h2>
            )}
            {stop && (
              <div className="flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-500">
                  {stop.stop_lat.toFixed(5)}, {stop.stop_lon.toFixed(5)}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-sm text-slate-500 text-center">
              Could not load stop details. Check that the API is running.
            </p>
          </div>
        )}

        {/* Content */}
        {stop && !isLoading && (
          <div className="flex-1 overflow-y-auto">
            {/* Severity badge + incident counts */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={cn(
                    'px-2.5 py-1 rounded-full text-sm font-semibold border',
                    SEVERITY_BG[stop.severity_color as SeverityColor]
                  )}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                    style={{ backgroundColor: SEVERITY_HEX[stop.severity_color as SeverityColor] }}
                  />
                  {stop.severity_color}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-slate-800">
                    {stop.incident_count_total}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Total incidents</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-slate-800">
                    {stop.incident_count_last_12mo}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Last 12 months</p>
                </div>
              </div>
            </div>

            {/* Incident list */}
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Nearby Incidents
              </h3>
              {stop.incidents.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No incidents recorded within 50 m.</p>
              ) : (
                <ul>
                  {stop.incidents.map(inc => (
                    <IncidentRow key={`${inc.incident_id}-${inc.incident_type}`} incident={inc} />
                  ))}
                </ul>
              )}
            </div>

            {/* Related links */}
            {stop.links.length > 0 && (
              <div className="px-5 py-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Related Coverage
                </h3>
                <ul className="space-y-3">
                  {stop.links.map(link => (
                    <li key={link.url} className="group">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block p-3 rounded-xl border border-slate-200 hover:border-indigo-300
                                   hover:bg-indigo-50/50 transition"
                      >
                        <div className="flex items-start gap-2">
                          <ExternalLink className="w-3.5 h-3.5 mt-0.5 text-indigo-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 leading-snug
                                          group-hover:text-indigo-700 line-clamp-2">
                              {link.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {link.source && (
                                <span className="text-xs text-slate-400">{link.source}</span>
                              )}
                              {link.published_at && (
                                <span className="text-xs text-slate-400">
                                  · {formatDate(link.published_at)}
                                </span>
                              )}
                            </div>
                            {link.snippet && (
                              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                                {link.snippet}
                              </p>
                            )}
                          </div>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ID footer */}
        {stop && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-400">
              Stop ID: <span className="font-mono">{stop.stop_id}</span>
            </p>
          </div>
        )}
      </div>
    </>
  );
}
