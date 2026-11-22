import * as THREE from 'three';
import {
  DESIGN_LASER_SPACING_LABEL,
  DRY_TOPSIDE_LABEL,
  DryWetZone,
  ROV_3D_PARTS,
  Rov3DPartId,
} from './rovModelSpec';

export interface InteractivePartHandles {
  id: Rov3DPartId;
  group: THREE.Group;
  basePosition: THREE.Vector3;
  explodeOffset: THREE.Vector3;
  zone: DryWetZone;
  materials: THREE.MeshStandardMaterial[];
}

export interface RotorHandles {
  port: THREE.Group;
  starboard: THREE.Group;
  vertical: THREE.Group;
}

export interface RovSceneBuildResult {
  root: THREE.Group;
  parts: Map<Rov3DPartId, InteractivePartHandles>;
  hitMeshes: THREE.Object3D[];
  rotors: RotorHandles;
  floorShadow: THREE.Mesh;
  gridHelper: THREE.GridHelper;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.HemisphereLight;
  rimLight: THREE.DirectionalLight;
  applyTheme: (isDark: boolean) => void;
  updateVisualStates: (opts: {
    hoveredId: Rov3DPartId | null;
    selectedId: Rov3DPartId | null;
    dryWetMode: boolean;
  }) => void;
  dispose: () => void;
}

interface MaterialMeta {
  baseColor: THREE.Color;
  baseEmissive: THREE.Color;
  baseEmissiveIntensity: number;
  zone: DryWetZone;
}

const _tmpColor = new THREE.Color();
const _wetFreeTint = new THREE.Color('#0ea5e9');
const _wetSealedTint = new THREE.Color('#14b8a6');
const _dryTopsideTint = new THREE.Color('#f59e0b');
const _hoverEmissive = new THREE.Color('#38bdf8');
const _selectEmissive = new THREE.Color('#22d3ee');

