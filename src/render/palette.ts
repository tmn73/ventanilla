import { Color } from 'three'

/** Dusk over the cordillera. Everything beside the road reads as silhouette. */
export const SKY_STOPS: Array<[number, string]> = [
  [0.0, '#f5c07a'],
  [0.12, '#e08a4e'],
  [0.34, '#b8566a'],
  [0.62, '#45356b'],
  [1.0, '#1a1b3a'],
]

export const RIDGE_FAR = '#2e2a4d'
export const RIDGE_NEAR = '#1b1a33'
export const VERGE = '#0a0912'
export const TUFT = '#161128'

export const SURFACE_COLOR: Record<string, string> = {
  rail: '#16121f',
  wall: '#120f1b',
  wire: '#241f36',
  vehicle: '#261a30',
}

/** A lit lip on every ridable top edge, so the player can read the line. */
export const EDGE_COLOR: Record<string, string> = {
  rail: '#8f7bb0',
  wall: '#a08bc4',
  wire: '#d8c2f0',
  vehicle: '#c08a6a',
}

export const POST_COLOR: Record<string, string> = {
  rail: '#0d0b14',
  wire: '#100d18',
}

/** Sparks get brighter as the lane gets higher, which is the only hint needed. */
export const SPARK_COLOR = ['#ffd9a0', '#ffc879', '#fff3d2']
export const DUST = '#6b5a52'

export const WHEEL_COLOR = '#0a0810'
export const SKATER = '#ffe9c4'
export const BOARD = '#e8b478'

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
