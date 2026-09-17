import { LANE_Y, VIEW_WIDTH } from './constants'
import { range } from '../core/rng'

export type SurfaceKind = 'flat' | 'step' | 'ledge' | 'rail' | 'hubba'

export interface Segment {
  x0: number
  x1: number
  /** Height at each end. When they differ the surface is a ramp. */
  y0: number
  y1: number
  kind: SurfaceKind
  /** True for the pavement and the steps, which set where a fall becomes fatal. */
  floor: boolean
}

/**
 * Metal is ground on and throws sparks. Concrete is flat, so you roll on it
 * and the trick becomes a manual. The missing sparks are how the player feels
 * the difference.
 */
export const GRINDABLE: Record<SurfaceKind, boolean> = {
  rail: true,
  hubba: false,
  ledge: false,
  flat: false,
  step: false,
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

const RISE = 0.34
const TREAD = 0.8
const MAX_STEPS = 20
/** Without a rail the whole set has to be cleared in one ollie. */
const MAX_FREE_STEPS = 8

const RAIL_HEIGHT = 0.95
const LEDGE_HEIGHT = 0.58
/** The pavement never wanders further than this from where it started. */
const DRIFT_LIMIT = 7

const LOOKAHEAD = VIEW_WIDTH * 2.5
const TRAIL = VIEW_WIDTH * 0.8

export class Road {
  segments: Segment[] = []

  /** The pavement the camera rests on, so it can be followed. */
  groundY = LANE_Y[0]!

  private headX = 0

  constructor(private rng: () => number) {}

  reset(startX: number): void {
    this.segments = []
    this.groundY = LANE_Y[0]!
    // A guaranteed run-up under the spawn, or the run ends before it begins.
    this.push(startX - 12, startX + 20, this.groundY, this.groundY, 'flat', true)
    this.headX = startX + 20
  }

  /** Modules laid end to end. Each one starts where the last one stopped. */
  ensureAhead(x: number): void {
    const limit = x + LOOKAHEAD
    while (this.headX < limit) this.emit()
  }

  /**
   * One spot at a time, each with a long clean run-up in front of it. The
   * run-up is the point: you see the set coming and you decide what to send.
   */
  private emit(): void {
    this.runUp()
    this.spot()
  }

  /** Open pavement. Long enough to read what is ahead and commit to it. */
  private runUp(): void {
    const length = range(this.rng, 22, 38)
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    this.headX += length
  }

  private spot(): void {
    const drift = this.groundY - LANE_Y[0]!
    if (drift < -DRIFT_LIMIT * 0.55) {
      this.bank(1)
      return
    }

    const roll = this.rng()
    if (roll < 0.38) this.stairs()
    else if (roll < 0.62) this.railSpot()
    else if (roll < 0.82) this.ledgeSpot()
    else this.bank(drift > DRIFT_LIMIT * 0.4 ? -1 : 0)
  }

  /**
   * A set of steps, each one ridable. Past eight of them a handrail always
   * runs alongside, so the set can be taken without clearing it in one go.
   */
  private stairs(): void {
    const headroom = Math.floor((this.groundY - (LANE_Y[0]! - DRIFT_LIMIT)) / RISE)
    // Weighted toward the big sets, because the big set is the thing you want.
    const wish = Math.round(range(this.rng, 4, MAX_STEPS + 6))
    const steps = Math.max(4, Math.min(wish, MAX_STEPS, headroom))
    const hasRail = steps > MAX_FREE_STEPS || this.rng() < 0.55
    const count = hasRail ? Math.min(steps, MAX_STEPS) : Math.min(steps, MAX_FREE_STEPS)

    const topX = this.headX
    const topY = this.groundY
    for (let i = 0; i < count; i++) {
      const y = topY - (i + 1) * RISE
      this.push(topX + i * TREAD, topX + (i + 1) * TREAD, y, y, 'step', true)
    }

    const runX = topX + count * TREAD
    const bottomY = topY - count * RISE

    if (hasRail) {
      const kind: SurfaceKind = this.rng() < 0.6 ? 'rail' : 'hubba'
      const lift = kind === 'rail' ? RAIL_HEIGHT : LEDGE_HEIGHT
      this.push(topX - 0.6, runX + 0.6, topY + lift, bottomY + lift, kind, false)
    }

    this.groundY = bottomY
    this.headX = runX
    // Landing room at the bottom of every set.
    const runout = range(this.rng, 12, 20)
    this.push(this.headX, this.headX + runout, this.groundY, this.groundY, 'flat', true)
    this.headX += runout
  }

  /** A rail over flat ground: level, uphill or downhill, any length. */
  private railSpot(): void {
    const length = range(this.rng, 7, 18)
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)

    const roll = this.rng()
    const drop = roll < 0.45 ? 0 : roll < 0.8 ? -range(this.rng, 0.8, 2.4) : range(this.rng, 0.6, 1.6)
    const y0 = this.groundY + RAIL_HEIGHT + (drop < 0 ? -drop : 0)
    this.push(this.headX + 0.8, this.headX + length - 0.8, y0, y0 + drop, 'rail', false)

    // No clutter under the rail. A hazard the player is grinding over still
    // reads as a hit, and dying while riding above something is not fair.
    this.headX += length
  }

  /** A block you roll along. Concrete, so it gives a manual and no sparks. */
  private ledgeSpot(): void {
    const length = range(this.rng, 8, 16)
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    const y = this.groundY + LEDGE_HEIGHT
    this.push(this.headX + 1, this.headX + length - 1, y, y, 'ledge', false)
    this.headX += length
    // A short flat after the block, with room for one hazard.
    const after = range(this.rng, 8, 13)
    this.push(this.headX, this.headX + after, this.groundY, this.groundY, 'flat', true)
    this.headX += after
  }

  /** Pavement pitching up or down. A rising lip throws you into the air. */
  private bank(force: number): void {
    const length = range(this.rng, 12, 22)
    const rise =
      force > 0
        ? range(this.rng, 2.2, 4.2)
        : force < 0
          ? -range(this.rng, 1.4, 2.6)
          : range(this.rng, -1.8, 2.2)
    const endY = this.groundY + rise
    this.push(this.headX, this.headX + length, this.groundY, endY, 'flat', true)
    this.groundY = endY
    this.headX += length
  }

  private push(x0: number, x1: number, y0: number, y1: number, kind: SurfaceKind, floor: boolean): void {
    this.segments.push({ x0, x1, y0, y1, kind, floor })
  }

  step(): void {}

  prune(x: number): void {
    const cutoff = x - TRAIL
    this.segments = this.segments.filter((s) => s.x1 > cutoff)
  }

  /** Highest surface crossed while falling from fromY to toY, or null in open air. */
  landingAt(x: number, fromY: number, toY: number): Segment | null {
    let best: Segment | null = null
    let bestY = -Infinity
    for (const segment of this.segments) {
      if (x < segment.x0 || x > segment.x1) continue
      const top = surfaceYAt(segment, x)
      // A little slack upward, so ground that rises into the fall still catches.
      if (top > fromY + 0.22 || top < toY - 1e-4) continue
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

  /**
   * The surface that takes over when the one underfoot runs out. Without this
   * a module that starts a hair higher than the last one ended is never caught
   * by the falling sweep, and the skater drops past a floor that is right
   * there. Up is tighter than down: you roll off a kerb, you do not roll up one.
   */
  continuationAt(x: number, y: number, up = 0.32, down = 0.5): Segment | null {
    let best: Segment | null = null
    let bestY = -Infinity
    for (const segment of this.segments) {
      if (x < segment.x0 || x > segment.x1) continue
      const top = surfaceYAt(segment, x)
      if (top > y + up || top < y - down) continue
      if (top > bestY) {
        best = segment
        bestY = top
      }
    }
    return best
  }

  /** The pavement nearest this point. Used to put the skater back on it. */
  floorAt(x: number): number {
    let nearest = this.groundY
    let bestDistance = Infinity
    for (const segment of this.segments) {
      if (!segment.floor) continue
      const distance = x < segment.x0 ? segment.x0 - x : x > segment.x1 ? x - segment.x1 : 0
      if (distance < bestDistance) {
        bestDistance = distance
        nearest = surfaceYAt(segment, Math.min(segment.x1, Math.max(segment.x0, x)))
      }
    }
    return nearest
  }

}
