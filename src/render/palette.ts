import { Color } from 'three'

/**
 * The coast road between Santa Marta and Tayrona, at midday. The stack runs
 * from the tarmac at your feet to the Sierra Nevada behind the bay, and every
 * band sits at its own value so the ridable surfaces stay readable on top.
 */
export const SKY_STOPS: Array<[number, string]> = [
  [0.0, '#fdf0d0'],
  [0.16, '#cfe9f2'],
  [0.42, '#7cc9e8'],
  [0.72, '#3ba2d8'],
  [1.0, '#1c7cc0'],
]

/** Hazed by distance: the snow line of the Sierra sits above the bay. */
export const SIERRA = '#9dbdd4'
export const SIERRA_SNOW = '#eef4f8'
/** Jungle headlands across the water, then the near one. */
export const HEADLAND = '#5f9c85'
export const JUNGLE = '#2f6f54'

export const SEA = '#1fbcc4'
export const SEA_DEEP = '#0f93a4'
export const FOAM = '#c6f2ec'
export const SAND = '#ecd7a8'
/** The street and the ground the town stands on, behind the promenade. */
export const STREET = '#8e8c93'
export const TOWN = '#b8ae97'
export const SAND_WET = '#d8bd85'
/** Palms along the promenade, between the water and the Sierra. */
export const PALM_TRUNK = '#6b5335'
export const PALM_CROWN = '#2f8a4f'

/** Sides sit in shadow, tops catch the sun. That pair reads on any band. */
export const SURFACE_COLOR: Record<string, string> = {
  flat: '#ddd2b4',
  step: '#cabd9c',
  ledge: '#e0d4b4',
  hubba: '#dbcfae',
  rail: '#6a7783',
}

export const EDGE_COLOR: Record<string, string> = {
  flat: '#e6dcc8',
  step: '#ddd2bd',
  ledge: '#f1e7d3',
  hubba: '#ece1cb',
  rail: '#ffffff',
}

export const POST_COLOR: Record<string, string> = {
  rail: '#5b6874',
}

/** Block seams, so a parapet reads as masonry and not as a rectangle. */
export const JOINT = '#6f6450'

export const SPARK_COLOR = '#fff0c0'
export const DUST = '#c9b48d'

/**
 * Hazards are not colour coded. You avoid a palm because you recognise a palm.
 * The sign works because it is retroreflective, which is true of the real one.
 */
export const HYDRANT = '#c2402f'
export const HYDRANT_CAP = '#8f2b1f'
export const BIN = '#3f6b4a'
export const BIN_LID = '#2d4e36'
export const PROP_BODY = '#5c4633'
export const LAMP_GLOW = '#4a5560'
export const SIGN_FACE = '#f4f7f9'
export const FROND = '#2f8a4f'

/** Everything along the back of the plaza. It exists to break up the sand. */
export const PALM_TRUNK_NEAR = '#7a5f3c'
export const PALM_CROWN_NEAR = '#2f9e57'
export const BENCH = '#b3552f'
export const BENCH_LEG = '#4a4a52'
export const UMBRELLA = ['#e8483c', '#f2b23c', '#3aa9c4', '#e8dcc4']
export const UMBRELLA_POLE = '#d6cdb8'
/** The joint between paving slabs. */
export const PAVING = '#b9ab8b'
/** The kerb that runs each edge of the promenade, and the wall under it. */
export const KERB = '#efe4c6'
export const WALL = '#c3b795'

export const WHEEL_COLOR = '#2b2a33'
export const SKATER = '#fffaf0'
export const BOARD = '#ff7a3d'
/** The grip tape side, seen when a kickflip turns the deck over. */
export const GRIP = '#2b2731'

/** Samples the sky at t, where 0 is the horizon and 1 is the top. */
export function skyAt(t: number, out: Color): Color {
  let lower = SKY_STOPS[0]!
  let upper = SKY_STOPS[SKY_STOPS.length - 1]!
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const a = SKY_STOPS[i]!
    const b = SKY_STOPS[i + 1]!
    if (t >= a[0] && t <= b[0]) {
      lower = a
      upper = b
      break
    }
  }
  const span = upper[0] - lower[0]
  const k = span === 0 ? 0 : (t - lower[0]) / span
  return out.set(lower[1]).lerp(new Color(upper[1]), k)
}
