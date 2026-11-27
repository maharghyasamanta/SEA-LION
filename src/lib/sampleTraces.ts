/**
 * Reference crack traces for the public-domain demonstration photos.
 *
 * These are *operator traces*, not automatic detections. Each polyline follows
 * the visible crack centreline in the published photo. The Lambda measures the
 * dark aperture along the trace with perpendicular intensity profiles.
 *
 * The traces are normalized to the image (0..1), so they survive resizing.
 * The suggested scale is a demo assumption only. Field users must enter a
 * scale from a ruler, laser dots, or a calibrated reference target.
 */

export type NormalizedPoint = [number, number];

export interface ReferenceSample {
  id: string;
  path: string;
  label: string;
  description: string;
  trace: NormalizedPoint[];
  suggestedScaleMmPerPx: number;
  credit: string;
  license: string;
  sourceUrl: string;
}

export const REFERENCE_SAMPLES: readonly ReferenceSample[] = [
  {
    id: 'ref-c01',
    path: '/samples/crack-c01-minor.jpg',
    label: 'Vertical wall crack (reference photo)',
    description:
      'Close-up of a vertical crack in a concrete retaining wall. The trace follows the visible aperture; the scale is a demo assumption.',
    trace: [
      [0.47, 0.25],
      [0.475, 0.32],
      [0.48, 0.38],
      [0.485, 0.44],
      [0.49, 0.5],
      [0.495, 0.56],
      [0.5, 0.62],
      [0.5, 0.68],
      [0.49, 0.73],
    ],
    suggestedScaleMmPerPx: 0.2,
    credit: 'Detail of vertical crack in concrete retaining wall, Medway Park, UK',
    license: 'CC0 1.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Detail_of_vertical_crack_in_concrete_retaining_wall_at_Medway_Park_Sports_Centre,_Gillingham,_Kent,_England.jpg',
  },
  {
    id: 'ref-c02',
    path: '/samples/crack-c02-moderate.jpg',
    label: 'Bridge-pier horizontal crack (reference photo)',
    description:
      'Historic bridge-pier inspection photo with a horizontal crack at the wall/soil interface. The trace follows the dark aperture.',
    trace: [
      [0.15, 0.56],
      [0.25, 0.565],
      [0.35, 0.57],
      [0.45, 0.575],
      [0.55, 0.58],
      [0.65, 0.585],
      [0.75, 0.59],
      [0.85, 0.6],
    ],
    suggestedScaleMmPerPx: 0.2,
    credit: 'Close view of crack in concrete at base of highway bridge pier no. 2 (NARA 294290)',
    license: 'Public domain',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Close_view_of_crack_in_concrete_on_east_side_of_highway_bridge_pier_no._2_-_NARA_-_294290.jpg',
  },
  {
    id: 'ref-c03',
    path: '/samples/crack-c03-leak.jpg',
    label: 'Dam concrete crack (reference photo)',
    description:
      'Historic dam concrete inspection photo with a wide, branching crack. The trace follows the main diagonal branch.',
    trace: [
      [0.43, 0.03],
      [0.45, 0.1],
      [0.47, 0.17],
      [0.49, 0.24],
      [0.51, 0.31],
      [0.53, 0.38],
      [0.54, 0.45],
      [0.52, 0.5],
      [0.47, 0.53],
      [0.42, 0.56],
      [0.38, 0.62],
      [0.36, 0.7],
      [0.35, 0.8],
      [0.34, 0.9],
      [0.33, 0.96],
    ],
    suggestedScaleMmPerPx: 0.2,
    credit: 'White Clay Dam — cracking concrete (DPLA)',
    license: 'Public domain',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Project_(White_Clay_Dam_-_Cracking_Concrete)_-_DPLA_-_938b5374264a472e64d91d66bb403f0d.jpg',
  },
  {
    id: 'ref-c04',
    path: '/samples/crack-c04-critical.jpg',
    label: 'Dam spillway extensional crack (reference photo)',
    description:
      '1989 Loma Prieta earthquake damage to the Austrian Dam spillway. The published caption records extensional cracks up to 12 cm wide.',
    trace: [
      [0.435, 0.01],
      [0.43, 0.06],
      [0.425, 0.12],
      [0.425, 0.18],
      [0.43, 0.24],
      [0.435, 0.3],
      [0.44, 0.36],
      [0.445, 0.42],
      [0.45, 0.48],
      [0.455, 0.54],
    ],
    suggestedScaleMmPerPx: 0.2,
    credit: 'Austrian Dam spillway extensional cracks, 1989 Loma Prieta earthquake (USGS)',
    license: 'CC BY 2.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:1989_Loma_Prieta_Earthquake_-_prominent_N_15_degrees_W-trending_extensional_cracks_up_to_12_centimeters_(4.7_inches)_wide_in_the_concrete_spillway_to_Austrian_Dam.jpg',
  },
] as const;

export function getReferenceSample(path: string): ReferenceSample | undefined {
  return REFERENCE_SAMPLES.find((sample) => sample.path === path);
}

export function isReferenceSample(path: string): boolean {
  return REFERENCE_SAMPLES.some((sample) => sample.path === path);
}
