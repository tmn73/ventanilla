import { LANE_Y, VIEW_WIDTH } from './constants'
import { range } from '../core/rng'

export type SurfaceKind = 'flat' | 'step' | 'ledge' | 'rail' | 'hubba'

export interface Segment {
  x0: number
  x1: number
  /** Height at each end. When they differ the surface is a ramp. */
  y0: number
  y1: number
  /** Where the surface sits across the road, and how far it reaches each way. */
  z: number
  halfWidth: number
  kind: SurfaceKind
  /** True for the pavement and the steps, which set where a fall becomes fatal. */
  floor: boolean
}

/** Half the width of the pavement. The skater may go this far either side. */
export const ROAD_HALF = 6
/**
 * The road is five lanes, and they are invisible. A press moves you a whole
 * lane and lands you on its middle, so being lined up with what is on that
 * lane is never a question of aim.
 */
export const LANE_WIDTH = 2.5
export const LANE_MAX = 2

/**
 * How wide each kind is by default. A rail catches wider than it looks, which
 * is deliberate: missing one has to be a decision, not a pixel.
 */
const HALF_WIDTH: Record<SurfaceKind, number> = {
  flat: ROAD_HALF,
  step: ROAD_HALF,
  ledge: 0.9,
  hubba: 0.9,
  rail: 0.5,
}

