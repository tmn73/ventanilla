export const FIXED_DT = 1 / 120

/** Height of each ridable lane, in metres. Index 0 is the dirt verge. */
export const LANE_Y = [0, 2.6, 5.2, 7.8]

/** How much road the window shows at once, in metres. */
export const VIEW_WIDTH = 36
/** Where the car sits inside the window, as a fraction of its width. */
export const ANCHOR = 0.3
/** The skater dies past this fraction on the left, and cannot pass it on the right. */
export const TRAIL_LIMIT = 0.02
export const LEAD_LIMIT = 0.86

export const GRAVITY = 30
export const JUMP_SPEED = 13.5
/** Releasing the jump key early cuts the rise short. */
export const JUMP_CUT = 0.45
export const DIVE_ACCEL = 48

export const CAR_START = 18

/** Speed a lane gives back per second while the skater grinds it. */
export const GRIND_ACCEL = [0, 2.0, 3.6, 5.6]
/** The dirt verge always costs speed, which is why you climb. */
export const GROUND_DRAG = 6
export const AIR_DRAG = 0.7
export const LANDING_BOOST = 3.4
export const MAX_AIR_CREDIT = 1.2

export const SPEED_FLOOR = 4
export const SPEED_LEAD_CAP = 10
