export const FIXED_DT = 1 / 120

/** Where the pavement starts. Everything else is measured from it. */
export const LANE_Y = [2.2]
export const DEATH_Y = 0

/** How much road the window shows at once, in metres. */
export const VIEW_WIDTH = 34
/** Where the skater sits in the window. He never leaves this column. */
export const ANCHOR = 0.3

export const GRAVITY = 30
export const JUMP_SPEED = 8.6
/** Releasing the jump key early cuts the rise short. */
export const JUMP_CUT = 0.52

/** Speed, in metres per second. He rolls forever, but only pushing keeps pace. */
export const START_SPEED = 11
export const MIN_SPEED = 6.5
export const MAX_SPEED = 22
/** One push is an impulse, not a throttle, so it reads as a kick. */
export const PUSH_IMPULSE = 3.2
export const PUSH_COOLDOWN = 0.4
export const BRAKE_ACCEL = 11
/** Rolling friction, which is why you have to keep pushing. */
export const DRAG_BASE = 1.05
export const DRAG_SPEED = 0.022
/** How hard a slope pulls him along it. */
export const SLOPE_PULL = 18

/** Sparks per second on a rail. Concrete throws none, which is the tell. */
export const SPARK_RATE = 120

/** One full revolution of a kickflip. */
export const FLIP_DURATION = 0.42

