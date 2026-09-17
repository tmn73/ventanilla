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

export const CAR_START = 10
/** The slowest the car ever goes. Gaps are sized against this, so a jump always clears. */
export const CAR_SLOWEST = 8

/** Sparks per second on a rail. Concrete throws none, which is the tell. */
export const SPARK_RATE = 120

/** One full revolution of a kickflip. */
export const FLIP_DURATION = 0.42

