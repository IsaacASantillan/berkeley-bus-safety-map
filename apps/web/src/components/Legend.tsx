import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SEVERITY_HEX, SEVERITY_LABEL, COLLISION_SEVERITY_LEGEND } from '../lib/colorPalette.js';

const SEVERITIES = ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'GRAY'] as const;

export function Legend() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="absolute bottom-14 left-4 z-10 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100
                    w-64 text-xs overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
      >
        <span className="font-semibold text-slate-700">Map Legend</span>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-400" />
          : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-3">

          {/* Bus stop markers */}
          <section>
            <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-2">
              Bus Stops — collision density
            </p>
            <ul className="space-y-1.5">
              {SEVERITIES.map(sev => (
                <li key={sev} className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                    style={{ backgroundColor: SEVERITY_HEX[sev] }}
                  />
                  <span className="text-slate-600">{SEVERITY_LABEL[sev]}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Collision dots */}
          <section>
            <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-2">
              Collision Dots — injury severity
            </p>
            <ul className="space-y-1.5">
              {COLLISION_SEVERITY_LEGEND.map(item => (
                <li key={item.label} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-slate-600">{item.label}</span>
                </li>
              ))}
            </ul>
            <p className="text-slate-400 mt-1.5 leading-snug">
              Visible when a stop is selected. Dot color matches the severity badge in the panel.
            </p>
          </section>

        </div>
      )}
    </div>
  );
}

