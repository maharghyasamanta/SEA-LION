import { DamCrack, RovState, SeverityThresholds, classifySeverity } from '../lib/crackAnalysis';

interface DamSceneSvgProps {
  rov: RovState;
  cracks: readonly DamCrack[];
  straddledCrack: DamCrack | null;
  acousticScore: number;
  thresholds: SeverityThresholds;
  isMoving: boolean;
  prefersReducedMotion: boolean;
  onSelectCrack?: (crack: DamCrack) => void;
}

// SVG Coordinate mapping for 920 x 560 cross-section
const WATER_LEFT = 86;
const WALL_FACE_X = 690;
const WATER_SURFACE_Y = 148;
const SILT_BED_Y = 492;
const DEPTH_SPAN_PX = SILT_BED_Y - WATER_SURFACE_Y; // 344 px = 1.00 m

function xMToSvgX(xM: number): number {
  return WATER_LEFT + xM * (WALL_FACE_X - WATER_LEFT);
}

function depthMToSvgY(depthM: number): number {
  return WATER_SURFACE_Y + depthM * DEPTH_SPAN_PX;
}

export function DamSceneSvg({
  rov,
  cracks,
  straddledCrack,
  acousticScore,
  thresholds,
  isMoving,
  prefersReducedMotion,
  onSelectCrack,
}: DamSceneSvgProps) {
  const rovX = xMToSvgX(rov.xM);
  const rovY = depthMToSvgY(rov.depthM);

  // ROV geometry offsets relative to center
  const noseX = rovX + 34;
  const laserPodY = rovY - 12;
  const tetherAttachX = rovX - 36;
  const tetherAttachY = rovY - 4;

  // 50 mm laser dots vertical separation in SVG scene (represents 50 mm bracket on wall)
  const laserHalfGapPx = 12;
  const topDotY = rovY - laserHalfGapPx;
  const botDotY = rovY + laserHalfGapPx;

  // Camera view-cone expands with distance to wall
  const distToWall = Math.max(24, WALL_FACE_X - noseX);
  const coneHalfHeight = Math.min(82, Math.max(28, distToWall * 0.25));

  // Shore unit (Laptop + ESP32) anchor positioned cleanly below the top honesty badge
  const shoreUnitX = 144;
  const shoreUnitY = 82;

  // Dynamic slack tether path from Shore Unit into water to ROV
  const entryX = Math.max(shoreUnitX + 46, Math.min(WALL_FACE_X - 80, (shoreUnitX + tetherAttachX) * 0.48));
  const sagY = Math.min(SILT_BED_Y - 14, Math.max(rovY + 34, WATER_SURFACE_Y + 86));
  const tetherPath = `M ${shoreUnitX + 46} ${shoreUnitY + 14} C ${entryX - 10} ${WATER_SURFACE_Y + 14}, ${tetherAttachX - 105} ${sagY}, ${tetherAttachX} ${tetherAttachY}`;

  const depthTicks = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const minorTicks = [0.1, 0.3, 0.5, 0.7, 0.9];

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1220]">
      <svg
        viewBox="0 0 920 560"
        className="block w-full h-auto select-none"
        role="img"
        aria-label={`Interactive simulation cross-section of Demo Dam. ROV at ${rov.depthM.toFixed(2)} meters depth.`}
        data-testid="dam-scene-svg"
        data-depth={rov.depthM.toFixed(2)}
        data-straddled-crack={straddledCrack?.id ?? 'none'}
      >
        <defs>
          <linearGradient id="waterColGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.22" />
            <stop offset="55%" stopColor="#0284C7" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#0F172A" stopOpacity="0.56" />
          </linearGradient>

          <linearGradient id="wallConcreteGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#64748B" stopOpacity="0.38" />
            <stop offset="25%" stopColor="#475569" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#334155" stopOpacity="0.72" />
          </linearGradient>

          <linearGradient id="viewConeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.06" />
          </linearGradient>

          <linearGradient id="siltGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#78716C" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#44403C" stopOpacity="0.88" />
          </linearGradient>

          <clipPath id="waterClip">
            <rect x={WATER_LEFT} y={WATER_SURFACE_Y} width={WALL_FACE_X - WATER_LEFT} height={DEPTH_SPAN_PX} />
          </clipPath>
        </defs>

        {/* Sky / Air Backdrop above surface */}
        <rect
          x="0"
          y="0"
          width="920"
          height={WATER_SURFACE_Y}
          className="fill-slate-100 dark:fill-[#0F172A]"
        />

        {/* Left Margin Scale Panel */}
        <rect
          x="0"
          y={WATER_SURFACE_Y}
          width={WATER_LEFT}
          height="432"
          className="fill-slate-200/80 dark:fill-[#0B1220]"
        />

        {/* Reservoir Water Body */}
        <rect
          x={WATER_LEFT}
          y={WATER_SURFACE_Y}
          width={WALL_FACE_X - WATER_LEFT}
          height={DEPTH_SPAN_PX}
          fill="url(#waterColGrad)"
        />

        {/* Subtle horizontal depth guide lines */}
        {depthTicks.map((d) => {
          const y = depthMToSvgY(d);
          return (
            <line
              key={`guide-${d}`}
              x1={WATER_LEFT}
              y1={y}
              x2={WALL_FACE_X}
              y2={y}
              className="stroke-sky-700/15 dark:stroke-cyan-300/10"
              strokeDasharray="4 6"
              strokeWidth="1"
            />
          );
        })}

        {/* Shore Platform on Top-Left */}
        <path
          d={`M 0 ${WATER_SURFACE_Y - 14} L 236 ${WATER_SURFACE_Y - 14} L 214 ${WATER_SURFACE_Y + 4} L 0 ${WATER_SURFACE_Y + 4} Z`}
          className="fill-slate-300 dark:fill-slate-800 stroke-slate-400 dark:stroke-slate-700"
          strokeWidth="1.5"
        />
        <text
          x="14"
          y={WATER_SURFACE_Y - 22}
          fontSize="12"
          fontWeight="600"
          className="fill-slate-800 dark:fill-slate-200"
        >
          Shore Deck
        </text>

        {/* Shore Unit: Laptop + ESP32 Icon */}
        <g transform={`translate(${shoreUnitX - 38}, ${shoreUnitY - 4})`}>
          {/* Laptop screen */}
          <rect
            x="0"
            y="0"
            width="42"
            height="28"
            rx="3"
            className="fill-slate-900 dark:fill-slate-950 stroke-slate-500 dark:stroke-cyan-500/70"
            strokeWidth="1.5"
          />
          <rect x="4" y="4" width="34" height="19" rx="1.5" className="fill-cyan-500/20" />
          <path d="M 8 15 L 15 11 L 22 16 L 31 8" fill="none" stroke="#22D3EE" strokeWidth="1.5" />
          {/* Laptop base */}
          <path d="M -5 29 L 47 29 L 51 35 L -9 35 Z" className="fill-slate-500 dark:fill-slate-600" />
          {/* ESP32 Board next to laptop */}
          <rect
            x="56"
            y="8"
            width="28"
            height="24"
            rx="2.5"
            className="fill-emerald-900 dark:fill-emerald-950 stroke-emerald-500"
            strokeWidth="1.4"
          />
          <rect x="63" y="13" width="12" height="11" rx="1" className="fill-slate-800 stroke-slate-400" strokeWidth="0.8" />
          <circle cx="80" cy="13" r="2" className="fill-amber-400" />
          <text
            x="94"
            y="24"
            textAnchor="start"
            fontSize="12"
            fontWeight="600"
            className="fill-slate-900 dark:fill-slate-100"
          >
            Laptop + ESP32
          </text>
        </g>

        {/* Animated Surface Level Wave */}
        <g clipPath="url(#waterClip)">
          <path
            d={`M ${WATER_LEFT} ${WATER_SURFACE_Y + 3} Q ${WATER_LEFT + 150} ${WATER_SURFACE_Y - 3}, ${WATER_LEFT + 305} ${WATER_SURFACE_Y + 3} T ${WALL_FACE_X} ${WATER_SURFACE_Y + 3}`}
            fill="none"
            className="stroke-sky-600 dark:stroke-cyan-400"
            strokeWidth="2.5"
          >
            {!prefersReducedMotion && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0; -16,0; 0,0"
                dur="4.5s"
                repeatCount="indefinite"
              />
            )}
          </path>
        </g>

        {/* Surface Level Line & Label (placed cleanly right of tether/shore unit) */}
        <line
          x1={WATER_LEFT}
          y1={WATER_SURFACE_Y}
          x2={WALL_FACE_X}
          y2={WATER_SURFACE_Y}
          className="stroke-sky-700 dark:stroke-cyan-400"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        <text
          x={WALL_FACE_X - 16}
          y={WATER_SURFACE_Y - 10}
          textAnchor="end"
          fontSize="12.5"
          fontWeight="600"
          className="fill-sky-900 dark:fill-cyan-300"
        >
          Surface Level (0.00 m datum)
        </text>

        {/* Silt Bed at Bottom (1.00 m) */}
        <path
          d={`M ${WATER_LEFT} ${SILT_BED_Y} Q 210 ${SILT_BED_Y - 7}, 340 ${SILT_BED_Y + 2} T 590 ${SILT_BED_Y - 3} L ${WALL_FACE_X} ${SILT_BED_Y} L ${WALL_FACE_X} 560 L ${WATER_LEFT} 560 Z`}
          fill="url(#siltGrad)"
          className="stroke-stone-500 dark:stroke-stone-600"
          strokeWidth="1.5"
        />
        <text
          x="390"
          y={SILT_BED_Y + 32}
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          className="fill-stone-900 dark:fill-stone-200"
        >
          Silt Bed (1.00 m Floor)
        </text>

        {/* Depth Scale Ruler (0 - 1.0 m) on Left */}
        <line
          x1={WATER_LEFT}
          y1={WATER_SURFACE_Y}
          x2={WATER_LEFT}
          y2={SILT_BED_Y}
          className="stroke-slate-600 dark:stroke-slate-400"
          strokeWidth="2"
        />
        {minorTicks.map((d) => {
          const y = depthMToSvgY(d);
          return (
            <line
              key={`minor-${d}`}
              x1={WATER_LEFT - 6}
              y1={y}
              x2={WATER_LEFT}
              y2={y}
              className="stroke-slate-500 dark:stroke-slate-500"
              strokeWidth="1.2"
            />
          );
        })}
        {depthTicks.map((d) => {
          const y = depthMToSvgY(d);
          return (
            <g key={`major-${d}`}>
              <line
                x1={WATER_LEFT - 12}
                y1={y}
                x2={WATER_LEFT}
                y2={y}
                className="stroke-slate-800 dark:stroke-slate-200"
                strokeWidth="2"
              />
              <text
                x={WATER_LEFT - 16}
                y={y + 4}
                textAnchor="end"
                fontSize="12.5"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600"
                className="fill-slate-800 dark:fill-slate-200"
              >
                {d.toFixed(1)} m
              </text>
            </g>
          );
        })}

        {/* Concrete Dam Wall (Right) */}
        <path
          d={`M ${WALL_FACE_X} 54 L 835 54 L 835 190 L 880 390 L 920 560 L ${WALL_FACE_X} 560 Z`}
          fill="url(#wallConcreteGrad)"
          className="stroke-slate-500 dark:stroke-slate-600"
          strokeWidth="2"
        />
        {/* Concrete Wall Construction Lift Joints */}
        {[170, 278, 386].map((jy) => (
          <line
            key={`joint-${jy}`}
            x1={WALL_FACE_X + 2}
            y1={jy}
            x2={jy > 300 ? 870 : 834}
            y2={jy}
            className="stroke-slate-500/35 dark:stroke-slate-400/20"
            strokeWidth="1"
            strokeDasharray="8 6"
          />
        ))}
        <text
          x={WALL_FACE_X + 18}
          y="88"
          fontSize="15"
          fontWeight="700"
          className="fill-slate-900 dark:fill-slate-100"
        >
          Demo Dam
        </text>
        <text
          x={WALL_FACE_X + 18}
          y="108"
          fontSize="12"
          fontWeight="500"
          className="fill-slate-700 dark:fill-slate-300"
        >
          Concrete Wall
        </text>

        {/* 4 Pre-Placed Cracks on Concrete Wall */}
        {cracks.map((crack) => {
          const cy = depthMToSvgY(crack.depthM);
          const isStraddled = straddledCrack?.id === crack.id;
          const severity = classifySeverity(crack.trueWidthMm, thresholds);
          const crackStroke =
            severity === 'Critical'
              ? '#F43F5E'
              : severity === 'Moderate'
                ? '#F59E0B'
                : '#10B981';
          const crackWidthStroke = Math.max(2, Math.min(6, crack.trueWidthMm * 2.8));

          return (
            <g
              key={crack.id}
              onClick={() => onSelectCrack?.(crack)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`Crack ${crack.id} at ${crack.depthM.toFixed(2)} meters depth, ${crack.trueWidthMm.toFixed(1)} millimeters, ${severity}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectCrack?.(crack);
                }
              }}
            >
              {/* Subtle hit target around crack */}
              <rect
                x={WALL_FACE_X - 8}
                y={cy - 18}
                width="144"
                height="36"
                rx="4"
                fill="transparent"
              />

              {/* Highlight halo when laser dots straddle this crack */}
              {isStraddled && (
                <rect
                  x={WALL_FACE_X - 4}
                  y={cy - 15}
                  width="64"
                  height="30"
                  rx="4"
                  className="fill-cyan-500/15 stroke-cyan-400"
                  strokeWidth="1.5"
                />
              )}

              {/* Crack fissure geometry penetrating into concrete */}
              <path
                d={`M ${WALL_FACE_X} ${cy} L ${WALL_FACE_X + 18} ${cy - 4} L ${WALL_FACE_X + 34} ${cy + 5} L ${WALL_FACE_X + 54} ${cy - 1}`}
                fill="none"
                stroke={crackStroke}
                strokeWidth={crackWidthStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Leak Acoustic Ripples & Seepage Plume for leaking crack */}
              {crack.hasLeak && (
                <g clipPath="url(#waterClip)">
                  {[16, 32, 48].map((r, idx) => (
                    <path
                      key={`wave-${r}`}
                      d={`M ${WALL_FACE_X - r * 0.25} ${cy - r} A ${r} ${r} 0 0 0 ${WALL_FACE_X - r * 0.25} ${cy + r}`}
                      fill="none"
                      stroke="#38BDF8"
                      strokeWidth="1.6"
                      strokeOpacity={0.7 - idx * 0.18}
                      strokeDasharray="4 3"
                    >
                      {!prefersReducedMotion && (
                        <animate
                          attributeName="stroke-opacity"
                          values="0.85;0.15;0.85"
                          dur={`${1.4 + idx * 0.35}s`}
                          repeatCount="indefinite"
                        />
                      )}
                    </path>
                  ))}
                </g>
              )}

              {/* Engineering Label on Wall with crisp light/dark contrast */}
              <rect
                x={WALL_FACE_X + 58}
                y={cy - 15}
                width="144"
                height="34"
                rx="4"
                className="fill-white/85 dark:fill-slate-950/75"
              />
              <text
                x={WALL_FACE_X + 64}
                y={cy - 1}
                fontSize="12"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
                className="fill-slate-950 dark:fill-slate-100"
              >
                {crack.id} · {crack.trueWidthMm.toFixed(1)} mm
              </text>
              <text
                x={WALL_FACE_X + 64}
                y={cy + 14}
                fontSize="11.5"
                fontWeight="700"
                className={
                  severity === 'Critical'
                    ? 'fill-rose-700 dark:fill-rose-300'
                    : severity === 'Moderate'
                      ? 'fill-amber-800 dark:fill-amber-300'
                      : 'fill-emerald-800 dark:fill-emerald-300'
                }
              >
                {severity}
                {crack.hasLeak ? ' · Leak' : ''}
              </text>
            </g>
          );
        })}

        {/* Tether Cable from Shore Unit to ROV */}
        <path
          d={tetherPath}
          fill="none"
          className="stroke-amber-600 dark:stroke-amber-400"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Camera View-Cone projecting from ROV lens to concrete wall */}
        <polygon
          points={`${noseX},${rovY} ${WALL_FACE_X},${rovY - coneHalfHeight} ${WALL_FACE_X},${rovY + coneHalfHeight}`}
          fill="url(#viewConeGrad)"
          className="stroke-cyan-500/40 dark:stroke-cyan-400/35"
          strokeWidth="1"
        />

        {/* Twin 50 mm Laser Beams & Dots projected onto Wall */}
        <g>
          <line
            x1={noseX - 6}
            y1={laserPodY}
            x2={WALL_FACE_X}
            y2={topDotY}
            stroke="#22C55E"
            strokeWidth="1.2"
            strokeOpacity="0.8"
            strokeDasharray="5 3"
          />
          <line
            x1={noseX - 6}
            y1={laserPodY + 4}
            x2={WALL_FACE_X}
            y2={botDotY}
            stroke="#22C55E"
            strokeWidth="1.2"
            strokeOpacity="0.8"
            strokeDasharray="5 3"
          />
          {/* Projected 50 mm Dots on wall face */}
          <circle cx={WALL_FACE_X} cy={topDotY} r="4.5" fill="#4ADE80" stroke="#052E16" strokeWidth="1" />
          <circle cx={WALL_FACE_X} cy={botDotY} r="4.5" fill="#4ADE80" stroke="#052E16" strokeWidth="1" />

          {/* 50 mm Bracket indicator between laser dots */}
          <path
            d={`M ${WALL_FACE_X - 10} ${topDotY} L ${WALL_FACE_X - 15} ${topDotY} L ${WALL_FACE_X - 15} ${botDotY} L ${WALL_FACE_X - 10} ${botDotY}`}
            fill="none"
            stroke="#4ADE80"
            strokeWidth="1.2"
          />
          <text
            x={WALL_FACE_X - 20}
            y={rovY + 4}
            textAnchor="end"
            fontSize="11"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="700"
            className="fill-emerald-800 dark:fill-emerald-300"
          >
            50 mm
          </text>
        </g>

        {/* Sea Lion ROV Craft */}
        <g transform={`translate(${rovX}, ${rovY})`}>
          {/* Aft thruster wash when moving */}
          {isMoving && !prefersReducedMotion && (
            <g opacity="0.65">
              <circle cx="-46" cy="-4" r="3" fill="#BAE6FD">
                <animate attributeName="cx" values="-44;-62" dur="0.7s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0" dur="0.7s" repeatCount="indefinite" />
              </circle>
              <circle cx="-46" cy="5" r="2.2" fill="#BAE6FD">
                <animate attributeName="cx" values="-44;-58" dur="0.55s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0" dur="0.55s" repeatCount="indefinite" />
              </circle>
            </g>
          )}

          {/* Lower Skid Frame & Hydrophone */}
          <path
            d="M -28 16 L 26 16 M -20 11 L -20 16 M 18 11 L 18 16"
            className="stroke-slate-700 dark:stroke-slate-300"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="8" cy="19" r="3.5" fill={acousticScore >= 55 ? '#F43F5E' : '#38BDF8'} />

          {/* Main Syntactic Foam Buoyancy Hull */}
          <rect
            x="-32"
            y="-14"
            width="58"
            height="24"
            rx="7"
            fill="#F59E0B"
            stroke="#92400E"
            strokeWidth="1.8"
          />
          {/* Top 50 mm Laser Pod */}
          <rect x="6" y="-20" width="18" height="7" rx="2" className="fill-slate-800 stroke-slate-600" strokeWidth="1" />
          <circle cx="24" cy="-16.5" r="2" fill="#4ADE80" />

          {/* Rear Thruster Shroud */}
          <rect x="-40" y="-9" width="9" height="16" rx="2" className="fill-slate-800 stroke-slate-500" strokeWidth="1.2" />

          {/* Front Acrylic Camera Dome */}
          <path
            d="M 26 -9 A 10 10 0 0 1 26 9 Z"
            fill="#0EA5E9"
            fillOpacity="0.85"
            stroke="#E0F2FE"
            strokeWidth="1.5"
          />
          <circle cx="29" cy="0" r="3" fill="#0F172A" />

          {/* Hull Label */}
          <text
            x="-4"
            y="2"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="#0F172A"
          >
            SEA LION
          </text>
        </g>

        {/* Live Depth Callout Pill inside Water Column */}
        <g transform={`translate(${WATER_LEFT + 14}, ${SILT_BED_Y - 36})`}>
          <rect
            x="0"
            y="0"
            width="214"
            height="26"
            rx="5"
            className="fill-white/90 dark:fill-slate-950/90 stroke-slate-300 dark:stroke-slate-700"
            strokeWidth="1"
          />
          <text
            x="10"
            y="17"
            fontSize="12"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="700"
            className="fill-slate-900 dark:fill-cyan-300"
          >
            SIMULATED DEPTH: {rov.depthM.toFixed(2)} m
          </text>
        </g>

        {/* PERMANENT HONESTY BADGE ON THE SCENE (included in any screenshot or Print/PDF) */}
        <g transform="translate(14, 12)">
          <rect
            x="0"
            y="0"
            width="430"
            height="32"
            rx="6"
            className="fill-amber-100 dark:fill-amber-950 stroke-amber-600 dark:stroke-amber-500"
            strokeWidth="1.5"
          />
          <text
            x="14"
            y="20.5"
            fontSize="12.5"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="700"
            className="fill-amber-950 dark:fill-amber-200"
          >
            SIMULATION — fictional dam, not real measurements
          </text>
        </g>
      </svg>
    </div>
  );
}
