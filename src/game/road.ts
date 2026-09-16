import { CAR_SLOWEST, GRAVITY, JUMP_SPEED, LANE_Y, VIEW_WIDTH } from './constants'
import { range } from '../core/rng'

export type SurfaceKind = 'rail' | 'wall' | 'wire' | 'vehicle'

export interface Segment {
  x0: number
  x1: number
  y: number
  lane: number
  kind: SurfaceKind
  /** Metres per second. Only vehicles move. */
  vx: number
}

const KIND_OF_LANE: SurfaceKind[] = ['rail', 'wall', 'wire']

/** Air time of a full jump, up and back down to the same height. */
const HANG = (2 * JUMP_SPEED) / GRAVITY
/** Gaps are sized against the slowest the car ever goes, so they always clear. */
const SAFE_REACH = HANG * CAR_SLOWEST

const LOOKAHEAD = VIEW_WIDTH * 2.5
const TRAIL = VIEW_WIDTH * 0.8

export class Road {
  segments: Segment[] = []

  /** The end of the guaranteed route: where it stops and on which lane. */
  private headX = 0
  private headLane = 0

  constructor(
    private rng: () => number,
    private carSpeed: () => number,
  ) {}

  reset(startX: number): void {
    this.segments = []
    this.headX = startX - 14
    this.headLane = 0
  }

  /**
   * Lays one continuous, always-jumpable route, then scatters optional
   * surfaces around it so the player has a line to choose rather than
   * a corridor to follow.
   */
  ensureAhead(x: number): void {
    const limit = x + LOOKAHEAD
    while (this.headX < limit) {
      const run = range(this.rng, 11, 30)
      const x0 = this.headX
      this.push(x0, x0 + run, this.headLane)
      this.scatter(x0, x0 + run, this.headLane)

      // Climbing costs height, so allow less ground on the way up.
      const next = this.nextLane()
      const climb = next - this.headLane
      const budget = SAFE_REACH * (climb > 0 ? 0.36 : climb < 0 ? 0.6 : 0.48)
      this.headX = x0 + run + range(this.rng, 2.6, Math.max(3.2, budget))
      this.headLane = next
    }
  }

  private nextLane(): number {
    const roll = this.rng()
    let lane = this.headLane
    if (roll < 0.33) lane -= 1
    else if (roll < 0.66) lane += 1
    if (lane < 0) lane = 1
    if (lane > LANE_Y.length - 1) lane = LANE_Y.length - 2
    return lane
  }

  /** Optional surfaces beside the route. Riding them is a choice, never a must. */
  private scatter(x0: number, x1: number, routeLane: number): void {
    for (let lane = 0; lane < LANE_Y.length; lane++) {
      if (lane === routeLane) continue
      if (this.rng() > 0.45) continue
      const start = x0 + range(this.rng, 0, (x1 - x0) * 0.4)
      const end = Math.min(x1 + range(this.rng, -2, 8), start + range(this.rng, 8, 24))
      if (end - start < 6) continue
      this.push(start, end, lane)
    }
    if (this.rng() < 0.22) this.spawnVehicle(x1 + range(this.rng, 1, 5))
  }

  private push(x0: number, x1: number, lane: number): void {
    this.segments.push({
      x0,
      x1,
      y: LANE_Y[lane]!,
      lane,
      kind: KIND_OF_LANE[lane]!,
      vx: 0,
    })
  }

  private spawnVehicle(x0: number): void {
    this.segments.push({
      x0,
      x1: x0 + range(this.rng, 8, 15),
      y: LANE_Y[0]! - 0.55,
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
  }

  /** Highest surface crossed while falling from fromY to toY, or null in open air. */
  landingAt(x: number, fromY: number, toY: number): Segment | null {
    let best: Segment | null = null
    for (const segment of this.segments) {
      if (x < segment.x0 || x > segment.x1) continue
      if (segment.y > fromY + 1e-4 || segment.y < toY - 1e-4) continue
      if (!best || segment.y > best.y) best = segment
    }
    return best
  }

  stillCarries(segment: Segment, x: number): boolean {
    return x >= segment.x0 && x <= segment.x1
  }
}
