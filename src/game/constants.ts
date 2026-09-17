export const FIXED_DT = 1 / 120

/** Ridable heights, in metres. Touching anything below the lowest one ends the run. */
export const LANE_Y = [1.4, 3.6, 5.8]
export const DEATH_Y = 0.35

/** How much road the window shows at once, in metres. */
export const VIEW_WIDTH = 30
/** Where the skater sits in the window. He never leaves this column. */
export const ANCHOR = 0.36

export const GRAVITY = 30
export const JUMP_SPEED = 13.6
/** Releasing the jump key early cuts the rise short. */
export const JUMP_CUT = 0.45
export const DIVE_ACCEL = 48

export const CAR_START = 15
/** The slowest the car ever goes. Gaps are sized against this, so a jump always clears. */
export const CAR_SLOWEST = 12

/** Sparks per second while grinding, by lane. Higher lanes throw more. */
export const SPARK_RATE = [40, 75, 130]

/** One full revolution of a kickflip. */
export const FLIP_DURATION = 0.42

/** How long the fall plays before the run is called. */
export const FALL_GRACE = 1.15
