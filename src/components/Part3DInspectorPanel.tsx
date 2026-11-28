import { Cable, Cloud, Cpu, Droplets, Shield, X } from 'lucide-react';
import { Rov3DPartSpec } from '../lib/rovModelSpec';

interface Part3DInspectorPanelProps {
  part: Rov3DPartSpec;
  onClose: () => void;
}

export function Part3DInspectorPanel({ part, onClose }: Part3DInspectorPanelProps) {
  const isDry = part.zone === 'dry-topside';
  const isFreeFlood = part.zone === 'wet-free-flooding';

  return (
    <aside
      aria-label={`3D Hardware Details: ${part.name}`}
      data-testid="model-3d-inspector-panel"
      className="rounded-xl border-2 border-sky-600 dark:border-cyan-400 bg-white dark:bg-[#0F1623] p-5 space-y-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="font-semibold text-amber-800 dark:text-amber-300">
              CONCEPT HARDWARE
            </span>
            <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
              ·
            </span>
            <span
              className={`inline-flex items-center gap-1 font-semibold ${
                isDry
                  ? 'text-amber-800 dark:text-amber-300'
                  : isFreeFlood
                    ? 'text-sky-800 dark:text-cyan-300'
                    : 'text-teal-800 dark:text-teal-300'
              }`}
            >
              {isDry ? (
                <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              ) : isFreeFlood ? (
                <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{part.zoneLabel}</span>
            </span>
          </div>

          <h2 className="text-lg font-bold text-slate-950 dark:text-slate-50 leading-snug">
            {part.name}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close 3D part inspector"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B12] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {part.summary}
      </p>

      <dl className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-3 text-sm">
        <div>
          <dt className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            <Cable className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Physical Connection</span>
          </dt>
          <dd className="mt-0.5 text-slate-950 dark:text-slate-100 font-medium">
            {part.connection}
          </dd>
        </div>

        <div>
          <dt className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
            <span>ESP32 Pin Group</span>
          </dt>
          <dd className="mt-0.5 font-mono text-xs sm:text-sm text-slate-950 dark:text-slate-100">
            {part.esp32PinGroup}
          </dd>
        </div>

        <div>
          <dt className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            <Cloud className="h-3.5 w-3.5 text-sky-700 dark:text-cyan-400" aria-hidden="true" />
            <span>AWS Pipeline Service</span>
          </dt>
          <dd className="mt-0.5 font-mono text-xs text-sky-900 dark:text-cyan-200">
            {part.awsService}
          </dd>
        </div>
      </dl>

      <p className="border-t border-slate-200 dark:border-slate-800 pt-3 text-xs text-slate-600 dark:text-slate-400">
        Tap elsewhere or press Esc to close · Shallow-water screening (~1 m).
      </p>
    </aside>
  );
}
