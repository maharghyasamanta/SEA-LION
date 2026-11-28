import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Camera,
  Cpu,
  Droplets,
  Fan,
  Info,
  Layers,
  RotateCcw,
  RotateCw,
  Shield,
} from 'lucide-react';
import {
  CAMERA_PRESETS,
  CONCEPT_MODEL_BADGE,
  CameraPresetId,
  DESIGN_LASER_SPACING_LABEL,
  DRY_TOPSIDE_LABEL,
  ROV_3D_PARTS,
  Rov3DPartId,
  ThrusterTestTelemetry,
  computeThrusterTestTelemetry,
  getCameraPresetById,
  getPartSpecById,
} from '../lib/rovModelSpec';
import { RovSceneBuildResult, buildRovThreeScene } from '../lib/rovThreeScene';
import { Model3DFallback } from './Model3DFallback';
import { Part3DInspectorPanel } from './Part3DInspectorPanel';

interface Model3DTabProps {
  darkMode: boolean;
}

const _goalPos = new THREE.Vector3();
const _goalTarget = new THREE.Vector3();
const _targetWorldPos = new THREE.Vector3();

function detectSoftwareWebGl(): { supported: boolean; isSoftwareGl: boolean; reason?: string } {
  if (typeof document === 'undefined') {
    return { supported: false, isSoftwareGl: true, reason: 'Document environment unavailable.' };
  }
  const canvas = document.createElement('canvas');
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
  } catch {
    gl = null;
  }
  if (!gl) {
    return {
      supported: false,
      isSoftwareGl: true,
      reason: 'Browser or hardware acceleration disabled WebGL context creation.',
    };
  }
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const rendererName = String(gl.getParameter(param) ?? '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererName);
  return { supported: true, isSoftwareGl };
}