/** True when a point across the road is over this surface. */
export function coversZ(segment: Segment, z: number): boolean {
  return Math.abs(z - segment.z) <= segment.halfWidth
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
const MAX_STEPS = 60
/** Without a rail the whole set has to be cleared in one ollie. */
const MAX_FREE_STEPS = 8

const RAIL_HEIGHT = 0.95
const LEDGE_HEIGHT = 0.58
/** The pavement never wanders further than this from where it started. */
const DRIFT_LIMIT = 20
/** The steepest face the game ever builds. Past this it reads as a wall. */
const MAX_SLOPE = 0.9

const LOOKAHEAD = VIEW_WIDTH * 2.5
const TRAIL = VIEW_WIDTH * 0.8

export class Road {
  segments: Segment[] = []

  /** The pavement the camera rests on, so it can be followed. */
  groundY = LANE_Y[0]!

  private headX = 0

  constructor(private rng: () => number) {}

  /**
   * Which lane a feature takes. Always a lane middle, never between two: a
   * feature you cannot line up with is a feature you cannot ride.
   */
  private lane(spread = 1): number {
    const roll = this.rng()
    const out = roll < 0.16 ? -2 : roll < 0.4 ? -1 : roll < 0.6 ? 0 : roll < 0.84 ? 1 : 2
    return Math.max(-LANE_MAX, Math.min(LANE_MAX, Math.round(out * spread))) * LANE_WIDTH
  }

  /** Pavement across only part of the road, so the rest of it can fall away. */
  private band(x0: number, x1: number, y0: number, y1: number, from: number, to: number): void {
    const mid = (from + to) / 2
    // A hair wider than asked. Two bands that meet exactly leave a seam that
    // rounding can open, and a player standing on it would be over nothing.
    this.push(x0, x1, y0, y1, 'flat', true, mid, Math.abs(to - from) / 2 + 0.02)
  }

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
    // Bounded so a module that failed to advance can never hang the tab.
    for (let guard = 0; guard < 200 && this.headX < limit; guard++) this.emit()
  }

  /**
   * One spot at a time. The size is rolled first and the run-up is sized from
   * it, so a small feature arrives quickly and a landmark is visible from far
   * enough away to decide what to send at it.
   */
  private emit(): void {
    // The run-up does not follow the size roll. A long walk with nothing on it
    // is the one thing that is never fun, however big what follows is.
    this.runUp(range(this.rng, 8, 15))
    this.spot(this.rollScale())
  }

  /**
   * 0 is a small feature and 1 is a landmark. One spot in fifty goes far past
   * that into something absurd, and it is rare on purpose: a monster every
   * fifty spots is an event, a monster every six is the weather.
   */
  private rollScale(): number {
    const roll = this.rng()
    if (roll < 0.02) return 1.5 + this.rng() * 2
    if (roll < 0.34) return this.rng() * 0.3
    if (roll < 0.78) return 0.3 + this.rng() * 0.42
    return 0.72 + this.rng() * 0.4
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
    if (roll < 0.13) this.stairs(scale)
    else if (roll < 0.21) this.railSpot(scale)
    else if (roll < 0.29) this.ledgeSpot(scale)
    else if (roll < 0.36) this.bank(drift > DRIFT_LIMIT * 0.4 ? -1 : 0, scale)
    else if (roll < 0.43) this.plaza(scale)
    else if (roll < 0.49) this.doubleSet(scale)
    else if (roll < 0.55) this.hip(scale)
    else if (roll < 0.62) this.funbox(scale)
    else if (roll < 0.68) this.bumpToBar(scale)
    else if (roll < 0.73) this.channel(scale)
    else if (roll < 0.79) this.drop(scale)
    else if (roll < 0.82) this.railOverGap(scale)
    else if (roll < 0.85) this.pit(scale)
    else if (roll < 0.88) this.stepUp(scale)
    else if (roll < 0.91) this.padChain(scale)
    else if (roll < 0.94) this.ledgeToBank(scale)
    else if (roll < 0.96) this.splitPit(scale)
    else if (roll < 0.975) this.fork(scale)
    else if (roll < 0.99) this.skybridge(scale)
    else this.canyon(scale)
  }

  /**
   * The road falls away and a rail keeps its level straight across the hole.
   * Grind the whole span, or drop in and ride the bottom. It is the one shape
   * where the easy line and the good line are furthest apart.
   */
  private skybridge(scale: number): void {
    const lane = this.lane()
    const top = this.groundY
    const depth = 3 + scale * 9
    const floorY = this.settle(top - depth)
    const fall = Math.max(4, depth / 0.5)
    const span = 10 + scale * 22
    const climb = Math.max(5, depth / 0.3)

    this.push(this.headX, this.headX + fall, top, floorY, 'flat', true)
    this.push(this.headX + fall, this.headX + fall + span, floorY, floorY, 'flat', true)
    this.push(
      this.headX + fall + span,
      this.headX + fall + span + climb,
      floorY,
      top,
      'flat',
      true,
    )

    // The rail ignores all of it and holds the line the road used to be on.
    const railY = top + RAIL_HEIGHT
    this.push(this.headX - 3, this.headX + fall + span + climb * 0.6, railY, railY, 'rail', false, lane)

    this.headX += fall + span + climb
  }

  /**
   * Two roads side by side at two heights, running together for a while. The
   * lane you are on when it opens is the road you are committed to.
   */
  private canyon(scale: number): void {
    const length = 20 + scale * 45
    const depth = 1.6 + scale * 5
    const lowY = this.settle(this.groundY - depth)
    const drop = Math.max(3, depth / 0.5)
    const climb = Math.max(4, depth / 0.32)
    const down = this.rng() < 0.5 ? -1 : 1
    // The split runs between two lanes, so no lane is half high and half low.
    const edge = down * (Math.floor(this.rng() * 2) + 0.5) * LANE_WIDTH
    const lowFrom = down > 0 ? edge : -ROAD_HALF
    const lowTo = down > 0 ? ROAD_HALF : edge
    const highFrom = down > 0 ? -ROAD_HALF : edge
    const highTo = down > 0 ? edge : ROAD_HALF

    const x = this.headX
    this.band(x, x + drop + length + climb, this.groundY, this.groundY, highFrom, highTo)
    this.band(x, x + drop, this.groundY, lowY, lowFrom, lowTo)
    this.band(x + drop, x + drop + length, lowY, lowY, lowFrom, lowTo)
    this.band(x + drop + length, x + drop + length + climb, lowY, this.groundY, lowFrom, lowTo)

    // A hubba down the wall between the two, which is the line that uses both.
    const ledgeY = this.groundY + LEDGE_HEIGHT
    const ledgeZ = edge - down * LANE_WIDTH * 0.5
    this.push(x + drop, x + drop + length, ledgeY, ledgeY, 'hubba', false, ledgeZ)

    this.headX += drop + length + climb
  }

  /**
   * A hole down one half of the road. The other half stays whole, so the
   * question is not whether you clear it but whether you go round it.
   */
  private splitPit(scale: number): void {
    const width = 5 + scale * 12
    const floorY = this.settle(this.groundY - (2 + scale * 7))
    const out = Math.max(4, (this.groundY - floorY) / 0.26)
    const open = this.rng() < 0.5 ? -1 : 1
    // The hole stops between two lanes, so a lane is either whole or gone.
    const edge = open * (Math.floor(this.rng() * 2) + 0.5) * LANE_WIDTH

    const safeFrom = open > 0 ? -ROAD_HALF : edge
    const safeTo = open > 0 ? edge : ROAD_HALF
    this.band(this.headX, this.headX + width + out, this.groundY, this.groundY, safeFrom, safeTo)

    const holeFrom = open > 0 ? edge : -ROAD_HALF
    const holeTo = open > 0 ? ROAD_HALF : edge
    this.band(this.headX, this.headX + width, floorY, floorY, holeFrom, holeTo)
    this.band(this.headX + width, this.headX + width + out, floorY, this.groundY, holeFrom, holeTo)

    this.headX += width + out
  }

  /**
   * Two lines running side by side: a rail down one edge and a raised platform
   * down the other. Neither is the right answer, which is the point of it.
   */
  private fork(scale: number): void {
    const length = 12 + scale * 26
    const side = this.rng() < 0.5 ? -1 : 1
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)

    const railY = this.groundY + RAIL_HEIGHT
    this.push(
      this.headX + 1,
      this.headX + length - 1,
      railY,
      railY,
      'rail',
      false,
      side * LANE_WIDTH * 2,
    )

    // The platform is reached by a ramp at its near end and ends in a drop.
    const lift = 0.9 + scale * 1.8
    const ramp = Math.max(3, lift / 0.42)
    const topY = this.groundY + lift
    // Two lanes wide, centred on a lane, so both of them carry you.
    const half = LANE_WIDTH
    const centre = -side * LANE_WIDTH * 1.5
    this.push(this.headX, this.headX + ramp, this.groundY, topY, 'flat', true, centre, half)
    this.push(this.headX + ramp, this.headX + length, topY, topY, 'flat', true, centre, half)

    this.headX += length
  }

  /**
   * A rail spanning an open gap. Grind across, ollie it, or fall in and ride
   * out the far side. One spot, three answers, which is the whole point.
   */
  private railOverGap(scale: number): void {
    const width = 3 + scale * 7
    const depth = 1.4 + scale * 3.5
    const lip = this.headX

    const floorY = this.settle(this.groundY - depth)
    this.push(lip, lip + width, floorY, floorY, 'flat', true)
    const out = Math.max(3, (this.groundY - floorY) / 0.28)
    this.push(lip + width, lip + width + out, floorY, this.groundY, 'flat', true)

    // The rail runs level over the whole thing, from lip to far bank.
    const railY = this.groundY + RAIL_HEIGHT
    this.push(lip - 2.5, lip + width + out * 0.5, railY, railY, 'rail', false, this.lane())

    this.headX = lip + width + out
  }

  /** A hole. Deep, and there is no rail over this one. */
  private pit(scale: number): void {
    const width = 4 + scale * 9
    const floorY = this.settle(this.groundY - (2.5 + scale * 8))

    this.push(this.headX, this.headX + width, floorY, floorY, 'flat', true)
    this.headX += width

    const out = Math.max(4, (this.groundY - floorY) / 0.26)
    this.push(this.headX, this.headX + out, floorY, this.groundY, 'flat', true)
    this.headX += out
  }

  /** Two rails, the second higher than the first. Pop from one to the other. */
  private stepUp(scale: number): void {
    const first = 6 + scale * 9
    const gap = 3 + scale * 3
    const second = 6 + scale * 11
    const lift = 0.5 + scale * 0.9

    this.push(this.headX, this.headX + first + gap + second, this.groundY, this.groundY, 'flat', true)
    // The two rails sit on opposite sides, so the line crosses the road.
    const side = this.rng() < 0.5 ? -LANE_WIDTH : LANE_WIDTH
    const lowY = this.groundY + RAIL_HEIGHT
    this.push(this.headX + 0.5, this.headX + first, lowY, lowY, 'rail', false, side)
    const highY = lowY + lift
    this.push(
      this.headX + first + gap,
      this.headX + first + gap + second - 0.5,
      highY,
      highY,
      'rail',
      false,
      -side,
    )
    this.headX += first + gap + second
  }

  /** Pad, hop, pad, hop. A manual line rather than a single block. */
  private padChain(scale: number): void {
    const pads = 2 + Math.floor(scale * 2.4)
    const y = this.groundY + LEDGE_HEIGHT * 0.6
    const lane = this.lane()

    for (let i = 0; i < pads; i++) {
      const length = 5 + scale * 9
      const gap = 2.2 + scale * 2.6
      this.push(this.headX, this.headX + length + gap, this.groundY, this.groundY, 'flat', true)
      this.push(this.headX + 0.5, this.headX + length, y, y, 'ledge', false, lane)
      this.headX += length + gap
    }
  }

  /** A block that runs out over a slope, so the landing is already falling. */
  private ledgeToBank(scale: number): void {
    const length = 7 + scale * 14
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    const y = this.groundY + LEDGE_HEIGHT
    this.push(this.headX + 1, this.headX + length, y, y, 'ledge', false, this.lane())
    this.headX += length

    const drop = 2 + scale * 7
    const run = Math.max(5, drop / range(this.rng, 0.2, 0.32))
    const endY = this.settle(this.groundY - drop)
    this.push(this.headX, this.headX + run, this.groundY, endY, 'flat', true)
    this.groundY = endY
    this.headX += run
  }

  /**
   * Bank up, a flat top with a rail across it, bank down. The centrepiece of
   * any park, and it offers three lines: over it, along the rail, or round the
   * bottom if you stay low.
   */
  private funbox(scale: number): void {
    const rise = 0.7 + scale * 6
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
    const rise = 0.45 + scale * 1.3
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
    const width = 2.2 + scale * 10
    const floorY = this.settle(this.groundY - (0.8 + scale * 5))
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
    const height = 0.9 + scale * 11
    const climb = height / range(this.rng, 0.24, 0.34)
    const top = this.settle(this.groundY + height)

    this.push(this.headX, this.headX + climb, this.groundY, top, 'flat', true)
    this.headX += climb

    const deck = 6 + scale * 16
    this.push(this.headX, this.headX + deck, top, top, 'flat', true)
    const ledgeY = top + LEDGE_HEIGHT
    this.push(this.headX + 1.5, this.headX + deck - 1.5, ledgeY, ledgeY, 'ledge', false)
    this.headX += deck

    const landing = 20 + scale * 18
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
    // Quadratic, not linear: a linear count put a thirty step set on a middling
    // spot, so the big ones stopped being big.
    const wish = Math.round(3 + scale * 12 + scale * scale * 8 + range(this.rng, -2, 4))
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
      // A big set sometimes carries both, which turns one spot into a choice.
      if (count > 9 && this.rng() < 0.3) {
        this.push(topX - 0.6, runX + 0.6, topY + RAIL_HEIGHT, bottomY + RAIL_HEIGHT, 'rail', false)
        this.push(topX - 0.4, runX + 0.4, topY + LEDGE_HEIGHT, bottomY + LEDGE_HEIGHT, 'hubba', false)
      }
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
    const run = this.rampRun(length, lip - this.groundY)
    this.push(this.headX, this.headX + run, this.groundY, lip, 'flat', true)
    this.headX += run

    // The drop off the back of the lip, and a long flat to land it on.
    const landingY = this.settle(lip - range(this.rng, 1.3, 3.2))
    const landing = range(this.rng, 14, 22)
    this.push(this.headX, this.headX + landing, landingY, landingY, 'flat', true)
    this.groundY = landingY
    this.headX += landing
  }

  /** An open square with a block and a rail side by side. Pick your line. */
  private plaza(scale: number): void {
    const length = range(this.rng, 12, 22 + scale * 34)
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
    const length = 3 + scale * range(this.rng, 10, 28)
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)

    const y = this.groundY + RAIL_HEIGHT
    this.push(this.headX + 0.8, this.headX + length - 0.8, y, y, 'rail', false, this.lane())
    this.headX += length
  }

  /** A block you roll along. Concrete, so it gives a manual and no sparks. */
  private ledgeSpot(scale: number): void {
    // Small is a block to pop onto. Big is a manual pad you can ride forever.
    const length = 3 + scale * range(this.rng, 12, 32)
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    const y = this.groundY + (scale > 0.6 ? LEDGE_HEIGHT * 0.55 : LEDGE_HEIGHT)
    this.push(this.headX + 1, this.headX + length - 1, y, y, 'ledge', false, this.lane())
    this.headX += length
    this.runUp(range(this.rng, 6, 10))
  }

  /** Pavement pitching up or down. A rising lip throws you into the air. */
  /**
   * How long a ramp has to be to carry a given rise. settle() can stretch a
   * rise after the module chose its length, and a wall is never rideable.
   */
  private rampRun(length: number, rise: number): number {
    return Math.max(length, Math.abs(rise) / MAX_SLOPE)
  }

  private bank(force: number, scale: number): void {
    // A bank is either a long gentle drift or a short sharp pitch, and the
    // roll decides which rather than averaging the two.
    const steep = this.rng() < 0.4
    const length = steep ? 4 + scale * 12 : 11 + scale * 40
    const swing = steep ? 2 + scale * 7 : 1.1 + scale * 13
    const rise =
      force > 0
        ? range(this.rng, swing * 0.6, swing)
        : force < 0
          ? -range(this.rng, swing * 0.5, swing * 0.8)
          : range(this.rng, -swing * 0.8, swing)
    const endY = this.settle(this.groundY + rise)
    const run = this.rampRun(length, endY - this.groundY)
    this.push(this.headX, this.headX + run, this.groundY, endY, 'flat', true)
    this.groundY = endY
    this.headX += run
  }

  private push(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    kind: SurfaceKind,
    floor: boolean,
    z = 0,
    halfWidth = HALF_WIDTH[kind],
  ): void {
    this.segments.push({ x0, x1, y0, y1, z, halfWidth, kind, floor })
  }

  step(): void {}

  prune(x: number): void {
    const cutoff = x - TRAIL
    this.segments = this.segments.filter((s) => s.x1 > cutoff)
  }

  /** Highest surface crossed while falling from fromY to toY, or null in open air. */
  landingAt(x: number, z: number, fromY: number, toY: number): Segment | null {
    let best: Segment | null = null
    let bestY = -Infinity
    for (const segment of this.segments) {
      if (x < segment.x0 || x > segment.x1 || !coversZ(segment, z)) continue
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

  stillCarries(segment: Segment, x: number, z: number): boolean {
    return x >= segment.x0 && x <= segment.x1 && coversZ(segment, z)
  }

  /**
   * The surface that takes over when the one underfoot runs out. Without this
   * a module that starts a hair higher than the last one ended is never caught
   * by the falling sweep, and the skater drops past a floor that is right
   * there. Up is tighter than down: you roll off a kerb, you do not roll up one.
   */
  continuationAt(x: number, z: number, y: number, up = 0.32, down = 0.5): Segment | null {
    let best: Segment | null = null
    let bestY = -Infinity
    for (const segment of this.segments) {
      if (x < segment.x0 || x > segment.x1 || !coversZ(segment, z)) continue
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
  /**
   * The bottom of the world at a point. Floors overlap now, so this takes the
   * lowest of them: a platform sits above the pavement, and the pavement is
   * still what catches a player who ends up under everything.
   */
  floorAt(x: number, z = 0): number {
    let nearest = this.groundY
    let bestDistance = Infinity
    for (const segment of this.segments) {
      if (!segment.floor || !coversZ(segment, z)) continue
      const distance = x < segment.x0 ? segment.x0 - x : x > segment.x1 ? x - segment.x1 : 0
      const top = surfaceYAt(segment, Math.min(segment.x1, Math.max(segment.x0, x)))
      if (distance < bestDistance || (distance === bestDistance && top < nearest)) {
        bestDistance = distance
        nearest = top
      }
    }
    return nearest
  }

}
