import { AlertTriangle, CheckCircle2, OctagonAlert } from 'lucide-react';
import { SeverityLevel } from '../lib/crackAnalysis';

interface SeverityBadgeProps {
  severity: SeverityLevel;
  size?: 'sm' | 'md';
}

export function SeverityBadge({ severity, size = 'md' }: SeverityBadgeProps) {
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs sm:text-sm';

  if (severity === 'Minor') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded font-semibold border whitespace-nowrap shrink-0 bg-emerald-100 text-emerald-900 border-emerald-400 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700 ${padding}`}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Minor</span>
      </span>
    );
  }

  if (severity === 'Moderate') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded font-semibold border whitespace-nowrap shrink-0 bg-amber-100 text-amber-950 border-amber-500 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700 ${padding}`}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Moderate</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded font-semibold border whitespace-nowrap shrink-0 bg-rose-100 text-rose-950 border-rose-500 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700 ${padding}`}
    >
      <OctagonAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Critical</span>
    </span>
  );
}
