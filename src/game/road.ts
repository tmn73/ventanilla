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
const DRIFT_LIMIT = 4.5

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
   * One spot at a time. The size is rolled first and the run-up is sized from
   * it, so a small feature arrives quickly and a landmark is visible from far
   * enough away to decide what to send at it.
   */
  private emit(): void {
    const scale = this.rollScale()
    this.runUp(6 + scale * 32)
    this.spot(scale)
  }

  /**
   * 0 is a small feature, 1 is a landmark, and one in twenty goes past 1 into
   * something outsized. The tails matter more than the middle: a rail you can
   * barely pop onto and a rail that runs half a block have to both be possible.
   */
  private rollScale(): number {
    const roll = this.rng()
    if (roll < 0.05) return 1 + this.rng() * 0.45
    if (roll < 0.34) return this.rng() * 0.3
    if (roll < 0.83) return 0.3 + this.rng() * 0.42
    return 0.72 + this.rng() * 0.28
  }

  private runUp(length: number): void {
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    this.headX += length
  }

  /** Keeps a module's exit height inside the band the pavement may wander in. */
  private settle(y: number): number {
    const base = LANE_Y[0]!
    return Math.max(base - DRIFT_LIMIT, Math.min(base + DRIFT_LIMIT, y))
  }

  private spot(scale: number): void {
    const drift = this.groundY - LANE_Y[0]!
    if (drift < -DRIFT_LIMIT * 0.55) {
      this.bank(1, scale)
      return
    }

    const roll = this.rng()
    if (roll < 0.19) this.stairs(scale)
    else if (roll < 0.3) this.railSpot(scale)
    else if (roll < 0.41) this.ledgeSpot(scale)
    else if (roll < 0.5) this.bank(drift > DRIFT_LIMIT * 0.4 ? -1 : 0, scale)
    else if (roll < 0.59) this.plaza(scale)
    else if (roll < 0.67) this.doubleSet(scale)
    else if (roll < 0.74) this.hip(scale)
    else if (roll < 0.83) this.funbox(scale)
    else if (roll < 0.9) this.bumpToBar(scale)
    else if (roll < 0.96) this.channel(scale)
    else this.drop(scale)
  }

  /**
   * Bank up, a flat top with a rail across it, bank down. The centrepiece of
   * any park, and it offers three lines: over it, along the rail, or round the
   * bottom if you stay low.
   */
  private funbox(scale: number): void {
    const rise = 0.7 + scale * 2.1
    const top = this.settle(this.groundY + rise)
    const ramp = Math.max(2, (top - this.groundY) / range(this.rng, 0.22, 0.34))
    const deck = 5 + scale * 22

    this.push(this.headX, this.headX + ramp, this.groundY, top, 'flat', true)
    this.headX += ramp

    this.push(this.headX, this.headX + deck, top, top, 'flat', true)
    const railY = top + RAIL_HEIGHT
    this.push(this.headX + 1, this.headX + deck - 1, railY, railY, 'rail', false)
    this.headX += deck

    this.push(this.headX, this.headX + ramp, top, this.groundY, 'flat', true)
    this.headX += ramp
  }

  /** A kicker right before a flat rail, so you pop onto it instead of climbing. */
  private bumpToBar(scale: number): void {
    const rise = 0.45 + scale * 0.5
    const crest = this.settle(this.groundY + rise)
    const ramp = Math.max(1.2, (crest - this.groundY) / 0.32)

    this.push(this.headX, this.headX + ramp, this.groundY, crest, 'flat', true)
    this.headX += ramp
    this.push(this.headX, this.headX + ramp * 0.7, crest, this.groundY, 'flat', true)
    this.headX += ramp * 0.7

    const length = 5 + scale * 26
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    const y = this.groundY + RAIL_HEIGHT
    this.push(this.headX + 0.5, this.headX + length - 1, y, y, 'rail', false)
    this.headX += length
  }

  /**
   * A drainage channel. You clear it, or you drop in and ride the long ramp
   * back out, which costs you the line but never the run.
   */
  private channel(scale: number): void {
    const width = 2.2 + scale * 5
    const floorY = this.settle(this.groundY - (0.8 + scale * 1.6))
    const depth = this.groundY - floorY

    // A sheer near wall, so the edge reads as something to leave the ground at.
    this.push(this.headX, this.headX + width, floorY, floorY, 'flat', true)
    this.headX += width

    // And a long ramp out, gentle enough for a board to hold.
    const out = Math.max(2, depth / 0.26)
    this.push(this.headX, this.headX + out, floorY, this.groundY, 'flat', true)
    this.headX += out
  }

  /** A raised platform ending in a sheer edge, with a landing well below. */
  private drop(scale: number): void {
    const height = 0.9 + scale * 3.4
    const climb = height / range(this.rng, 0.24, 0.34)
    const top = this.settle(this.groundY + height)

    this.push(this.headX, this.headX + climb, this.groundY, top, 'flat', true)
    this.headX += climb

    const deck = 6 + scale * 18
    this.push(this.headX, this.headX + deck, top, top, 'flat', true)
    const ledgeY = top + LEDGE_HEIGHT
    this.push(this.headX + 1.5, this.headX + deck - 1.5, ledgeY, ledgeY, 'ledge', false)
    this.headX += deck

    const landing = 16 + scale * 8
    this.push(this.headX, this.headX + landing, this.groundY, this.groundY, 'flat', true)
    this.headX += landing
  }

  /**
   * A set of steps, each one ridable. Past eight of them a handrail always
   * runs alongside, so the set can be taken without clearing it in one go.
   */
  private stairs(scale: number): void {
    const headroom = Math.floor((this.groundY - (LANE_Y[0]! - DRIFT_LIMIT)) / RISE)
    // Math.max below would have floored this back to four and walked past the
    // limit, so a street with no room left gets a climb instead of a set.
    if (headroom < 4) {
      this.bank(1, scale)
      return
    }
    const wish = Math.round(3 + scale * (MAX_STEPS - 3) + range(this.rng, -3, 4))
    const wanted = Math.max(3, Math.min(wish, MAX_STEPS, headroom))
    const hasRail = wanted > MAX_FREE_STEPS || this.rng() < 0.5
    const count = hasRail ? wanted : Math.min(wanted, MAX_FREE_STEPS)

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

      if (kind === 'rail' && count >= 7 && this.rng() < 0.45) {
        // Kinked: it runs flat off the top, then breaks and plunges.
        const kinkX = topX + count * TREAD * 0.3
        const kinkY = topY - count * RISE * 0.1
        this.push(topX - 1.2, kinkX, topY + lift, kinkY + lift, kind, false)
        this.push(kinkX, runX + 0.6, kinkY + lift, bottomY + lift, kind, false)
      } else {
        this.push(topX - 0.6, runX + 0.6, topY + lift, bottomY + lift, kind, false)
      }
    }

    this.groundY = bottomY
    this.headX = runX
    // Landing room at the bottom of every set.
    this.runUp(range(this.rng, 8, 13))
  }

  /** Two sets with a landing between them. The second one is the surprise. */
  private doubleSet(scale: number): void {
    this.stairs(scale * 0.6)
    this.runUp(range(this.rng, 6, 11))
    this.stairs(scale)
  }

  /** A short steep kicker. It throws you, and there is nothing to grind. */
  private hip(scale: number): void {
    const length = range(this.rng, 4.5, 7)
    const lip = this.settle(this.groundY + 1.1 + scale * 1.6)
    this.push(this.headX, this.headX + length, this.groundY, lip, 'flat', true)
    this.headX += length

    // The drop off the back of the lip, and a long flat to land it on.
    const landingY = this.settle(lip - range(this.rng, 1.3, 3.2))
    const landing = range(this.rng, 14, 22)
    this.push(this.headX, this.headX + landing, landingY, landingY, 'flat', true)
    this.groundY = landingY
    this.headX += landing
  }

  /** An open square with a block and a rail side by side. Pick your line. */
  private plaza(scale: number): void {
    const length = range(this.rng, 12, 20 + scale * 36)
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)

    const ledgeY = this.groundY + LEDGE_HEIGHT
    this.push(this.headX + 1.5, this.headX + length * 0.48, ledgeY, ledgeY, 'ledge', false)

    const railY = this.groundY + RAIL_HEIGHT
    this.push(this.headX + length * 0.56, this.headX + length - 1.5, railY, railY, 'rail', false)

    this.headX += length
  }

  /**
   * A flat handrail over flat ground, at any length. A rail that climbs away
   * from the pavement ends metres up in the air on stilts, so a slope only
   * belongs to a rail that has a stair set descending under it.
   */
  private railSpot(scale: number): void {
    const length = 3.5 + scale * range(this.rng, 12, 34)
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)

    const y = this.groundY + RAIL_HEIGHT
    this.push(this.headX + 0.8, this.headX + length - 0.8, y, y, 'rail', false)
    this.headX += length
  }

  /** A block you roll along. Concrete, so it gives a manual and no sparks. */
  private ledgeSpot(scale: number): void {
    // Small is a block to pop onto. Big is a manual pad you can ride forever.
    const length = 3.5 + scale * range(this.rng, 14, 40)
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    const y = this.groundY + (scale > 0.6 ? LEDGE_HEIGHT * 0.55 : LEDGE_HEIGHT)
    this.push(this.headX + 1, this.headX + length - 1, y, y, 'ledge', false)
    this.headX += length
    this.runUp(range(this.rng, 6, 10))
  }

  /** Pavement pitching up or down. A rising lip throws you into the air. */
  private bank(force: number, scale: number): void {
    // A bank is either a long gentle drift or a short sharp pitch, and the
    // roll decides which rather than averaging the two.
    const steep = this.rng() < 0.4
    const length = steep ? 5 + scale * 9 : 10 + scale * 34
    const swing = steep ? 1.4 + scale * 3.2 : 0.8 + scale * 5.4
    const rise =
      force > 0
        ? range(this.rng, swing * 0.6, swing)
        : force < 0
          ? -range(this.rng, swing * 0.5, swing * 0.8)
          : range(this.rng, -swing * 0.8, swing)
    const endY = this.settle(this.groundY + rise)
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