function createLabelCanvasTexture(
  lines: string[],
  opts: {
    width: number;
    height: number;
    bg: string;
    border: string;
    fg: string;
    accent?: string;
    fontSize?: number;
  },
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    const fontSize = opts.fontSize ?? 30;
    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lineStep = fontSize * 1.3;
    const startY = canvas.height / 2 - ((lines.length - 1) * lineStep) / 2;
    lines.forEach((line, idx) => {
      ctx.fillStyle = idx === 0 && opts.accent ? opts.accent : opts.fg;
      ctx.fillText(line, canvas.width / 2, startY + idx * lineStep);
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createLaptopScreenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#09111e';
    ctx.fillRect(0, 0, 512, 320);

    // Subtle telemetry header strip
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(16, 16, 480, 44);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.fillText('SEA LION · TOPSIDE BRIDGE', 30, 45);

    // Acoustic waveform plot
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 28; x <= 484; x += 8) {
      const y = 135 + Math.sin(x * 0.055) * 26 + Math.cos(x * 0.13) * 10;
      if (x === 28) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Status cards
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(28, 200, 214, 88);
    ctx.fillRect(270, 200, 214, 88);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.fillText('LASER SPACING (CAL)', 42, 228);
    ctx.fillText('MQTT → IOT CORE', 284, 228);

    ctx.fillStyle = '#4ade80';
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillText('50 mm DESIGN', 42, 264);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('SIMULATED', 284, 264);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
    grad.addColorStop(0, 'rgba(0,0,0,0.48)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function buildRovThreeScene(opts: {
  scene: THREE.Scene;
  isSoftwareGl: boolean;
  maxAnisotropy: number;
  initialDark: boolean;
}): RovSceneBuildResult {
  const { scene, isSoftwareGl, maxAnisotropy, initialDark } = opts;

  const trackedGeometries: THREE.BufferGeometry[] = [];
  const trackedMaterials: THREE.Material[] = [];
  const trackedTextures: THREE.Texture[] = [];
  const materialMeta = new WeakMap<THREE.MeshStandardMaterial, MaterialMeta>();

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    trackedGeometries.push(g);
    return g;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    t.anisotropy = Math.min(8, maxAnisotropy);
    trackedTextures.push(t);
    return t;
  };

  const root = new THREE.Group();
  root.name = 'sea-lion-studio-root';
  scene.add(root);

  // Studio Lights (Warm Key + Cool Fill + Rim)
  const fillLight = new THREE.HemisphereLight(0xcbe8ff, 0x1e293b, 0.85);
  scene.add(fillLight);

  const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.2);
  keyLight.position.set(5.5, 7.5, 6.0);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 24;
    const d = 6.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
  }
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x7dd3fc, 1.05);
  rimLight.position.set(-5.0, 4.0, -5.5);
  scene.add(rimLight);

  // Studio CAD Floor & Grid (white vertex colors so applyTheme color-tints cleanly in dark & light modes)
  const floorY = -0.82;
  const gridHelper = new THREE.GridHelper(18, 36, 0xffffff, 0xffffff);
  gridHelper.position.set(0, floorY, -1.2);
  if (!Array.isArray(gridHelper.material)) {
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.45;
  }
  root.add(gridHelper);

  const shadowTex = trackTex(createContactShadowTexture());
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(5.6, 5.2));
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.65,
  });
  trackedMaterials.push(shadowMat);
  const floorShadow = new THREE.Mesh(shadowGeo, shadowMat);
  floorShadow.rotation.x = -Math.PI / 2;
  floorShadow.position.set(0, floorY + 0.01, -0.1);
  root.add(floorShadow);

  // Shared materials factory per zone so interactive highlight works cleanly per part
  const parts = new Map<Rov3DPartId, InteractivePartHandles>();
  const hitMeshes: THREE.Object3D[] = [];

  const registerPartGroup = (
    id: Rov3DPartId,
    basePos: [number, number, number],
  ): InteractivePartHandles => {
    const spec = ROV_3D_PARTS.find((p) => p.id === id)!;
    const group = new THREE.Group();
    group.name = id;
    group.position.set(basePos[0], basePos[1], basePos[2]);
    group.userData.partId = id;
    root.add(group);
    const handles: InteractivePartHandles = {
      id,
      group,
      basePosition: new THREE.Vector3(...basePos),
      explodeOffset: new THREE.Vector3(...spec.explodeOffset),
      zone: spec.zone,
      materials: [],
    };
    parts.set(id, handles);
    return handles;
  };

  const makePartMat = (
    handles: InteractivePartHandles,
    params: THREE.MeshStandardMaterialParameters,
  ): THREE.MeshStandardMaterial => {
    const mat = new THREE.MeshStandardMaterial(params);
    trackedMaterials.push(mat);
    handles.materials.push(mat);
    materialMeta.set(mat, {
      baseColor: mat.color.clone(),
      baseEmissive: mat.emissive.clone(),
      baseEmissiveIntensity: mat.emissiveIntensity,
      zone: handles.zone,
    });
    return mat;
  };

  const tagMesh = (mesh: THREE.Object3D, id: Rov3DPartId) => {
    mesh.userData.partId = id;
    mesh.castShadow = !isSoftwareGl;
    mesh.receiveShadow = !isSoftwareGl;
    hitMeshes.push(mesh);
  };

  // =========================================================================
  // 1. FREE-FLOODING 1/2-INCH PVC FRAME (no float collar, open ends + drain holes)
  // =========================================================================
  const pvc = registerPartGroup('pvc-frame', [0, 0, 0]);
  const pvcPipeMat = makePartMat(pvc, {
    color: 0xe2e8f0,
    roughness: 0.54,
    metalness: 0.05,
  });
  const pvcJointMat = makePartMat(pvc, {
    color: 0xcbd5e1,
    roughness: 0.46,
    metalness: 0.08,
  });
  const boreDarkMat = new THREE.MeshStandardMaterial({
    color: 0x090d14,
    roughness: 0.92,
    metalness: 0.0,
  });
  trackedMaterials.push(boreDarkMat);

  const pipeR = 0.095; // ~1/2-inch PVC pipe illustrative radius
  const jointR = 0.122;
  const rx = 1.02; // frame half-width
  const ry = 0.58; // frame half-height
  const rz = 1.25; // frame half-length

  const addPipe = (
    p1: [number, number, number],
    p2: [number, number, number],
    openEnds: boolean = false,
  ) => {
    const v1 = new THREE.Vector3(...p1);
    const v2 = new THREE.Vector3(...p2);
    const len = v1.distanceTo(v2);
    const mid = v1.clone().add(v2).multiplyScalar(0.5);
    const geo = trackGeo(new THREE.CylinderGeometry(pipeR, pipeR, len, 14, 1, openEnds));
    if (openEnds) {
      // DoubleSide only on open pipe ends so interior wall thickness & hollow bore remain visible
      const openMat = makePartMat(pvc, {
        color: 0xe2e8f0,
        roughness: 0.54,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, openMat);
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        v2.clone().sub(v1).normalize(),
      );
      pvc.group.add(mesh);
      tagMesh(mesh, 'pvc-frame');
      return;
    }
    const mesh = new THREE.Mesh(geo, pvcPipeMat);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      v2.clone().sub(v1).normalize(),
    );
    pvc.group.add(mesh);
    tagMesh(mesh, 'pvc-frame');
  };

  // Lower runners extend slightly beyond uprights with OPEN pipe ends
  addPipe([-rx, -ry, -rz - 0.22], [-rx, -ry, rz + 0.22], true);
  addPipe([rx, -ry, -rz - 0.22], [rx, -ry, rz + 0.22], true);
  // Upper runners (open ends at front and rear)
  addPipe([-rx, ry, -rz - 0.18], [-rx, ry, rz + 0.18], true);
  addPipe([rx, ry, -rz - 0.18], [rx, ry, rz + 0.18], true);

  // 4 Vertical corner posts
  for (const sx of [-rx, rx]) {
    for (const sz of [-rz, rz]) {
      addPipe([sx, -ry, sz], [sx, ry, sz]);
    }
  }

  // Transverse cross-bars (front & rear bottom/top + mid camera & thruster crossbars)
  addPipe([-rx, -ry, rz], [rx, -ry, rz]);
  addPipe([-rx, -ry, -rz], [rx, -ry, -rz]);
  addPipe([-rx, ry, rz], [rx, ry, rz]);
  addPipe([-rx, ry, -rz], [rx, ry, -rz]);
  // Central vertical thruster cross-bridge
  addPipe([-rx, ry, -0.05], [rx, ry, -0.05]);
  // Mid front camera/laser crossbar
  addPipe([-rx, 0.08, rz], [rx, 0.08, rz]);
  // Mid horizontal thruster outboard stub arms
  addPipe([-rx - 0.28, 0.02, -0.25], [-rx, 0.02, -0.25]);
  addPipe([rx, 0.02, -0.25], [rx + 0.28, 0.02, -0.25]);

  // T-joint fitting sleeves at intersections
  const addTJoint = (
    pos: [number, number, number],
    axis: 'x' | 'y' | 'z',
  ) => {
    const sleeveGeo = trackGeo(new THREE.CylinderGeometry(jointR, jointR, 0.32, 14));
    const sleeve = new THREE.Mesh(sleeveGeo, pvcJointMat);
    sleeve.position.set(...pos);
    if (axis === 'x') sleeve.rotation.z = Math.PI / 2;
    else if (axis === 'z') sleeve.rotation.x = Math.PI / 2;
    pvc.group.add(sleeve);
    tagMesh(sleeve, 'pvc-frame');
  };

  for (const sx of [-rx, rx]) {
    for (const sy of [-ry, ry]) {
      for (const sz of [-rz, rz]) {
        addTJoint([sx, sy, sz], 'z');
        addTJoint([sx, sy, sz], 'y');
      }
    }
    addTJoint([sx, ry, -0.05], 'z');
    addTJoint([sx, 0.08, rz], 'y');
    addTJoint([sx, 0.02, -0.25], 'x');
  }

  // Instanced dark open bore discs on pipe open ends (8 open pipe ends)
  const borePositions: [number, number, number, number][] = [
    [-rx, -ry, rz + 0.218, 0],
    [-rx, -ry, -rz - 0.218, 0],
    [rx, -ry, rz + 0.218, 0],
    [rx, -ry, -rz - 0.218, 0],
    [-rx, ry, rz + 0.178, 0],
    [-rx, ry, -rz - 0.178, 0],
    [rx, ry, rz + 0.178, 0],
    [rx, ry, -rz - 0.178, 0],
  ];
  const boreGeo = trackGeo(new THREE.CylinderGeometry(pipeR * 0.72, pipeR * 0.72, 0.02, 12));
  const boreInst = new THREE.InstancedMesh(boreGeo, boreDarkMat, borePositions.length);
  const dummy = new THREE.Object3D();
  borePositions.forEach(([x, y, z], idx) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.updateMatrix();
    boreInst.setMatrixAt(idx, dummy.matrix);
  });
  boreInst.instanceMatrix.needsUpdate = true;
  boreInst.computeBoundingSphere();
  pvc.group.add(boreInst);

  // Instanced drain holes along bottom & top runners (12 visible drain holes for free-flooding drainage)
  const drainCoords: [number, number, number, 'top' | 'side'][] = [];
  for (const sx of [-rx, rx]) {
    for (const sz of [-0.85, -0.3, 0.25, 0.8]) {
      drainCoords.push([sx, -ry + pipeR * 0.96, sz, 'top']);
      drainCoords.push([sx, ry + pipeR * 0.96, sz, 'top']);
    }
  }
  const drainGeo = trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.022, 10));
  const drainInst = new THREE.InstancedMesh(drainGeo, boreDarkMat, drainCoords.length);
  drainCoords.forEach(([x, y, z], idx) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    drainInst.setMatrixAt(idx, dummy.matrix);
  });
  drainInst.instanceMatrix.needsUpdate = true;
  drainInst.computeBoundingSphere();
  pvc.group.add(drainInst);

  // =========================================================================
  // 2. WATERPROOF USB ENDOSCOPE CAMERA (no acrylic dome cover, epoxy-sealed)
  // =========================================================================
  const camPart = registerPartGroup('usb-camera', [0, 0.08, rz + 0.1]);
  const camBodyMat = makePartMat(camPart, {
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.65,
  });
  const camEpoxyMat = makePartMat(camPart, {
    color: 0xb45309,
    roughness: 0.42,
    metalness: 0.08,
  });
  const camGlassMat = makePartMat(camPart, {
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.25,
    emissive: 0x0c4a6e,
    emissiveIntensity: 0.35,
  });

  // Mounting bracket collar clamping onto front crossbar
  const bracketMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.32, 0.22, 0.22)),
    makePartMat(camPart, { color: 0x334155, roughness: 0.6, metalness: 0.15 }),
  );
  bracketMesh.position.set(0, 0, -0.1);
  camPart.group.add(bracketMesh);
  tagMesh(bracketMesh, 'usb-camera');

  // Endoscope main cylindrical housing
  const camHousing = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.56, 18)),
    camBodyMat,
  );
  camHousing.rotation.x = Math.PI / 2;
  camHousing.position.set(0, 0, 0.16);
  camPart.group.add(camHousing);
  tagMesh(camHousing, 'usb-camera');

  // Epoxy-sealed rear potting gland
  const camEpoxy = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.095, 0.12, 0.16, 16)),
    camEpoxyMat,
  );
  camEpoxy.rotation.x = Math.PI / 2;
  camEpoxy.position.set(0, 0, -0.14);
  camPart.group.add(camEpoxy);
  tagMesh(camEpoxy, 'usb-camera');

  // Recessed endoscope front optic lens (no acrylic cover)
  const camLens = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.072, 0.072, 0.03, 18)),
    camGlassMat,
  );
  camLens.rotation.x = Math.PI / 2;
  camLens.position.set(0, 0, 0.44);
  camPart.group.add(camLens);
  tagMesh(camLens, 'usb-camera');

  // =========================================================================
  // 3. TWIN 50 mm LASER MODULES (plain plastic pen barrels with epoxy seal)
  // =========================================================================
  const lasers = registerPartGroup('calibration-lasers', [0, 0.32, rz + 0.08]);
  const penBarrelMat = makePartMat(lasers, {
    color: 0xf1f5f9,
    roughness: 0.48,
    metalness: 0.04,
  });
  const penEpoxyMat = makePartMat(lasers, {
    color: 0xd97706,
    roughness: 0.42,
    metalness: 0.06,
  });
  const laserMountBarMat = makePartMat(lasers, {
    color: 0x334155,
    roughness: 0.58,
    metalness: 0.12,
  });

  // Cross-bracket holding the two modules strictly at +/- 0.25 units (= 50 mm design spacing)
  const laserMountBar = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.72, 0.07, 0.14)),
    laserMountBarMat,
  );
  laserMountBar.position.set(0, -0.08, -0.05);
  lasers.group.add(laserMountBar);
  tagMesh(laserMountBar, 'calibration-lasers');

  const beamMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.85 });
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
  trackedMaterials.push(beamMat, dotMat);

  const targetWallZ = 2.05; // local Z from laser group -> world Z ~ 3.38
  for (const lx of [-0.25, 0.25]) {
    // Plain plastic pen barrel
    const barrel = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.048, 0.052, 0.66, 14)),
      penBarrelMat,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(lx, 0, 0.12);
    lasers.group.add(barrel);
    tagMesh(barrel, 'calibration-lasers');

    // Front & rear epoxy-seal potting collars
    for (const ez of [-0.18, 0.44]) {
      const seal = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.058, 0.058, 0.08, 14)),
        penEpoxyMat,
      );
      seal.rotation.x = Math.PI / 2;
      seal.position.set(lx, 0, ez);
      lasers.group.add(seal);
      tagMesh(seal, 'calibration-lasers');
    }

    // Laser beam projecting straight forward (+Z)
    const beamLen = targetWallZ - 0.48;
    const beam = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.008, 0.008, beamLen, 8)),
      beamMat,
    );
    beam.rotation.x = Math.PI / 2;
    beam.position.set(lx, 0, 0.48 + beamLen / 2);
    lasers.group.add(beam);

    // Projected green laser dot on target plane (proud enough to stay visible from both sides)
    const dot = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.048, 12, 12)), dotMat);
    dot.position.set(lx, 0, targetWallZ);
    lasers.group.add(dot);
  }

  // Translucent calibration target plane in front of nose with framed edge so Front view stays unobstructed
  const targetPlateGeo = trackGeo(new THREE.BoxGeometry(1.42, 0.84, 0.04));
  const targetPlate = new THREE.Mesh(
    targetPlateGeo,
    makePartMat(lasers, {
      color: 0x64748b,
      roughness: 0.72,
      metalness: 0.05,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
  targetPlate.position.set(0, -0.06, targetWallZ + 0.02);
  lasers.group.add(targetPlate);
  tagMesh(targetPlate, 'calibration-lasers');

  const targetBorderMat = new THREE.LineBasicMaterial({ color: 0x94a3b8 });
  trackedMaterials.push(targetBorderMat);
  const targetEdges = new THREE.LineSegments(
    trackGeo(new THREE.EdgesGeometry(targetPlateGeo)),
    targetBorderMat,
  );
  targetEdges.position.copy(targetPlate.position);
  lasers.group.add(targetEdges);

  // 50 mm dimension line bar + end ticks right above the target dots
  const dimLineMat = new THREE.LineBasicMaterial({ color: 0x22d3ee });
  trackedMaterials.push(dimLineMat);
  const dimPoints = [
    new THREE.Vector3(-0.25, 0.08, targetWallZ - 0.03),
    new THREE.Vector3(-0.25, 0.44, targetWallZ - 0.03),
    new THREE.Vector3(0.25, 0.44, targetWallZ - 0.03),
    new THREE.Vector3(0.25, 0.08, targetWallZ - 0.03),
  ];
  const dimLine = new THREE.Line(trackGeo(new THREE.BufferGeometry().setFromPoints(dimPoints)), dimLineMat);
  lasers.group.add(dimLine);

  // High-contrast 50 mm design spacing label plaque above dimension bar
  const laserDarkTex = trackTex(
    createLabelCanvasTexture(['50 mm design spacing', '(verify with calipers)'], {
      width: 560,
      height: 112,
      bg: '#0b1220',
      border: '#22d3ee',
      fg: '#e2e8f0',
      accent: '#67e8f9',
      fontSize: 28,
    }),
  );
  const laserLightTex = trackTex(
    createLabelCanvasTexture(['50 mm design spacing', '(verify with calipers)'], {
      width: 560,
      height: 112,
      bg: '#ffffff',
      border: '#0284c7',
      fg: '#0f172a',
      accent: '#0369a1',
      fontSize: 28,
    }),
  );
  const laserSignMat = new THREE.MeshBasicMaterial({
    map: initialDark ? laserDarkTex : laserLightTex,
    side: THREE.DoubleSide,
  });
  trackedMaterials.push(laserSignMat);
  const laserSignMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.5, 0.3)), laserSignMat);
  laserSignMesh.position.set(0, 0.68, targetWallZ - 0.02);
  lasers.group.add(laserSignMesh);

  // =========================================================================
  // 4, 5, 6. THREE PUMP THRUSTERS (2 horizontal + 1 vertical) with spinning rotors
  // =========================================================================
  const buildPumpThruster = (
    id: 'thruster-port' | 'thruster-starboard' | 'thruster-vertical',
    pos: [number, number, number],
    orientation: 'horizontal' | 'vertical',
  ): THREE.Group => {
    const tPart = registerPartGroup(id, pos);
    const shroudMat = makePartMat(tPart, {
      color: 0x0f172a,
      roughness: 0.44,
      metalness: 0.25,
      side: THREE.DoubleSide,
    });
    const podMat = makePartMat(tPart, {
      color: 0x0284c7,
      roughness: 0.36,
      metalness: 0.3,
    });
    const rotorMat = makePartMat(tPart, {
      color: 0xf59e0b,
      roughness: 0.38,
      metalness: 0.22,
    });

    const assembly = new THREE.Group();
    if (orientation === 'horizontal') {
      assembly.rotation.x = Math.PI / 2;
    }
    tPart.group.add(assembly);

    // Open cylindrical shroud duct
    const shroud = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.44, 18, 1, true)),
      shroudMat,
    );
    assembly.add(shroud);
    tagMesh(shroud, id);

    // Epoxy-sealed center pump motor pod
    const pod = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.085, 0.085, 0.36, 14)),
      podMat,
    );
    assembly.add(pod);
    tagMesh(pod, id);

    // 3 mounting stator spokes
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const strut = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.03, 0.06, 0.44)), shroudMat);
      strut.rotation.y = angle;
      strut.position.set(0, -0.14, 0);
      assembly.add(strut);
      tagMesh(strut, id);
    }

    // Spinning rotor assembly (hub + 4 pitched blades)
    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(0, 0.08, 0);
    assembly.add(rotorGroup);

    const hub = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.065, 0.075, 0.09, 12)),
      rotorMat,
    );
    rotorGroup.add(hub);
    tagMesh(hub, id);

    const bladeGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.018, 0.06));
    for (let b = 0; b < 4; b++) {
      const bladeWrap = new THREE.Group();
      bladeWrap.rotation.y = (b * Math.PI) / 2;
      const blade = new THREE.Mesh(bladeGeo, rotorMat);
      blade.position.set(0.11, 0, 0);
      blade.rotation.x = 0.55;
      bladeWrap.add(blade);
      rotorGroup.add(bladeWrap);
      tagMesh(blade, id);
    }

    return rotorGroup;
  };

  const portRotor = buildPumpThruster('thruster-port', [-rx - 0.34, 0.02, -0.25], 'horizontal');
  const starboardRotor = buildPumpThruster('thruster-starboard', [rx + 0.34, 0.02, -0.25], 'horizontal');
  const verticalRotor = buildPumpThruster('thruster-vertical', [0, ry + 0.06, -0.05], 'vertical');

  // =========================================================================
  // 7. PIEZO HYDROPHONE (small brass/ceramic disc + epoxy seal on lower rail)
  // =========================================================================
  const piezo = registerPartGroup('piezo-hydrophone', [0.58, -ry - 0.06, 0.52]);
  const piezoDisc = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.17, 0.17, 0.045, 20)),
    makePartMat(piezo, { color: 0xfbbf24, roughness: 0.25, metalness: 0.8 }),
  );
  piezo.group.add(piezoDisc);
  tagMesh(piezoDisc, 'piezo-hydrophone');

  const piezoEpoxyCap = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.12, 0.15, 0.06, 16)),
    makePartMat(piezo, { color: 0xb45309, roughness: 0.45, metalness: 0.08 }),
  );
  piezoEpoxyCap.position.set(0, 0.05, 0);
  piezo.group.add(piezoEpoxyCap);
  tagMesh(piezoEpoxyCap, 'piezo-hydrophone');

  // =========================================================================
  // 8. PRESSURE / DEPTH SENSOR (compact epoxy-sealed transducer on upper aft rail)
  // =========================================================================
  const pressure = registerPartGroup('pressure-sensor', [-0.62, ry + 0.14, -0.55]);
  const pressBody = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.095, 0.095, 0.34, 16)),
    makePartMat(pressure, { color: 0x94a3b8, roughness: 0.28, metalness: 0.85 }),
  );
  pressBody.rotation.x = Math.PI / 2;
  pressure.group.add(pressBody);
  tagMesh(pressBody, 'pressure-sensor');

  const pressCap = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.085, 0.095, 0.1, 14)),
    makePartMat(pressure, { color: 0xd97706, roughness: 0.44, metalness: 0.08 }),
  );
  pressCap.rotation.x = Math.PI / 2;
  pressCap.position.set(0, 0, -0.2);
  pressure.group.add(pressCap);
  tagMesh(pressCap, 'pressure-sensor');

  // =========================================================================
  // 9. TETHER CABLE (continuous catenary from ROV rear to dry topside shore unit)
  // =========================================================================
  const tether = registerPartGroup('tether-cable', [0, 0, 0]);
  const tetherCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.08, -rz - 0.05),
    new THREE.Vector3(-0.18, -0.38, -2.15),
    new THREE.Vector3(-0.46, floorY + 0.06, -3.35),
    new THREE.Vector3(-0.56, floorY + 0.14, -4.25),
    new THREE.Vector3(-0.57, floorY + 0.28, -4.64),
  ]);
  const tetherMesh = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(tetherCurve, 32, 0.045, 10, false)),
    makePartMat(tether, { color: 0xeab308, roughness: 0.45, metalness: 0.08 }),
  );
  tether.group.add(tetherMesh);
  tagMesh(tetherMesh, 'tether-cable');

  // =========================================================================
  // 10. DRY TOPSIDE SHORE UNIT (Laptop + ESP32 + "dry topside: not underwater")
  // =========================================================================
  const shore = registerPartGroup('shore-unit', [-1.15, floorY, -5.05]);
  const benchMat = makePartMat(shore, { color: 0x334155, roughness: 0.72, metalness: 0.12 });
  const laptopChassisMat = makePartMat(shore, { color: 0x1e293b, roughness: 0.38, metalness: 0.65 });
  const espBoardMat = makePartMat(shore, { color: 0x065f46, roughness: 0.55, metalness: 0.15 });
  const espCanMat = makePartMat(shore, { color: 0xcbd5e1, roughness: 0.22, metalness: 0.9 });

  // Dry topside bench plinth
  const bench = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.15, 0.24, 1.35)), benchMat);
  bench.position.set(0, 0.12, 0);
  shore.group.add(bench);
  tagMesh(bench, 'shore-unit');

  // Laptop base + hinged screen
  const laptopBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.05, 0.06, 0.72)),
    laptopChassisMat,
  );
  laptopBase.position.set(-0.32, 0.27, 0.04);
  shore.group.add(laptopBase);
  tagMesh(laptopBase, 'shore-unit');

  const laptopLidGroup = new THREE.Group();
  laptopLidGroup.position.set(-0.32, 0.3, -0.31);
  laptopLidGroup.rotation.x = -0.32;
  shore.group.add(laptopLidGroup);

  const laptopLid = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.05, 0.66, 0.04)),
    laptopChassisMat,
  );
  laptopLid.position.set(0, 0.33, 0);
  laptopLidGroup.add(laptopLid);
  tagMesh(laptopLid, 'shore-unit');

  const screenTex = trackTex(createLaptopScreenTexture());
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
  trackedMaterials.push(screenMat);
  const screenPlane = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.95, 0.56)), screenMat);
  screenPlane.position.set(0, 0.33, 0.024);
  laptopLidGroup.add(screenPlane);

  // ESP32 Dev Board next to laptop
  const espPcb = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.04, 0.66)), espBoardMat);
  espPcb.position.set(0.58, 0.26, 0.08);
  shore.group.add(espPcb);
  tagMesh(espPcb, 'shore-unit');

  const espShield = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.045, 0.24)), espCanMat);
  espShield.position.set(0.58, 0.3, -0.04);
  shore.group.add(espShield);
  tagMesh(espShield, 'shore-unit');

  // Upright plaque reading "dry topside: not underwater"
  const dryDarkTex = trackTex(
    createLabelCanvasTexture([DRY_TOPSIDE_LABEL], {
      width: 560,
      height: 88,
      bg: '#451a03',
      border: '#f59e0b',
      fg: '#fef3c7',
      accent: '#fcd34d',
      fontSize: 28,
    }),
  );
  const dryLightTex = trackTex(
    createLabelCanvasTexture([DRY_TOPSIDE_LABEL], {
      width: 560,
      height: 88,
      bg: '#fffbeb',
      border: '#d97706',
      fg: '#78350f',
      accent: '#b45309',
      fontSize: 28,
    }),
  );
  const drySignMat = new THREE.MeshBasicMaterial({
    map: initialDark ? dryDarkTex : dryLightTex,
    side: THREE.DoubleSide,
  });
  trackedMaterials.push(drySignMat);
  const drySign = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.75, 0.28)), drySignMat);
  drySign.position.set(0.05, 1.12, -0.58);
  shore.group.add(drySign);
  tagMesh(drySign, 'shore-unit');

  for (const px of [-0.62, 0.72]) {
    const signPost = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 8)),
      benchMat,
    );
    signPost.position.set(px, 0.56, -0.58);
    shore.group.add(signPost);
    tagMesh(signPost, 'shore-unit');
  }

  // =========================================================================
  // THEME & VISUAL STATE CONTROLLERS
  // =========================================================================
  const applyTheme = (isDark: boolean) => {
    const bgHex = isDark ? 0x070b12 : 0xf1f5f9;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, isDark ? 0.032 : 0.022);

    const gridMat = gridHelper.material;
    if (Array.isArray(gridMat)) {
      gridMat.forEach((m) => m.color.setHex(isDark ? 0x26354d : 0xcbd5e1));
    } else if ('color' in gridMat) {
      const lm = gridMat as THREE.LineBasicMaterial;
      lm.color.setHex(isDark ? 0x26354d : 0xcbd5e1);
      lm.opacity = isDark ? 0.55 : 0.65;
    }

    shadowMat.opacity = isDark ? 0.62 : 0.24;
    fillLight.groundColor.setHex(isDark ? 0x0f172a : 0xcbd5e1);
    fillLight.intensity = isDark ? 0.9 : 1.05;

    dimLineMat.color.setHex(isDark ? 0x22d3ee : 0x0369a1);
    targetBorderMat.color.setHex(isDark ? 0x94a3b8 : 0x475569);
    laserSignMat.map = isDark ? laserDarkTex : laserLightTex;
    laserSignMat.needsUpdate = true;

    drySignMat.map = isDark ? dryDarkTex : dryLightTex;
    drySignMat.needsUpdate = true;
  };

  applyTheme(initialDark);

  const updateVisualStates = (state: {
    hoveredId: Rov3DPartId | null;
    selectedId: Rov3DPartId | null;
    dryWetMode: boolean;
  }) => {
    const { hoveredId, selectedId, dryWetMode } = state;
    parts.forEach((part, id) => {
      const isSelected = selectedId === id;
      const isHovered = hoveredId === id;

      for (const mat of part.materials) {
        const meta = materialMeta.get(mat);
        if (!meta) continue;

        if (dryWetMode) {
          const tint =
            meta.zone === 'dry-topside'
              ? _dryTopsideTint
              : meta.zone === 'wet-free-flooding'
                ? _wetFreeTint
                : _wetSealedTint;
          _tmpColor.copy(meta.baseColor).lerp(tint, 0.38);
          mat.color.copy(_tmpColor);
        } else {
          mat.color.copy(meta.baseColor);
        }

        if (isSelected) {
          mat.emissive.copy(_selectEmissive);
          mat.emissiveIntensity = 0.38;
        } else if (isHovered) {
          mat.emissive.copy(_hoverEmissive);
          mat.emissiveIntensity = 0.24;
        } else if (dryWetMode) {
          const tint =
            meta.zone === 'dry-topside'
              ? _dryTopsideTint
              : meta.zone === 'wet-free-flooding'
                ? _wetFreeTint
                : _wetSealedTint;
          mat.emissive.copy(tint);
          mat.emissiveIntensity = 0.08;
        } else {
          mat.emissive.copy(meta.baseEmissive);
          mat.emissiveIntensity = meta.baseEmissiveIntensity;
        }
      }
    });
  };

  const dispose = () => {
    scene.remove(root, fillLight, keyLight, rimLight);
    trackedGeometries.forEach((g) => g.dispose());
    trackedMaterials.forEach((m) => m.dispose());
    trackedTextures.forEach((t) => t.dispose());
    gridHelper.geometry.dispose();
    if (Array.isArray(gridHelper.material)) {
      gridHelper.material.forEach((m) => m.dispose());
    } else {
      gridHelper.material.dispose();
    }
  };

  return {
    root,
    parts,
    hitMeshes,
    rotors: {
      port: portRotor,
      starboard: starboardRotor,
      vertical: verticalRotor,
    },
    floorShadow,
    gridHelper,
    keyLight,
    fillLight,
    rimLight,
    applyTheme,
    updateVisualStates,
    dispose,
  };
}

export { DESIGN_LASER_SPACING_LABEL };
