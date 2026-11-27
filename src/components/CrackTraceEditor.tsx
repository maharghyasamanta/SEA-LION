import { useCallback, useRef, useState } from 'react';
import { Info, RotateCcw, Undo2 } from 'lucide-react';
import { NormalizedPoint, ReferenceSample } from '../lib/sampleTraces';

interface CrackTraceEditorProps {
  imageUrl: string;
  trace: NormalizedPoint[];
  onTraceChange: (trace: NormalizedPoint[]) => void;
  referenceSample?: ReferenceSample;
  disabled?: boolean;
}

/**
 * Operator-guided crack trace editor.
 *
 * The user clicks points along the crack centreline. The points are stored in
 * normalized image coordinates and sent to the Lambda, which measures the dark
 * aperture along the polyline. This is intentionally human-in-the-loop: the
 * operator localises the crack, the computer vision measures it.
 */
export function CrackTraceEditor({
  imageUrl,
  trace,
  onTraceChange,
  referenceSample,
  disabled = false,
}: CrackTraceEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || !wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      onTraceChange([...trace, [Number(x.toFixed(4)), Number(y.toFixed(4))]]);
    },
    [disabled, onTraceChange, trace],
  );

  const points = trace.map(([x, y]) => `${x * 100},${y * 100}`).join(' ');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          Mark the crack centreline
        </p>
        <div className="flex items-center gap-1.5">
          {referenceSample && (
            <button
              type="button"
              onClick={() => onTraceChange(referenceSample.trace.map(([x, y]) => [x, y]))}
              disabled={disabled}
              className="min-h-[30px] rounded border border-sky-300 dark:border-cyan-800 bg-sky-50 dark:bg-cyan-950/40 px-2 py-1 text-[11px] font-semibold text-sky-900 dark:text-cyan-200 hover:bg-sky-100 dark:hover:bg-cyan-900/40 disabled:opacity-50 cursor-pointer"
            >
              Use reference trace
            </button>
          )}
          <button
            type="button"
            onClick={() => onTraceChange(trace.slice(0, -1))}
            disabled={disabled || trace.length === 0}
            className="inline-flex min-h-[30px] items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
          >
            <Undo2 className="h-3 w-3" /> Undo
          </button>
          <button
            type="button"
            onClick={() => onTraceChange([])}
            disabled={disabled || trace.length === 0}
            className="inline-flex min-h-[30px] items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-950 p-2">
        <div
          ref={wrapperRef}
          onClick={handleClick}
          className={`relative mx-auto block w-fit max-w-full ${
            disabled ? 'cursor-not-allowed opacity-70' : 'cursor-crosshair'
          }`}
          role="button"
          tabIndex={0}
          aria-label="Click along the crack centreline to add measurement points"
          onKeyDown={(event) => {
            if (event.key === 'Backspace') {
              event.preventDefault();
              onTraceChange(trace.slice(0, -1));
            }
          }}
        >
          <img
            src={imageUrl}
            alt="Crack measurement target"
            className="block max-h-[430px] w-auto max-w-full select-none"
            draggable={false}
            onLoad={() => setImageLoaded(true)}
          />
          {imageLoaded && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {trace.length > 1 && (
                <polyline
                  points={points}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {trace.map(([x, y], index) => (
                <circle
                  key={`${x}-${y}-${index}`}
                  cx={x * 100}
                  cy={y * 100}
                  r="0.9"
                  fill="#f97316"
                  stroke="#fff"
                  strokeWidth="0.2"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
        <span>
          {trace.length} point{trace.length === 1 ? '' : 's'} · click along the dark crack line
        </span>
        <span className="inline-flex items-center gap-1">
          <Info className="h-3 w-3" />
          {referenceSample ? (
            <span>
              Reference photo: {referenceSample.credit} · {referenceSample.license}
            </span>
          ) : (
            <span>Custom photo: mark at least two points before running.</span>
          )}
        </span>
      </div>
    </div>
  );
}
