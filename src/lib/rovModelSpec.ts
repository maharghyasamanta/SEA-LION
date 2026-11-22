export type Rov3DPartId =
  | 'pvc-frame'
  | 'usb-camera'
  | 'calibration-lasers'
  | 'thruster-port'
  | 'thruster-starboard'
  | 'thruster-vertical'
  | 'piezo-hydrophone'
  | 'pressure-sensor'
  | 'tether-cable'
  | 'shore-unit';

export type DryWetZone = 'wet-free-flooding' | 'wet-epoxy-sealed' | 'dry-topside';

export type CameraPresetId = 'iso' | 'front' | 'side' | 'top' | 'shore';

export interface Rov3DPartSpec {
  id: Rov3DPartId;
  name: string;
  shortLabel: string;
  summary: string;
  connection: string;
  esp32PinGroup: string;
  awsService: string;
  zone: DryWetZone;
  zoneLabel: string;
  explodeOffset: readonly [number, number, number];
}

export interface CameraPresetSpec {
  id: CameraPresetId;
  label: string;
  description: string;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

export interface ThrusterTestTelemetry {
  active: boolean;
  portHorizontalPct: number;
  starboardHorizontalPct: number;
  verticalDivePct: number;
  horizontalSpinRadPerSec: number;
  verticalSpinRadPerSec: number;
  maneuverLabel: string;
}

export const DESIGN_LASER_SPACING_LABEL = '50 mm design spacing (verify with calipers)';
export const CONCEPT_MODEL_BADGE = 'CONCEPT MODEL: dimensions illustrative, not final';
export const DRY_TOPSIDE_LABEL = 'dry topside: not underwater';

export const ROV_3D_PARTS: readonly Rov3DPartSpec[] = [
  {
    id: 'pvc-frame',
    name: 'Free-Flooding 1/2-Inch PVC Frame',
    shortLabel: 'PVC Frame',
    summary:
      'Open 1/2-inch PVC pipe skeleton joined with unsealed T-joints and drain holes so water floods freely without pressure hulls.',
    connection: 'Mechanical chassis mounting frame only (zip-tie & clamp hardpoints)',
    esp32PinGroup: 'None — passive structural chassis (planned wiring, to be confirmed)',
    awsService: 'No direct telemetry (carries mounted sensor payload)',
    zone: 'wet-free-flooding',
    zoneLabel: 'Wet · Free-Flooding',
    explodeOffset: [0, 0, 0],
  },
  {
    id: 'usb-camera',
    name: 'Waterproof USB Endoscope Camera',
    shortLabel: 'USB Camera',
    summary:
      'Front bracket-mounted epoxy-sealed endoscope module that captures submerged concrete crack imagery for optical sizing.',
    connection: 'Direct shielded USB 2.0 OTG data cable routed up the tether to the shore laptop',
    esp32PinGroup: 'Bypassed to shore laptop USB port (planned wiring, to be confirmed)',
    awsService: 'Amazon S3 (raw inspection frame) → AWS Lambda (OpenCV)',
    zone: 'wet-epoxy-sealed',
    zoneLabel: 'Wet · Epoxy-Sealed',
    explodeOffset: [0, 0.25, 0.95],
  },
  {
    id: 'calibration-lasers',
    name: 'Twin 50 mm Parallel Laser Modules',
    shortLabel: '50 mm Lasers',
    summary:
      'Two laser diodes potted inside plain plastic pen barrels with epoxy seal, spaced at a 50 mm design spacing (verify with calipers) for pixel-to-mm scale.',
    connection: '2-wire 5V DC switched power pair through the umbilical tether',
    esp32PinGroup: 'Switched 5V MOSFET / GPIO25 output (planned wiring, to be confirmed)',
    awsService: 'AWS Lambda (OpenCV dual-dot calibration reference)',
    zone: 'wet-epoxy-sealed',
    zoneLabel: 'Wet · Epoxy-Sealed',
    explodeOffset: [0, 0.65, 0.85],
  },
  {
    id: 'thruster-port',
    name: 'Port Horizontal Pump Thruster',
    shortLabel: 'Port Thruster',
    summary:
      'Shrouded submersible pump thruster on the left flank providing forward thrust and differential yaw steering.',
    connection: '3-wire thruster power + PWM control lead routed to shore ESC/MOSFET driver',
    esp32PinGroup: 'LEDC PWM output GPIO16 via motor driver (planned wiring, to be confirmed)',
    awsService: 'AWS IoT Core (SIMULATED / bench actuator PWM logs)',
    zone: 'wet-epoxy-sealed',
    zoneLabel: 'Wet · Epoxy-Sealed',
    explodeOffset: [-0.95, 0, -0.15],
  },
  {
    id: 'thruster-starboard',
    name: 'Starboard Horizontal Pump Thruster',
    shortLabel: 'Stbd Thruster',
    summary:
      'Shrouded submersible pump thruster on the right flank paired with the port thruster for forward surge and steering.',
    connection: '3-wire thruster power + PWM control lead routed to shore ESC/MOSFET driver',
    esp32PinGroup: 'LEDC PWM output GPIO17 via motor driver (planned wiring, to be confirmed)',
    awsService: 'AWS IoT Core (SIMULATED / bench actuator PWM logs)',
    zone: 'wet-epoxy-sealed',
    zoneLabel: 'Wet · Epoxy-Sealed',
    explodeOffset: [0.95, 0, -0.15],
  },
  {
    id: 'thruster-vertical',
    name: 'Vertical Dive Pump Thruster',
    shortLabel: 'Vertical Thruster',
    summary:
      'Centerline vertical pump thruster controlling dive depth and shallow-water (~1 m) vertical station-keeping.',
    connection: '2-wire bidirectional pump power / PWM lead inside the umbilical tether',
    esp32PinGroup: 'LEDC PWM output GPIO18 via H-bridge/ESC (planned wiring, to be confirmed)',
    awsService: 'AWS IoT Core (heave trim telemetry)',
    zone: 'wet-epoxy-sealed',
    zoneLabel: 'Wet · Epoxy-Sealed',
    explodeOffset: [0, 1.05, 0],
  },
  {
    id: 'piezo-hydrophone',
    name: 'Piezo Hydrophone Acoustic Disc',
    shortLabel: 'Piezo (ADC1)',
    summary:
      'Compact epoxy-sealed piezoelectric disc bonded to the lower frame to listen for pressurized seepage hiss near wall cracks.',
    connection: 'Shielded twisted-pair analog signal lead with conditioning resistor network to ESP32',
    esp32PinGroup: 'ADC1 analog input GPIO34 / ADC1_CH6 (planned wiring, to be confirmed)',
    awsService: 'AWS IoT Core → Amazon DynamoDB (acoustic seepage score)',
    zone: 'wet-epoxy-sealed',
    zoneLabel: 'Wet · Epoxy-Sealed',
    explodeOffset: [0.45, -0.85, 0.35],
  },
  {
    id: 'pressure-sensor',
    name: 'Pressure / Depth Sensor',
    shortLabel: 'Pressure Sensor',
    summary:
      'Epoxy-sealed hydrostatic transducer estimating shallow-water depth (~1 m) via surface-zeroed water pressure.',
    connection: 'Shielded 3.3V / GND / signal wires routed through tether to ESP32 analog rail',
    esp32PinGroup: 'ADC1 analog input GPIO35 / ADC1_CH7 (planned wiring, to be confirmed)',
    awsService: 'AWS IoT Core → Amazon DynamoDB (depth telemetry)',
    zone: 'wet-epoxy-sealed',
    zoneLabel: 'Wet · Epoxy-Sealed',
    explodeOffset: [-0.45, 0.85, -0.35],
  },
  {
    id: 'tether-cable',
    name: 'Wired Umbilical Tether Cable',
    shortLabel: 'Tether',
    summary:
      'Bundled wired umbilical carrying USB camera video, sensor wires, and thruster power because radio/Wi-Fi does not penetrate water.',
    connection: 'Strain-relieved rear frame exit terminating cleanly at the dry topside bench',
    esp32PinGroup: 'Breaks out to ESP32 ADC1/PWM headers + laptop USB (planned wiring, to be confirmed)',
    awsService: 'Physical bridge feeding AWS IoT Core & Amazon S3 via shore unit',
    zone: 'wet-epoxy-sealed',
    zoneLabel: 'Wet-to-Dry Umbilical',
    explodeOffset: [0, 0.1, -0.55],
  },
  {
    id: 'shore-unit',
    name: 'Dry Topside Shore Unit (Laptop + ESP32)',
    shortLabel: 'Shore Unit',
    summary:
      'Topside field laptop and ESP32 controller kept completely dry above water to drive thrusters, sample sensors, and upload telemetry.',
    connection: 'USB-C serial link between ESP32 and laptop; Wi-Fi/LTE uplink from laptop to AWS',
    esp32PinGroup: 'ESP32-WROOM DevKit ADC1 & PWM GPIO headers (planned wiring, to be confirmed)',
    awsService: 'AWS IoT Core (MQTT) & HTTP API Gateway / Amazon S3',
    zone: 'dry-topside',
    zoneLabel: 'Dry Topside: Not Underwater',
    explodeOffset: [0, 0.35, -1.15],
  },
];

export const CAMERA_PRESETS: readonly CameraPresetSpec[] = [
  {
    id: 'iso',
    label: 'Reset View',
    description: 'Three-quarter CAD overview showing ROV frame, 50 mm laser target, and tether.',
    position: [4.95, 2.75, 5.45],
    target: [-0.1, 0.08, 0.2],
  },
  {
    id: 'front',
    label: 'Front',
    description: 'Front-quarter view of USB endoscope camera, twin 50 mm lasers, and calibration dots.',
    position: [2.05, 0.88, 5.15],
    target: [0, 0.18, 2.05],
  },
  {
    id: 'side',
    label: 'Side',
    description: 'Profile view of open PVC runners, drain holes, and vertical thruster.',
    position: [5.8, 0.85, 0.1],
    target: [0, 0.1, 0.25],
  },
  {
    id: 'top',
    label: 'Top',
    description: 'Overhead plan view showing symmetrical 50 mm laser axis and twin horizontal thrusters.',
    position: [0.01, 6.4, 0.45],
    target: [0, 0, -0.25],
  },
  {
    id: 'shore',
    label: 'Shore',
    description: 'Close-up on the umbilical tether termination and dry topside laptop + ESP32 unit.',
    position: [1.55, 2.25, -2.15],
    target: [-1.05, -0.15, -4.95],
  },
];

export function getPartSpecById(id: Rov3DPartId): Rov3DPartSpec {
  return ROV_3D_PARTS.find((p) => p.id === id) ?? ROV_3D_PARTS[0];
}

export function getCameraPresetById(id: CameraPresetId): CameraPresetSpec {
  return CAMERA_PRESETS.find((p) => p.id === id) ?? CAMERA_PRESETS[0];
}

export function computeThrusterTestTelemetry(
  elapsedSec: number,
  active: boolean,
): ThrusterTestTelemetry {
  if (!active) {
    return {
      active: false,
      portHorizontalPct: 0,
      starboardHorizontalPct: 0,
      verticalDivePct: 0,
      horizontalSpinRadPerSec: 0,
      verticalSpinRadPerSec: 0,
      maneuverLabel: 'Standby (All rotors stopped)',
    };
  }

  const cycle = Math.max(0, elapsedSec) % 9;
  if (cycle < 3) {
    return {
      active: true,
      portHorizontalPct: 68,
      starboardHorizontalPct: 68,
      verticalDivePct: 22,
      horizontalSpinRadPerSec: 18,
      verticalSpinRadPerSec: 6,
      maneuverLabel: 'Forward Surge + Light Trim (SIMULATED)',
    };
  }
  if (cycle < 6) {
    return {
      active: true,
      portHorizontalPct: 74,
      starboardHorizontalPct: 36,
      verticalDivePct: 35,
      horizontalSpinRadPerSec: 16,
      verticalSpinRadPerSec: 9,
      maneuverLabel: 'Differential Yaw Trim (SIMULATED)',
    };
  }
  return {
    active: true,
    portHorizontalPct: 28,
    starboardHorizontalPct: 28,
    verticalDivePct: 76,
    horizontalSpinRadPerSec: 8,
    verticalSpinRadPerSec: 21,
    maneuverLabel: 'Vertical Dive Sweep (~1 m depth, SIMULATED)',
  };
}
