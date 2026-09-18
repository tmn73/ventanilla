import { Color } from 'three'

/**
 * Five values and one accent. The accent marks everything the player can ride
 * and nothing else, so the question "can I get on that" is answered by colour
 * alone and never depends on the angle or the light.
 */
export const SKY = '#e7e2d8'
export const GROUND = '#aab2b8'
export const WATER = '#aebcbb'

export const PAVING = '#b3ac9f'

/** Ridable. The accent, and the one dark for metal. */
export const SURFACE_COLOR: Record<string, string> = {
  flat: '#c7ccd0',
  step: '#b0b7bc',
  ledge: '#ff6b2c',
  hubba: '#e8541d',
  rail: '#1d2226',
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
export const SKATER = '#15181b'
/**
 * The rider is one dark shape, and mirrored he was the same shape. These two
 * break the symmetry on the axis that matters: the face says which way he
 * looks, the leading arm says which way he travels.
 */
export const SKATER_FACE = '#8d8a84'
export const SKATER_LEAD = '#4c545c'
/**
 * The cap. Light against a dark body, because at this size a shade off the
 * body is four pixels of almost the same grey and reads as nothing at all.
 */
export const SKATER_CAP = '#ddd8cf'
export const BOARD = '#ff6b2c'
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

/**
 * The gesture trail. A swipe that took is the accent, the same colour as
 * everything you can ride. A swipe the game did nothing with is cold and
 * dashed, so it reads as a miss without depending on telling hues apart.
 */
export const TRAIL_COLOR = { took: '#e2603c', missed: '#7b8590' }

/** The lamps. One warm light and the bulb it comes out of. */
export const LAMP_LIGHT = 0xffd9a8
export const LAMP_GLOW = 0xfff1d6

/**
 * The sky. Sampled from the photograph's own sky so the join above it cannot
 * be seen: the backdrop covers the lower half of the window and this covers
 * the rest, and two different greys there would read as a band.
 */
export const SKY_TOP = '#dde5ea'
/** And what it deepens to overhead. */
export const SKY_HIGH = '#b4c0c9'

/** The joints between paving slabs. They are how fast the road is going. */
export const JOINT_COLOR = '#a8aeb2'
