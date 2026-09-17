import { Color } from 'three'

/**
 * One value ladder, from the haze at the back to the dead floor at the front.
 * Nothing is pure black: depth comes from separation, not from darkness.
 */
export const SKY_STOPS: Array<[number, string]> = [
  [0.0, '#f7c98a'],
  [0.12, '#e08a4e'],
  [0.34, '#b8566a'],
  [0.62, '#45356b'],
  [1.0, '#1a1b3a'],
]

export const RIDGE_FAR = '#4a4378'
export const RIDGE_MID = '#332c58'
export const RIDGE_NEAR = '#231d3e'

/** The floor is the darkest thing on screen, because touching it ends the run. */
export const VERGE = '#191428'
export const TUFT = '#241c3c'
/** The road itself: gravel shoulder, painted edge line, then asphalt. */
export const ROAD_LINE = '#c9bfa6'
export const ASPHALT = '#0e0d16'
/** Buildings between the hills and the roadside, for one more depth step. */
export const BUILDING = '#1d1833'

/** Ridable bodies sit above the floor in value, so they read as objects. */
export const SURFACE_COLOR: Record<string, string> = {
  rail: '#2b2442',
  wall: '#262039',
  wire: '#332b4e',
  vehicle: '#342744',
}

/** The lit top edge is the affordance. It brightens with the lane. */
export const EDGE_COLOR: Record<string, string> = {
  rail: '#dba073',
  wall: '#f0bf8e',
  wire: '#ffe4b8',
  vehicle: '#c98a5e',
}

export const POST_COLOR: Record<string, string> = {
  rail: '#1d1830',
  wire: '#211b36',
}

/** Block seams, so a parapet reads as masonry and not as a rectangle. */
export const JOINT = '#3a3159'

/** Sparks brighten with the lane too, which is the only hint the player needs. */
export const SPARK_COLOR = ['#ffd9a0', '#ffc879', '#fff3d2']
export const DUST = '#6b5a52'

/**
 * Hazards are not colour coded. You avoid a lamppost because you recognise a
 * lamppost. What makes them legible is that the lamp is lit and the sign is
 * retroreflective, which is true of the real things.
 */
export const PROP_BODY = '#1a1530'
export const LAMP_GLOW = '#ffd18a'
export const SIGN_FACE = '#cec3dc'
export const FROND = '#241d3c'

export const WHEEL_COLOR = '#6d5f80'
export const SKATER = '#fff4dd'
export const BOARD = '#ffb45e'
/** The grip tape side, seen when a kickflip turns the deck over. */
export const GRIP = '#2f2438'

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