export default function Model3DTab({ darkMode }: Model3DTabProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [webglUnavailableReason, setWebglUnavailableReason] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<Rov3DPartId | null>(null);
  const [hoveredPartId, setHoveredPartId] = useState<Rov3DPartId | null>(null);
  const [explodePct, setExplodePct] = useState<number>(0);
  const [dryWetMode, setDryWetMode] = useState<boolean>(false);
  const [thrusterTestActive, setThrusterTestActive] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<CameraPresetId>('iso');
  const [pwmTelemetry, setPwmTelemetry] = useState<ThrusterTestTelemetry>(() =>
    computeThrusterTestTelemetry(0, false),
  );

  // Mutable refs for live render loop without tearing down WebGL on React state updates
  const darkModeRef = useRef(darkMode);
  const reducedMotionRef = useRef(prefersReducedMotion);
  const selectedIdRef = useRef<Rov3DPartId | null>(selectedPartId);
  const hoveredIdRef = useRef<Rov3DPartId | null>(hoveredPartId);
  const explodeTargetRef = useRef<number>(explodePct / 100);
  const dryWetRef = useRef<boolean>(dryWetMode);
  const thrusterTestRef = useRef<boolean>(thrusterTestActive);
  const autoRotateRef = useRef<boolean>(autoRotate);
  const presetGoalRef = useRef<{
    position: [number, number, number];
    target: [number, number, number];
  } | null>(null);
  const requestRenderFnRef = useRef<(() => void) | null>(null);
  const sceneBuildRef = useRef<RovSceneBuildResult | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Reduced motion media query watcher (also forces auto-rotate off)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      setPrefersReducedMotion(mq.matches);
      reducedMotionRef.current = mq.matches;
      if (mq.matches) {
        setAutoRotate(false);
        autoRotateRef.current = false;
      }
    };
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  // Escape closes pinned hardware panel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPartId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Sync theme changes live into Three.js scene
  useEffect(() => {
    darkModeRef.current = darkMode;
    sceneBuildRef.current?.applyTheme(darkMode);
    requestRenderFnRef.current?.();
  }, [darkMode]);

  // Sync visual highlights & dry/wet zone tinting
  useEffect(() => {
    selectedIdRef.current = selectedPartId;
    hoveredIdRef.current = hoveredPartId;
    dryWetRef.current = dryWetMode;
    sceneBuildRef.current?.updateVisualStates({
      hoveredId: hoveredPartId,
      selectedId: selectedPartId,
      dryWetMode,
    });
    requestRenderFnRef.current?.();
  }, [selectedPartId, hoveredPartId, dryWetMode]);

  // Sync explode target
  useEffect(() => {
    explodeTargetRef.current = explodePct / 100;
    requestRenderFnRef.current?.();
  }, [explodePct]);

  // Sync auto-rotate (always off when prefers-reduced-motion is set)
  useEffect(() => {
    const effective = prefersReducedMotion ? false : autoRotate;
    autoRotateRef.current = effective;
    if (controlsRef.current) {
      controlsRef.current.autoRotate = effective;
    }
    requestRenderFnRef.current?.();
  }, [autoRotate, prefersReducedMotion]);

  // Sync thruster test + update simulated PWM UI telemetry at ~4 Hz while active
  useEffect(() => {
    thrusterTestRef.current = thrusterTestActive;
    if (!thrusterTestActive) {
      setPwmTelemetry(computeThrusterTestTelemetry(0, false));
      requestRenderFnRef.current?.();
      return;
    }
    const started = performance.now();
    setPwmTelemetry(computeThrusterTestTelemetry(0.1, true));
    requestRenderFnRef.current?.();
    const intervalId = window.setInterval(() => {
      const elapsedSec = (performance.now() - started) / 1000;
      setPwmTelemetry(computeThrusterTestTelemetry(elapsedSec, true));
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [thrusterTestActive]);

  // Mount Three.js scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const probe = detectSoftwareWebGl();
    if (!probe.supported) {
      setWebglUnavailableReason(probe.reason ?? 'WebGL unavailable.');
      return;
    }

    const { isSoftwareGl } = probe;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailableReason('Could not initialize WebGLRenderer context.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(280, container.clientWidth);
    const height = Math.max(320, container.clientHeight);
    renderer.setSize(width, height, false);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D Canvas of Sea Lion ROV');
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
    const initialPreset = getCameraPresetById('iso');
    camera.position.set(...initialPreset.position);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.minDistance = 1.8;
    controls.maxDistance = 14.0;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.autoRotateSpeed = 1.4;
    controls.target.set(...initialPreset.target);
    controls.update();
    controlsRef.current = controls;

    const sceneBuild = buildRovThreeScene({
      scene,
      isSoftwareGl,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      initialDark: darkModeRef.current,
    });
    sceneBuildRef.current = sceneBuild;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // State inside render loop (zero per-frame allocations)
    let disposed = false;
    let contextLost = false;
    let rafId = 0;       // requestAnimationFrame ID — cancelled with cancelAnimationFrame
    let timeoutId = 0;   // setTimeout ID       — cancelled with clearTimeout
    let renderBusy = false;
    let renderDirty = false;
    let explodeCurrent = explodeTargetRef.current;
    let lastTimestamp = performance.now();
    let thrusterStartedAt = performance.now();
    let wasThrusterActive = thrusterTestRef.current;

    const cancelManualGoal = () => {
      presetGoalRef.current = null;
    };
    controls.addEventListener('start', cancelManualGoal);
    controls.addEventListener('change', () => {
      requestRender();
    });

    function afterDraw(cb: () => void) {
      if (disposed || contextLost) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed || contextLost) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            timeoutId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            timeoutId = window.setTimeout(cb, 80);
          }
        };
        timeoutId = window.setTimeout(poll, 5);
      } else {
        timeoutId = window.setTimeout(cb, 80);
      }
    }

    function stepFrame(now: number): boolean {
      const dt = Math.min(0.1, Math.max(0.001, (now - lastTimestamp) / 1000));
      lastTimestamp = now;

      let needsNextFrame = false;

      // 1. Exploded View smooth exponential damping
      const explodeTarget = explodeTargetRef.current;
      if (Math.abs(explodeTarget - explodeCurrent) > 0.001) {
        explodeCurrent = reducedMotionRef.current
          ? explodeTarget
          : THREE.MathUtils.damp(explodeCurrent, explodeTarget, 9.5, dt);
        if (Math.abs(explodeTarget - explodeCurrent) <= 0.001) {
          explodeCurrent = explodeTarget;
        } else {
          needsNextFrame = true;
        }
      }

      sceneBuild.parts.forEach((part) => {
        _targetWorldPos
          .copy(part.basePosition)
          .addScaledVector(part.explodeOffset, explodeCurrent);
        part.group.position.copy(_targetWorldPos);
      });

      // 2. Camera preset smooth glide
      const goal = presetGoalRef.current;
      if (goal) {
        _goalPos.set(...goal.position);
        _goalTarget.set(...goal.target);
        if (reducedMotionRef.current) {
          camera.position.copy(_goalPos);
          controls.target.copy(_goalTarget);
          presetGoalRef.current = null;
        } else {
          const alpha = 1 - Math.exp(-7.5 * dt);
          camera.position.lerp(_goalPos, alpha);
          controls.target.lerp(_goalTarget, alpha);
          if (
            camera.position.distanceToSquared(_goalPos) < 0.0005 &&
            controls.target.distanceToSquared(_goalTarget) < 0.0005
          ) {
            camera.position.copy(_goalPos);
            controls.target.copy(_goalTarget);
            presetGoalRef.current = null;
          } else {
            needsNextFrame = true;
          }
        }
      }

      // 3. Thruster rotor spinning (disabled rotation when prefers-reduced-motion is set)
      if (thrusterTestRef.current) {
        if (!wasThrusterActive) {
          thrusterStartedAt = now;
        }
        wasThrusterActive = true;
        if (!reducedMotionRef.current) {
          const elapsed = (now - thrusterStartedAt) / 1000;
          const telemetry = computeThrusterTestTelemetry(elapsed, true);
          sceneBuild.rotors.port.rotation.y += telemetry.horizontalSpinRadPerSec * dt;
          sceneBuild.rotors.starboard.rotation.y -= telemetry.horizontalSpinRadPerSec * dt;
          sceneBuild.rotors.vertical.rotation.y += telemetry.verticalSpinRadPerSec * dt;
          needsNextFrame = true;
        }
      } else {
        wasThrusterActive = false;
      }

      // 4. Auto-rotate
      if (autoRotateRef.current && !reducedMotionRef.current) {
        controls.autoRotate = true;
        needsNextFrame = true;
      } else {
        controls.autoRotate = false;
      }

      const dampingChanged = controls.update();
      // If damping is active and still settling, schedule a follow-up render frame
      // so the camera glides to rest smoothly after the pointer is released.
      if (controls.enableDamping && dampingChanged) {
        needsNextFrame = true;
      }

      return needsNextFrame;
    }

    function requestRender() {
      if (disposed || contextLost) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      rafId = window.requestAnimationFrame((now) => {
        if (disposed || contextLost) {
          renderBusy = false;
          return;
        }
        renderDirty = false;
        const keepGoing = stepFrame(now);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (!disposed && !contextLost && (renderDirty || keepGoing)) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    }

    requestRenderFnRef.current = requestRender;
    requestRender();

    // Pointer Raycasting (drag-safe click threshold <= 6px, throttled hover)
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let lastHoverRaycast = 0;

    const findPartIdFromPointer = (clientX: number, clientY: number): Rov3DPartId | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(sceneBuild.hitMeshes, false);
      if (hits.length === 0) return null;
      const partId = hits[0].object.userData.partId as Rov3DPartId | undefined;
      return partId ?? null;
    };

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (dx * dx + dy * dy <= 36) {
        const hitPart = findPartIdFromPointer(e.clientX, e.clientY);
        setSelectedPartId((prev) => (hitPart && prev === hitPart ? null : hitPart));
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverRaycast < 48) return;
      lastHoverRaycast = now;
      const hitPart = findPartIdFromPointer(e.clientX, e.clientY);
      renderer.domElement.style.cursor = hitPart ? 'pointer' : 'grab';
      if (hitPart !== hoveredIdRef.current) {
        setHoveredPartId(hitPart);
      }
    };

    const onPointerLeave = () => {
      renderer.domElement.style.cursor = 'grab';
      if (hoveredIdRef.current !== null) {
        setHoveredPartId(null);
      }
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      setWebglUnavailableReason('WebGL rendering context was lost by the device.');
    };

    const onContextRestored = () => {
      contextLost = false;
      setWebglUnavailableReason(null);
      requestRender();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(280, Math.floor(entry.contentRect.width));
      const h = Math.max(320, Math.floor(entry.contentRect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      requestRender();
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      resizeObserver.disconnect();

      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      controls.dispose();
      controlsRef.current = null;
      sceneBuild.dispose();
      sceneBuildRef.current = null;
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      requestRenderFnRef.current = null;
    };
  }, []);

  const handleSelectCameraPreset = useCallback((id: CameraPresetId) => {
    const preset = getCameraPresetById(id);
    setActivePreset(id);
    presetGoalRef.current = {
      position: [...preset.position] as [number, number, number],
      target: [...preset.target] as [number, number, number],
    };
    requestRenderFnRef.current?.();
  }, []);

  const selectedSpec = selectedPartId ? getPartSpecById(selectedPartId) : null;
  const hoveredSpec = hoveredPartId ? getPartSpecById(hoveredPartId) : null;

  return (
    <div className="space-y-4">
      {/* Honesty & Scope Header Strip */}
      <section
        aria-label="3D Concept Model Scope and Honesty Notice"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] px-4 py-3"
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
              Sea Lion ROV — Interactive 3D Hardware Model
            </h1>
            <span
              data-testid="concept-model-badge"
              className="rounded border border-amber-500/70 bg-amber-100 px-2 py-0.5 font-mono text-xs font-semibold text-amber-950 dark:border-amber-500/60 dark:bg-amber-950/60 dark:text-amber-200"
            >
              {CONCEPT_MODEL_BADGE}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            Free-flooding 1/2-inch PVC frame · {DESIGN_LASER_SPACING_LABEL} · Shallow-water screening (~1 m).
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleSelectCameraPreset('iso')}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-4 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>Reset View</span>
        </button>
      </section>

      {/* Main Layout Grid: 3D Stage + Right Hardware Inspector (Below on mobile) */}
      <div className="grid gap-5 lg:grid-cols-12 items-start">
        <div className="min-w-0 lg:col-span-8 space-y-3">
          {webglUnavailableReason ? (
            <Model3DFallback
              reason={webglUnavailableReason}
              selectedPartId={selectedPartId}
              onSelectPart={(id) => setSelectedPartId((prev) => (prev === id ? null : id))}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0B1220]">
              {/* Dedicated unobstructed Three.js Canvas Mount */}
              <div className="relative h-[360px] sm:h-[440px] lg:h-[480px] w-full">
                <div
                  ref={mountRef}
                  data-testid="rov-3d-canvas-container"
                  className="h-full w-full touch-none"
                />

                {/* Top-left subtle solid-backed hover status chip (no backdrop-filter over WebGL!) */}
                <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
                  <span className="rounded border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-[#070B12]/95 px-2.5 py-1 font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                    {hoveredSpec
                      ? `Inspect: ${hoveredSpec.shortLabel}`
                      : 'Drag to orbit · Scroll/pinch zoom · Tap part'}
                  </span>
                </div>

                {/* Top-right dry topside reminder chip */}
                <div className="pointer-events-none absolute top-3 right-3 hidden sm:block">
                  <span className="rounded border border-amber-500/70 bg-amber-50/95 dark:bg-amber-950/95 px-2.5 py-1 font-mono text-xs font-semibold text-amber-950 dark:text-amber-200">
                    {DRY_TOPSIDE_LABEL}
                  </span>
                </div>
              </div>

              {/* Compact Bottom Control Dock inside Viewport Frame */}
              <div className="border-t border-slate-300 dark:border-slate-800 bg-white dark:bg-[#0F1623] p-3 sm:p-4 space-y-3">
                {/* Camera Presets & Auto-Rotate Row */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0 pr-1">
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                    View:
                  </span>
                  {CAMERA_PRESETS.filter((p) => p.id !== 'iso').map((preset) => {
                    const isActive = activePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectCameraPreset(preset.id)}
                        aria-pressed={isActive}
                        className={`min-h-[44px] px-3.5 py-2 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          isActive
                            ? 'border-sky-700 bg-sky-700 text-white dark:border-cyan-400 dark:bg-cyan-500 dark:text-slate-950'
                            : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B12] text-slate-800 dark:text-slate-200 hover:border-sky-600'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => !prefersReducedMotion && setAutoRotate((prev) => !prev)}
                    aria-pressed={autoRotate}
                    disabled={prefersReducedMotion}
                    title={
                      prefersReducedMotion
                        ? 'Disabled because prefers-reduced-motion is active'
                        : 'Toggle smooth turntable orbit'
                    }
                    className={`ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                      autoRotate && !prefersReducedMotion
                        ? 'border-sky-700 bg-sky-100 text-sky-950 dark:border-cyan-400 dark:bg-cyan-950/60 dark:text-cyan-200'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B12] text-slate-800 dark:text-slate-200 hover:border-sky-600'
                    }`}
                  >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Auto-Rotate</span>
                  </button>
                </div>

                {/* Assembly Modes: Exploded View + Dry/Wet Zone + Thruster Test */}
                <div className="grid gap-3 sm:grid-cols-12 items-center border-t border-slate-200 dark:border-slate-800 pt-3">
                  <div className="sm:col-span-5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor="exploded-view-slider"
                        className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100"
                      >
                        <Layers className="h-3.5 w-3.5 text-sky-700 dark:text-cyan-400" aria-hidden="true" />
                        <span>Exploded view</span>
                      </label>
                      <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                        {explodePct}%
                      </span>
                    </div>
                    <input
                      id="exploded-view-slider"
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={explodePct}
                      onChange={(e) => setExplodePct(Number(e.target.value))}
                      className="w-full min-h-[32px] accent-sky-700 dark:accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div className="sm:col-span-7 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDryWetMode((prev) => !prev)}
                      aria-pressed={dryWetMode}
                      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                        dryWetMode
                          ? 'border-sky-700 bg-sky-700 text-white dark:border-cyan-400 dark:bg-cyan-500 dark:text-slate-950'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B12] text-slate-800 dark:text-slate-200 hover:border-sky-600'
                      }`}
                    >
                      <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Dry vs wet zone</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setThrusterTestActive((prev) => !prev)}
                      aria-pressed={thrusterTestActive}
                      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                        thrusterTestActive
                          ? 'border-amber-600 bg-amber-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-slate-950'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B12] text-slate-800 dark:text-slate-200 hover:border-amber-600'
                      }`}
                    >
                      <Fan className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{thrusterTestActive ? 'Stop Thruster Test' : 'Thruster test'}</span>
                    </button>
                  </div>
                </div>

                {/* Dry vs Wet Zone Non-Color-Only Legend */}
                {dryWetMode && (
                  <div
                    role="region"
                    aria-label="Dry versus Wet Zone Legend"
                    data-testid="dry-wet-legend"
                    className="flex flex-wrap items-center gap-4 border-t border-slate-200 dark:border-slate-800 pt-2.5 text-xs"
                  >
                    <span className="inline-flex items-center gap-1.5 font-medium text-sky-900 dark:text-cyan-300">
                      <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
                      Wet · Free-Flooding PVC Frame
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-medium text-teal-900 dark:text-teal-300">
                      <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                      Wet · Epoxy-Sealed Sensors &amp; Pumps
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-300">
                      <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
                      {DRY_TOPSIDE_LABEL}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Accessible Keyboard-Focusable Hardware Selector Strip (Touch + Keyboard Parity) */}
          <section
            aria-label="Select 3D Hardware Part via Keyboard or Touch"
            className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-3.5 space-y-2"
          >
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Hardware Parts (tap model above or select below with keyboard Tab + Enter):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ROV_3D_PARTS.map((part) => {
                const isSelected = selectedPartId === part.id;
                return (
                  <button
                    key={part.id}
                    type="button"
                    data-3d-part-button={part.id}
                    aria-pressed={isSelected}
                    onMouseEnter={() => setHoveredPartId(part.id)}
                    onMouseLeave={() => setHoveredPartId(null)}
                    onClick={() => setSelectedPartId((prev) => (prev === part.id ? null : part.id))}
                    className={`min-h-[44px] px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-sky-700 bg-sky-700 text-white dark:border-cyan-400 dark:bg-cyan-500 dark:text-slate-950 font-semibold'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] text-slate-800 dark:text-slate-200 hover:border-sky-600'
                    }`}
                  >
                    {part.shortLabel}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Sidebar (Below on Mobile): Part Inspector + Live Simulated Thruster PWM Readout */}
        <div className="min-w-0 lg:col-span-4 space-y-4">
          {selectedSpec ? (
            <Part3DInspectorPanel
              part={selectedSpec}
              onClose={() => setSelectedPartId(null)}
            />
          ) : (
            <section
              aria-label="3D Inspector Ready Prompt"
              className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-5 space-y-2"
            >
              <div className="flex items-center gap-2 text-sky-800 dark:text-cyan-300">
                <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50">
                  Tap Any Part to Inspect Wiring
                </h2>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Select any 3D component or part button to view its physical wire/USB path, planned ESP32 pin group, and AWS service target.
              </p>
            </section>
          )}

          {/* Simulated 3-Thruster Test Readout Card */}
          <section
            aria-label="Simulated Thruster Test Telemetry"
            data-testid="thruster-test-readout"
            className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50">
                Thruster Test Output
              </h2>
              <span className="font-mono text-xs font-semibold text-amber-800 dark:text-amber-300">
                SIMULATED
              </span>
            </div>

            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {pwmTelemetry.maneuverLabel}
            </p>

            <dl className="grid grid-cols-3 gap-2 border-t border-slate-200 dark:border-slate-800 pt-3 text-center">
              <div className="rounded-lg bg-white dark:bg-[#070B12] p-2 border border-slate-200 dark:border-slate-800">
                <dt className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Port Horiz
                </dt>
                <dd className="mt-0.5 font-mono tabular-nums text-sm font-bold text-slate-950 dark:text-slate-50">
                  {pwmTelemetry.portHorizontalPct}%
                </dd>
              </div>
              <div className="rounded-lg bg-white dark:bg-[#070B12] p-2 border border-slate-200 dark:border-slate-800">
                <dt className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Stbd Horiz
                </dt>
                <dd className="mt-0.5 font-mono tabular-nums text-sm font-bold text-slate-950 dark:text-slate-50">
                  {pwmTelemetry.starboardHorizontalPct}%
                </dd>
              </div>
              <div className="rounded-lg bg-white dark:bg-[#070B12] p-2 border border-slate-200 dark:border-slate-800">
                <dt className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Vert Dive
                </dt>
                <dd className="mt-0.5 font-mono tabular-nums text-sm font-bold text-slate-950 dark:text-slate-50">
                  {pwmTelemetry.verticalDivePct}%
                </dd>
              </div>
            </dl>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              ESP32 PWM headers: GPIO16, GPIO17, GPIO18 (planned wiring, to be confirmed).
            </p>
          </section>

          {/* Concept Model Engineering Notes */}
          <section
            aria-label="Concept Model Calibration and Honesty Limits"
            className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-5 space-y-2 text-xs text-slate-700 dark:text-slate-300"
          >
            <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50">
              Build Notes &amp; Limits
            </h2>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong>{CONCEPT_MODEL_BADGE}</strong>. Only the laser separation uses{' '}
                <span className="font-mono">{DESIGN_LASER_SPACING_LABEL}</span>.
              </li>
              <li>
                Open 1/2-inch PVC pipes with drain holes flood freely; laser pen barrels, endoscope,
                pump pods, piezo disc (ADC1), and pressure transducer are epoxy-sealed.
              </li>
              <li>
                Intended for shallow-water screening (~1 m); makes no depth-rating or absolute
                metrology guarantees.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
