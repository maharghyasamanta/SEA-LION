import { Activity, AlertTriangle, Cloud, OctagonAlert, X } from 'lucide-react';
import { PartInspectionDetails, PartStatus } from '../lib/partInspector';
import { SeverityBadge } from './SeverityBadge';

interface PartInspectorPanelProps {
  details: PartInspectionDetails;
  onClose: () => void;
}

function StatusBadge({ status }: { status: PartStatus }) {
  if (status === 'Alert') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold border border-rose-500 bg-rose-100 text-rose-950 dark:border-rose-700 dark:bg-rose-950/70 dark:text-rose-200 whitespace-nowrap shrink-0">
        <OctagonAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Alert</span>
      </span>
    );
  }
  if (status === 'Active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold border border-sky-500 bg-sky-100 text-sky-950 dark:border-cyan-700 dark:bg-cyan-950/70 dark:text-cyan-200 whitespace-nowrap shrink-0">
        <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Active</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold border border-slate-400 bg-slate-200 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
      <span>Idle</span>
    </span>
  );
}

export function PartInspectorPanel({ details, onClose }: PartInspectorPanelProps) {
  return (
    <aside
      aria-label={`Part Inspector: ${details.name}`}
      data-testid="part-inspector-panel"
      data-part-id={details.id}
      onClick={(e) => e.stopPropagation()}
      className="rounded-xl border-2 border-sky-700 dark:border-cyan-500 bg-white dark:bg-[#0B1220] p-5 space-y-4"
    >
      {/* Header row with SIMULATED tag, status, and 44px Close button */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-bold tracking-wide text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 border border-amber-500 dark:border-amber-600 px-2 py-0.5 rounded">
              SIMULATED
            </span>
            <StatusBadge status={details.status} />
            {details.severity && <SeverityBadge severity={details.severity} size="sm" />}
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-950 dark:text-slate-50 leading-snug">
            {details.name}
          </h3>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close part inspector"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-[#0F1623] text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Plain-sentence explanation */}
      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {details.summary}
      </p>

      {/* Live SIMULATED readings */}
      <dl className="grid grid-cols-2 gap-3 border-y border-slate-200 dark:border-slate-800 py-3">
        {details.readings.map((row) => (
          <div key={row.label} className={row.value.length > 22 ? 'col-span-2' : ''}>
            <dt className="text-xs font-medium text-slate-600 dark:text-slate-400">{row.label}</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-sm font-semibold text-slate-950 dark:text-slate-100">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {details.note && (
        <p className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] px-3 py-2 text-xs sm:text-sm text-slate-800 dark:text-slate-200">
          {details.note}
        </p>
      )}

      {/* Real AWS Service Target */}
      <div className="flex items-start gap-2 text-xs sm:text-sm text-slate-800 dark:text-slate-200">
        <Cloud className="h-4 w-4 text-sky-700 dark:text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <span className="font-semibold">AWS Pipeline Target: </span>
          <span className="font-mono text-xs">{details.awsService}</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-600 dark:text-slate-400">
        Tap elsewhere or press Esc to close · Never saved to History or DB.
      </p>
    </aside>
  );
}
