import { CAR_SLOWEST, GRAVITY, JUMP_SPEED, LANE_Y, VIEW_WIDTH } from './constants'
import { range } from '../core/rng'

export type SurfaceKind = 'rail' | 'wall' | 'wire' | 'vehicle'
export type ObstacleKind = 'post' | 'sign' | 'palm'

export interface Segment {
  x0: number
  x1: number
  /** Height at each end. When they differ the surface is a ramp. */
  y0: number
  y1: number
  lane: number
  kind: SurfaceKind
  /** Metres per second. Only vehicles move. */
  vx: number
}

/** Something standing on a lane. You cannot land on it, so you jump it. */
export interface Obstacle {
  x: number
  halfWidth: number
  base: number
  height: number
  kind: ObstacleKind
}

const KIND_OF_LANE: SurfaceKind[] = ['rail', 'wall', 'wire']

/**
 * Metal is ground on and throws sparks. Concrete and truck roofs are flat, so
 * you roll on them and the trick becomes a manual. The missing sparks are how
 * the player feels the difference.
 */
export const GRINDABLE: Record<SurfaceKind, boolean> = {
  rail: true,
  wire: true,
  wall: false,
  vehicle: false,
}

/** Height of a surface at a point along it. */
export function surfaceYAt(segment: Segment, x: number): number {
  const span = segment.x1 - segment.x0
  if (span <= 0) return segment.y0
  const t = Math.min(1, Math.max(0, (x - segment.x0) / span))
  return segment.y0 + (segment.y1 - segment.y0) * t
}

/** Rise over run. Multiply by the speed to get the vertical rate. */
export function slopeOf(segment: Segment): number {
  const span = segment.x1 - segment.x0
  return span <= 0 ? 0 : (segment.y1 - segment.y0) / span
}

/** Air time of a full jump, up and back down to the same height. */
const HANG = (2 * JUMP_SPEED) / GRAVITY
/** Gaps are sized against the slowest the car ever goes, so they always clear. */
const SAFE_REACH = HANG * CAR_SLOWEST
/** A board will not hold past this. Roughly 20 degrees. */
const MAX_SLOPE = 0.36

const LOOKAHEAD = VIEW_WIDTH * 2.5
const TRAIL = VIEW_WIDTH * 0.8
const OBSTACLE_KINDS: ObstacleKind[] = ['post', 'sign', 'palm']
/** Clear room either side, so the player lands, reads it, and jumps. */
const OBSTACLE_MARGIN = 7

export class Road {
  segments: Segment[] = []
  obstacles: Obstacle[] = []

  /** The end of the guaranteed route: where it stops and at what height. */
  private headX = 0
  private headY = LANE_Y[0]!

  constructor(
    private rng: () => number,
    private carSpeed: () => number,
  ) {}

  reset(startX: number): void {
    this.segments = []
    this.obstacles = []
    this.headY = LANE_Y[0]!
    // A guaranteed platform under the spawn, or the run ends before it begins.
    this.push(startX - 10, startX + 17, this.headY, this.headY, 0)
    this.headX = startX + 17 + 4
  }

  /**
   * Lays one continuous, always-jumpable route, then scatters optional
   * surfaces around it. Height now changes two ways: a ramp inside a segment,
   * or a jump across the gap between two.
   */
  ensureAhead(x: number): void {
    const limit = x + LOOKAHEAD
    while (this.headX < limit) {
      const run = range(this.rng, 11, 30)
      const x0 = this.headX
      const startY = this.headY
      const endY = this.rampTo(startY, run)

      this.push(x0, x0 + run, startY, endY, this.laneOf(startY))
      this.plant(x0, x0 + run, startY, endY)
      this.scatter(x0, x0 + run, this.laneOf(startY))

      // Where the next surface begins, and how far the gap can be.
      const landing = this.hopTo(endY)
      const climb = landing - endY
      const budget = SAFE_REACH * (climb > 0.4 ? 0.36 : climb < -0.4 ? 0.6 : 0.48)
      this.headX = x0 + run + range(this.rng, 2.6, Math.max(3.2, budget))
      this.headY = landing
    }
  }

  /** The height this segment climbs or drops to, inside what a board holds. */
  private rampTo(startY: number, run: number): number {
    if (this.rng() < 0.45) return startY
    const step = this.rng() < 0.5 ? -1 : 1
    const target = this.nearestLane(startY + step * 2.2)
    if (Math.abs(target - startY) / run > MAX_SLOPE) return startY
    return target
  }

