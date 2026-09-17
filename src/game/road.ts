import { LANE_Y, VIEW_WIDTH } from './constants'
import { range } from '../core/rng'

export type SurfaceKind = 'flat' | 'step' | 'ledge' | 'rail' | 'hubba'
export type ObstacleKind = 'post' | 'sign' | 'palm' | 'hydrant' | 'bin'

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

/** Something standing on the street. You cannot land on it, so you jump it. */
export interface Obstacle {
  x: number
  halfWidth: number
  base: number
  height: number
  kind: ObstacleKind
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
const MAX_STEPS = 16
/** Without a rail the whole set has to be cleared in one ollie. */
const MAX_FREE_STEPS = 8

const RAIL_HEIGHT = 0.95
const LEDGE_HEIGHT = 0.58
/** How far below the pavement a fall stops being recoverable. */
const FATAL_DROP = 3
/** The pavement never wanders further than this from where it started. */
const DRIFT_LIMIT = 3.2

const LOOKAHEAD = VIEW_WIDTH * 2.5
const TRAIL = VIEW_WIDTH * 0.8
const STREET_PROPS: ObstacleKind[] = ['hydrant', 'bin', 'sign', 'post', 'palm']

export class Road {
  segments: Segment[] = []
  obstacles: Obstacle[] = []

  /** The pavement the camera rests on, so it can be followed. */
  groundY = LANE_Y[0]!

  private headX = 0

  constructor(private rng: () => number) {}

  reset(startX: number): void {
    this.segments = []
    this.obstacles = []
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
   * Stairs only ever go down, so without a counterweight the pavement walks
   * off the bottom of the world. A low street is climbed back with a bank.
   */
  private emit(): void {
    const base = LANE_Y[0]!
    const drift = this.groundY - base
    if (drift < -DRIFT_LIMIT) {
      this.bank(1)
      return
    }

    const roll = this.rng()
    if (roll < 0.2) this.flat()
    else if (roll < 0.44) {
      if (drift < -DRIFT_LIMIT * 0.5) this.bank(1)
      else this.stairs()
    } else if (roll < 0.62) this.railSpot()
    else if (roll < 0.76) this.ledgeSpot()
    else if (roll < 0.95) this.bank(drift > DRIFT_LIMIT * 0.5 ? -1 : 0)
    else this.gap()
  }

  /** Plain pavement, with room to set up. */
  private flat(): void {
    const length = range(this.rng, 9, 19)
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    this.clutter(this.headX + 2, this.headX + length - 2)
    this.headX += length
  }

  /**
   * A set of steps, each one ridable. Past eight of them a handrail always
   * runs alongside, so the set can be taken without clearing it in one go.
   */
  private stairs(): void {
    const headroom = Math.floor((this.groundY - (LANE_Y[0]! - DRIFT_LIMIT)) / RISE)
    const steps = Math.max(3, Math.min(Math.round(range(this.rng, 3, MAX_STEPS)), headroom))
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
    const runout = range(this.rng, 7, 13)
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

    this.headX += length
  }

  /** A block you roll along. Concrete, so it gives a manual and no sparks. */
  private ledgeSpot(): void {
    const length = range(this.rng, 8, 16)
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    const y = this.groundY + LEDGE_HEIGHT
    this.push(this.headX + 1, this.headX + length - 1, y, y, 'ledge', false)
    this.headX += length
  }

  /** Pavement pitching up or down. A rising lip throws you into the air. */
  private bank(force: number): void {
    const length = range(this.rng, 8, 15)
    const rise =
      force > 0
        ? range(this.rng, 1.1, 2.4)
        : force < 0
          ? -range(this.rng, 1.1, 2.4)
          : range(this.rng, -1.8, 1.8)
    const endY = this.groundY + rise
    this.push(this.headX, this.headX + length, this.groundY, endY, 'flat', true)
    this.groundY = endY
    this.headX += length
  }

  /** A hole in the pavement. Sized so it clears at the slowest the car drives. */
  private gap(): void {
    const before = range(this.rng, 6, 11)
    this.push(this.headX, this.headX + before, this.groundY, this.groundY, 'flat', true)
    this.headX += before + range(this.rng, 2.6, 5.2)
    const after = range(this.rng, 8, 14)
    this.push(this.headX, this.headX + after, this.groundY, this.groundY, 'flat', true)
    this.headX += after
  }

  /** Street furniture standing on the pavement, never near a landing. */
  private clutter(from: number, to: number): void {
    if (to - from < 6) return
    if (this.rng() > 0.5) return
    const kind = STREET_PROPS[Math.floor(this.rng() * STREET_PROPS.length)]!
    const height = kind === 'palm' ? 2.8 : kind === 'sign' ? 2.1 : kind === 'post' ? 1.5 : 0.75
    this.obstacles.push({
      x: range(this.rng, from, to),
      halfWidth: kind === 'bin' ? 0.4 : kind === 'hydrant' ? 0.24 : 0.22,
      base: this.groundY,
      height,
      kind,
    })
  }

  private push(x0: number, x1: number, y0: number, y1: number, kind: SurfaceKind, floor: boolean): void {
    this.segments.push({ x0, x1, y0, y1, kind, floor })
  }

  step(): void {}

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

  /** Below this you are in the hole and the run is over. */
  deathLineAt(x: number): number {
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
    return nearest - FATAL_DROP
  }

  /** True when this point is inside something standing on the pavement. */
  blockedAt(x: number, y: number): boolean {
    for (const obstacle of this.obstacles) {
      if (Math.abs(x - obstacle.x) > obstacle.halfWidth + 0.3) continue
      if (y >= obstacle.base - 0.45 && y < obstacle.base + obstacle.height) return true
    }
    return false
  }
}
