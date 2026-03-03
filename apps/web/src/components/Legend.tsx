import { SEVERITY_HEX, SEVERITY_LABEL } from '../lib/colors.js';
import type { SeverityColor } from '@bss/shared';

const ENTRIES: { color: SeverityColor; label: string }[] = [
  { color: 'RED',    label: SEVERITY_LABEL.RED },
  { color: 'ORANGE', label: SEVERITY_LABEL.ORANGE },
  { color: 'YELLOW', label: SEVERITY_LABEL.YELLOW },
  { color: 'GREEN',  label: SEVERITY_LABEL.GREEN },
  { color: 'GRAY',   label: SEVERITY_LABEL.GRAY },
];

export function Legend() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Incident Legend
      </h3>
      <ul className="space-y-2">
        {ENTRIES.map(({ color, label }) => (
          <li key={color} className="flex items-center gap-2.5">
            <span
              className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white shadow-sm"
              style={{ backgroundColor: SEVERITY_HEX[color] }}
            />
            <span className="text-sm text-slate-600">{label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-400 leading-relaxed">
        Within 50 m of stop · all time
      </p>
    </div>
  );
}
