import { Color } from 'three'

/** Dusk over the cordillera. Everything on the roadside reads as silhouette. */
export const SKY_STOPS: Array<[number, string]> = [
  [0.0, '#f5c07a'],
  [0.12, '#e08a4e'],
  [0.34, '#b8566a'],
  [0.62, '#45356b'],
  [1.0, '#1a1b3a'],
]

export const RIDGE_FAR = '#2e2a4d'
export const RIDGE_NEAR = '#1b1a33'

export const SURFACE_COLOR: Record<string, string> = {
  ground: '#0b0a14',
  rail: '#15131f',
  wall: '#100f1a',
  wire: '#2b2740',
  vehicle: '#241a2e',
}

export const SKATER = '#ffe9c4'

/** Samples the gradient at t, where 0 is the horizon and 1 is the top of the sky. */
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
