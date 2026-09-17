export const FIXED_DT = 1 / 120

/** Where the pavement starts. Everything else is measured from it. */
export const LANE_Y = [2.2]
/**
 * Sea level, fixed. Anchoring the beach to the pavement made the whole world
 * slide down a stair set with the player, which is backwards: he descends
 * toward the water, the water does not follow him.
 */
export const WORLD_FLOOR = -22
export const DEATH_Y = 0

/** How much road the window shows at once, in metres. */
export const VIEW_WIDTH = 34
/** Where the skater sits in the window. He never leaves this column. */
export const ANCHOR = 0.3

export const GRAVITY = 30
export const JUMP_SPEED = 7.4
/** Releasing the jump key early cuts the rise short. */
export const JUMP_CUT = 0.52

/**
 * Speed, in metres per second, and a skater's rather than a car's. Cruising is
 * around thirty kilometres an hour and bombing a hill reaches sixty, which is
 * what those numbers mean on a board. The world is what got bigger instead.
 */
export const START_SPEED = 8
export const MIN_SPEED = 4
export const MAX_SPEED = 17
/** One push is an impulse, not a throttle, so it reads as a kick. */
export const PUSH_IMPULSE = 2.4
export const PUSH_COOLDOWN = 0.46
export const BRAKE_ACCEL = 7
/** Rolling friction, which is why you have to keep pushing. */
export const DRAG_BASE = 0.7
export const DRAG_SPEED = 0.022
/** How hard a slope pulls him along it. */
export const SLOPE_PULL = 14

/** Sparks per second on a rail. Concrete throws none, which is the tell. */
export const SPARK_RATE = 120

/** Radians per second of spin while the rotate input is held. */
export const SPIN_RATE = 11.5
/** Past this far from a half turn, the landing is a bail. */
export const LANDING_TOLERANCE = 0.42
/** What a bail costs. Nothing is fatal, so speed is the price. */
export const BAIL_SPEED_KEEP = 0.5

/** One full revolution of a kickflip. */
export const FLIP_DURATION = 0.42


/**
 * How fast a lane change crosses. It runs at a fixed speed and stops exactly
 * on the lane, so every change puts him on a middle rather than near one.
 */
export const LANE_SPEED = 15
