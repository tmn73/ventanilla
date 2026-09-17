import { Color } from 'three'

/**
 * Five values and one accent. The accent marks everything the player can ride
 * and nothing else, so the question "can I get on that" is answered by colour
 * alone and never depends on the angle or the light.
 */
export const SKY = '#dfe3e4'
export const GROUND = '#c9c6bf'
export const WATER = '#aebcbb'

export const PAVING = '#b3ac9f'

/** Ridable. The accent, and the one dark for metal. */
export const SURFACE_COLOR: Record<string, string> = {
  flat: '#bcb9b2',
  step: '#b3b0a9',
  ledge: '#e2603c',
  hubba: '#d4562f',
  rail: '#3a4045',
}

/** The sunlit top of each, which is the edge you actually aim at. */
export const EDGE_COLOR: Record<string, string> = {
  flat: '#d2ccc0',
  step: '#d8d1c3',
  ledge: '#f6a184',
  hubba: '#f09878',
  rail: '#8d979e',
}

export const KERB = '#cec7ba'
export const WALL = '#bdb6a9'
export const CONTACT = '#8f8879'
export const POST_COLOR: Record<string, string> = { rail: '#4a5157' }

export const SPARK_COLOR = '#ffffff'
export const SKATER = '#24282b'
export const BOARD = '#e2603c'
export const GRIP = '#1a1d1f'
export const WHEEL_COLOR = '#6f7378'

/** Kept so the sky plane can still carry a faint vertical lift. */
export const SKY_STOPS: Array<[number, string]> = [
  [0.0, '#eef1f1'],
  [1.0, SKY],
]

export function skyAt(t: number, out: Color): Color {
  return out.set(SKY_STOPS[0]![1]).lerp(new Color(SKY_STOPS[1]![1]), t)
}
