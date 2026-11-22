import { AlertTriangle, Cpu, Droplets, Shield } from 'lucide-react';
import {
  CONCEPT_MODEL_BADGE,
  DESIGN_LASER_SPACING_LABEL,
  DRY_TOPSIDE_LABEL,
  ROV_3D_PARTS,
  Rov3DPartId,
} from '../lib/rovModelSpec';

interface Model3DFallbackProps {
  reason: string;
  selectedPartId: Rov3DPartId | null;
  onSelectPart: (id: Rov3DPartId) => void;
}

export function Model3DFallback({
  reason,
  selectedPartId,
  onSelectPart,
}: Model3DFallbackProps) {
  return (
    <div
      data-testid="webgl-fallback"
      className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1220] p-5 sm:p-6 space-y-5"
    >
      <div
        role="status"
        className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-400 dark:border-amber-700 bg-amber-100/90 dark:bg-amber-950/50 p-3.5 text-sm text-amber-950 dark:text-amber-200"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold">WebGL 3D Rendering Unavailable — Static Concept Schematic</p>
            <p className="text-xs mt-0.5">{reason}</p>
          </div>
        </div>
        <span className="font-mono text-xs font-semibold">{CONCEPT_MODEL_BADGE}</span>
      </div>

      {/* Crisp static 2D CAD schematic fallback */}
      <svg
        viewBox="0 0 760 360"
        className="w-full h-auto rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#070B12]"
        role="img"
        aria-label="Static concept schematic of Sea Lion free-flooding PVC ROV, 50 mm twin lasers, and dry topside unit."
      >
        {/* Dry Shore Unit */}
        <g>
          <rect
            x="24"
            y="44"
            width="176"
            height="108"
            rx="8"
            className="fill-amber-50 dark:fill-amber-950/30 stroke-amber-600 dark:stroke-amber-500"
            strokeWidth="1.5"
          />
          <text
            x="112"
            y="74"
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            className="fill-slate-900 dark:fill-slate-100"
          >
            Laptop + ESP32
          </text>
          <text
            x="112"
            y="96"
            textAnchor="middle"
            fontSize="10.5"
            fontFamily="JetBrains Mono, monospace"
            className="fill-amber-800 dark:fill-amber-300"
          >
            {DRY_TOPSIDE_LABEL}
          </text>
          <text
            x="112"
            y="124"
            textAnchor="middle"
            fontSize="10"
            className="fill-slate-600 dark:fill-slate-400"
          >
            ADC1 · PWM · USB
          </text>
        </g>

        {/* Tether */}
        <path
          d="M 200 112 C 250 112, 238 205, 290 205"
          fill="none"
          className="stroke-amber-600 dark:stroke-amber-400"
          strokeWidth="3.5"
        />
        <text
          x="245"
          y="186"
          textAnchor="middle"
          fontSize="10.5"
          fontFamily="JetBrains Mono, monospace"
          className="fill-slate-700 dark:fill-slate-300"
        >
          Wired Tether
        </text>

        {/* Free-flooding PVC Frame */}
        <rect
          x="290"
          y="130"
          width="240"
          height="145"
          rx="10"
          fill="none"
          className="stroke-slate-500 dark:stroke-slate-300"
          strokeWidth="8"
        />
        <text
          x="410"
          y="112"
          textAnchor="middle"
          fontSize="11.5"
          fontWeight="700"
          className="fill-slate-800 dark:fill-slate-200"
        >
          Free-Flooding 1/2-Inch PVC Frame (Open Ends &amp; Drain Holes)
        </text>

        {/* Thrusters */}
        <rect x="278" y="184" width="30" height="36" rx="4" className="fill-sky-700 dark:fill-cyan-500" />
        <rect x="386" y="114" width="48" height="24" rx="4" className="fill-sky-700 dark:fill-cyan-500" />
        <text x="410" y="205" textAnchor="middle" fontSize="11" className="fill-slate-700 dark:fill-slate-300">
          2 Horizontal + 1 Vertical Pump Thrusters
        </text>

        {/* Piezo + Pressure */}
        <circle cx="468" cy="275" r="8" className="fill-amber-500" />
        <text x="468" y="302" textAnchor="middle" fontSize="10" className="fill-slate-700 dark:fill-slate-300">
          Piezo (ADC1)
        </text>
        <rect x="330" y="122" width="24" height="14" rx="2" className="fill-slate-500" />
        <text x="342" y="152" textAnchor="middle" fontSize="10" className="fill-slate-700 dark:fill-slate-300">
          Pressure
        </text>

        {/* USB Camera + Twin Lasers */}
        <rect x="524" y="186" width="28" height="24" rx="3" className="fill-slate-800 dark:fill-slate-200" />
        <line x1="552" y1="176" x2="700" y2="176" stroke="#22c55e" strokeWidth="2" strokeDasharray="4 3" />
        <line x1="552" y1="220" x2="700" y2="220" stroke="#22c55e" strokeWidth="2" strokeDasharray="4 3" />
        <rect x="700" y="146" width="12" height="104" rx="2" className="fill-slate-500" />
        <circle cx="700" cy="176" r="4" fill="#4ade80" />
        <circle cx="700" cy="220" r="4" fill="#4ade80" />
        <text
          x="626"
          y="162"
          textAnchor="middle"
          fontSize="10.5"
          fontFamily="JetBrains Mono, monospace"
          className="fill-emerald-800 dark:fill-emerald-300"
        >
          {DESIGN_LASER_SPACING_LABEL}
        </text>
      </svg>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
        <span className="inline-flex items-center gap-1 font-medium">
          <Droplets className="h-3.5 w-3.5 text-sky-700 dark:text-cyan-400" aria-hidden="true" />
          Wet Free-Flooding / Epoxy-Sealed
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1 font-medium">
          <Cpu className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          {DRY_TOPSIDE_LABEL}
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1 font-medium">
          <Shield className="h-3.5 w-3.5" aria-hidden="true" />
          Shallow-water screening (~1 m)
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {ROV_3D_PARTS.map((part) => (
          <button
            key={part.id}
            type="button"
            onClick={() => onSelectPart(part.id)}
            className={`min-h-[44px] rounded-lg border px-2.5 py-2 text-xs font-medium text-left transition-colors cursor-pointer ${
              selectedPartId === part.id
                ? 'border-sky-700 bg-sky-50 text-sky-950 dark:border-cyan-400 dark:bg-cyan-950/50 dark:text-cyan-200 font-semibold'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] text-slate-800 dark:text-slate-200 hover:border-sky-600'
            }`}
          >
            {part.shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