  /** The height of the next surface across the gap. */
  private hopTo(endY: number): number {
    const roll = this.rng()
    let target = endY
    if (roll < 0.3) target = endY - 2.2
    else if (roll < 0.6) target = endY + 2.2
    return this.nearestLane(target)
  }

  private nearestLane(y: number): number {
    let best = LANE_Y[0]!
    for (const lane of LANE_Y) {
      if (Math.abs(lane - y) < Math.abs(best - y)) best = lane
    }
    return best
  }

  private laneOf(y: number): number {
    let best = 0
    for (let i = 0; i < LANE_Y.length; i++) {
      if (Math.abs(LANE_Y[i]! - y) < Math.abs(LANE_Y[best]! - y)) best = i
    }
    return best
  }

  /** Drops a blocker in the middle of a long run, never near its edges. */
  private plant(x0: number, x1: number, y0: number, y1: number): void {
    const room = x1 - x0 - OBSTACLE_MARGIN * 2
    if (room < 4) return
    if (this.rng() > 0.55) return
    const kind = OBSTACLE_KINDS[Math.floor(this.rng() * OBSTACLE_KINDS.length)]!
    const x = x0 + OBSTACLE_MARGIN + this.rng() * room
    const t = (x - x0) / (x1 - x0)
    this.obstacles.push({
      x,
      halfWidth: kind === 'palm' ? 0.28 : 0.22,
      base: y0 + (y1 - y0) * t,
      height: kind === 'sign' ? 2.1 : kind === 'palm' ? 2.8 : 1.5,
      kind,
    })
  }

  /** Optional surfaces beside the route. Riding them is a choice, never a must. */
  private scatter(x0: number, x1: number, routeLane: number): void {
    for (let lane = 0; lane < LANE_Y.length; lane++) {
      if (lane === routeLane) continue
      if (this.rng() > 0.45) continue
      const start = x0 + range(this.rng, 0, (x1 - x0) * 0.4)
      const end = Math.min(x1 + range(this.rng, -2, 8), start + range(this.rng, 8, 24))
      if (end - start < 6) continue
      const y = LANE_Y[lane]!
      const drop = this.rng() < 0.3 ? (this.rng() < 0.5 ? -1.4 : 1.4) : 0
      const endY = Math.abs(drop) / (end - start) > MAX_SLOPE ? y : y + drop
      this.push(start, end, y, endY, lane)
    }
    if (this.rng() < 0.22) this.spawnVehicle(x1 + range(this.rng, 1, 5))
  }

  private push(x0: number, x1: number, y0: number, y1: number, lane: number): void {
    this.segments.push({ x0, x1, y0, y1, lane, kind: KIND_OF_LANE[lane]!, vx: 0 })
  }

  private spawnVehicle(x0: number): void {
    const y = LANE_Y[0]! - 0.55
    this.segments.push({
      x0,
      x1: x0 + range(this.rng, 8, 15),
      y0: y,
      y1: y,
      lane: 0,
      kind: 'vehicle',
      vx: this.carSpeed() * range(this.rng, 0.78, 1.1),
    })
  }

  step(dt: number): void {
    for (const segment of this.segments) {
      if (segment.vx === 0) continue
      segment.x0 += segment.vx * dt
      segment.x1 += segment.vx * dt
    }
  }

  prune(x: number): void {
    const cutoff = x - TRAIL
    this.segments = this.segments.filter((s) => s.x1 > cutoff)
    this.obstacles = this.obstacles.filter((o) => o.x + 2 > cutoff)
  }

  /** Highest surface crossed while falling from fromY to toY, or null in open air. */
  landingAt(x: number, fromY: number, toY: number): Segment | null {
    let best: Segment | null = null
    let bestY = -Infinity
    for (const segment of this.segments) {
      if (x < segment.x0 || x > segment.x1) continue
      const top = surfaceYAt(segment, x)
      if (top > fromY + 1e-4 || top < toY - 1e-4) continue
      if (top > bestY) {
        best = segment
        bestY = top
      }
    }
    return best
  }

  stillCarries(segment: Segment, x: number): boolean {
    return x >= segment.x0 && x <= segment.x1
  }

  /** True when this point is inside something standing on a lane. */
  blockedAt(x: number, y: number): boolean {
    for (const obstacle of this.obstacles) {
      if (Math.abs(x - obstacle.x) > obstacle.halfWidth + 0.3) continue
      if (y >= obstacle.base - 0.45 && y < obstacle.base + obstacle.height) return true
    }
    return false
  }
}
