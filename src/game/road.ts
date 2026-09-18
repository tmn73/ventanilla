import { GRAVITY, JUMP_SPEED, LANE_Y, MAX_SPEED, VIEW_WIDTH } from './constants'
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
const MAX_STEPS = 60
/** Without a rail the whole set has to be cleared in one ollie. */
const MAX_FREE_STEPS = 8

const RAIL_HEIGHT = 0.95
const LEDGE_HEIGHT = 0.58
/** The pavement never wanders further than this from where it started. */
const DRIFT_LIMIT = 20
/** The steepest face the game ever builds. Past this it reads as a wall. */
const MAX_SLOPE = 0.9
/**
 * How far a full ollie carries at full speed, taken from the physics rather
 * than written down beside it. Nothing is shaped so that a jump taken at a
 * lip comes down on a slope that is still rising.
 */
export const JUMP_REACH = Math.ceil(((2 * JUMP_SPEED) / GRAVITY) * MAX_SPEED)

// Wide enough to still be ahead of the camera when the view is zoomed out.
const LOOKAHEAD = VIEW_WIDTH * 4
const TRAIL = VIEW_WIDTH * 1.5

/**
 * Which road to build. Street is the whole generator. The other two exist to
 * practise on: flat is nothing but pavement, and rails is pavement with
 * things to slide on and no change of height anywhere.
 */
export type Course = 'street' | 'flat' | 'rails'

export class Road {
  segments: Segment[] = []
  course: Course = 'street'

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

  /** How far the road has been built to. */
  get head(): number {
    return this.headX
  }

  /** Plain pavement, for when the next thing to ride is not decided yet. */
  pave(length: number): void {
    this.runUp(length)
  }

  /**
   * One named module, with a walk up to it. A lesson needs to know exactly
   * what it put in front of the rider, which the weighted mix cannot tell it.
   */
  stage(module: string, scale: number, walkUp: number): { from: number; to: number } {
    this.runUp(walkUp)
    const from = this.headX
    const build = (this as unknown as Record<string, (s: number) => void>)[module]
    if (typeof build === 'function') build.call(this, scale)
    return { from, to: this.headX }
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
    if (this.course === 'flat') {
      this.runUp(60)
      return
    }
    // The run-up does not follow the size roll. A long walk with nothing on it
    // is the one thing that is never fun, however big what follows is.
    this.runUp(range(this.rng, JUMP_REACH, 15))
    if (this.course === 'rails') this.railSpotOnly(this.rollScale())
    else this.spot(this.rollScale())
  }

  /**
   * The practice course. Every one of these leaves the pavement at the height
   * it found it, so there is nothing to read and nothing to land off.
   */
  private railSpotOnly(scale: number): void {
    const mix: Array<[number, () => void]> = [
      [7, () => this.railSpot(scale)],
      [6, () => this.ledgeSpot(scale)],
      [5, () => this.plaza(scale)],
      [4, () => this.padChain(scale)],
      [4, () => this.stepUp(scale)],
      [3, () => this.picnicTable(scale)],
      [3, () => this.jerseyBarrier(scale)],
      [2, () => this.rainbowRail(scale)],
      [2, () => this.poleJam(scale)],
    ]
    this.pick(mix)
  }

  /** Runs one of a weighted list. */
  private pick(mix: Array<[number, () => void]>): void {
    let total = 0
    for (const [weight] of mix) total += weight
    let roll = this.rng() * total
    for (const [weight, build] of mix) {
      roll -= weight
      if (roll <= 0) {
        build()
        return
      }
    }
    mix[0]![1]()
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
    // In a world with a floor, every metre a stair set drops has to be climbed
    // again. So the road climbs on a kicker with a deck on top, which is a
    // thing to jump off, and never on a bare hill.
    if (drift < -DRIFT_LIMIT * 0.75) {
      this.climbSpot(scale)
      return
    }

    // Weights, not an even spread. The plain spots are what a run is made of,
    // and the odd ones are worth more for turning up rarely.
    const lean = drift > DRIFT_LIMIT * 0.4 ? -1 : 0
    const mix: Array<[number, () => void]> = [
      [7, () => this.stairs(scale)],
      [6, () => this.railSpot(scale)],
      [6, () => this.ledgeSpot(scale)],
      [5, () => this.plaza(scale)],
      [5, () => this.bank(lean, scale)],
      [4, () => this.funbox(scale)],
      [4, () => this.doubleSet(scale)],
      [4, () => this.hip(scale)],
      [4, () => this.bumpToBar(scale)],
      [4, () => this.quarterPipe(scale)],
      [4, () => this.kinkedRail(scale)],
      [4, () => this.euroGap(scale)],
      [4, () => this.flatGap(scale)],
      [4, () => this.loadingDock(scale)],
      [3, () => this.channel(scale)],
      [3, () => this.drop(scale)],
      [3, () => this.railOverGap(scale)],
      [3, () => this.stepUp(scale)],
      [3, () => this.padChain(scale)],
      [3, () => this.ledgeToBank(scale)],
      [3, () => this.aFrame(scale)],
      [3, () => this.spine(scale)],
      [3, () => this.picnicTable(scale)],
      [3, () => this.waterfall(scale)],
      [3, () => this.rollingBumps(scale)],
      [3, () => this.tripleSet(scale)],
      [2, () => this.pit(scale)],
      [2, () => this.rainbowRail(scale)],
      [2, () => this.jerseyBarrier(scale)],
      [2, () => this.poleJam(scale)],
      [3, () => this.rollIn(scale)],
      [2, () => this.skybridge(scale)],
    ]

    let total = 0
    for (const [weight] of mix) total += weight
    let roll = this.rng() * total
    for (const [weight, build] of mix) {
      roll -= weight
      if (roll <= 0) {
        build()
        return
      }
    }
    mix[0]![1]()
  }


  /**
   * The road falls away and a rail keeps its level straight across the hole.
   * Grind the whole span, or drop in and ride the bottom. It is the one shape
   * where the easy line and the good line are furthest apart.
   */
  private skybridge(scale: number): void {
    const top = this.groundY
    const floorY = this.settle(top - (3 + scale * 9))
    const fall = Math.max(4, (top - floorY) / 0.5)
    const { bottom: span, out: climb } = this.hollow(top - floorY, 10 + scale * 22)

    this.push(this.headX, this.headX + fall, top, floorY, 'flat', true)
    this.push(this.headX + fall, this.headX + fall + span, floorY, floorY, 'flat', true)
    this.push(this.headX + fall + span, this.headX + fall + span + climb, floorY, top, 'flat', true)

    // The rail ignores all of it and holds the line the road used to be on.
    const railY = top + RAIL_HEIGHT
    this.push(this.headX - 3, this.headX + fall + span + climb * 0.6, railY, railY, 'rail', false)

    this.headX += fall + span + climb
  }

  /**
   * A rail spanning an open gap. Grind across, ollie it, or fall in and ride
   * out the far side. One spot, three answers, which is the whole point.
   */
  private railOverGap(scale: number): void {
    const lip = this.headX
    const floorY = this.settle(this.groundY - (1.4 + scale * 3.5))
    const { bottom: width, out } = this.hollow(this.groundY - floorY, 3 + scale * 7)

    this.push(lip, lip + width, floorY, floorY, 'flat', true)
    this.push(lip + width, lip + width + out, floorY, this.groundY, 'flat', true)

    // The rail runs level over the whole thing, from lip to far bank.
    const railY = this.groundY + RAIL_HEIGHT
    this.push(lip - 2.5, lip + width + out * 0.5, railY, railY, 'rail', false)

    this.headX = lip + width + out
  }

  /** A hole. Deep, and there is no rail over this one. */
  private pit(scale: number): void {
    const floorY = this.settle(this.groundY - (2.5 + scale * 8))
    const { bottom, out } = this.hollow(this.groundY - floorY, 4 + scale * 9)

    this.push(this.headX, this.headX + bottom, floorY, floorY, 'flat', true)
    this.headX += bottom
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
    const lowY = this.groundY + RAIL_HEIGHT
    this.push(this.headX + 0.5, this.headX + first, lowY, lowY, 'rail', false)
    const highY = lowY + lift
    this.push(this.headX + first + gap, this.headX + first + gap + second - 0.5, highY, highY, 'rail', false)
    this.headX += first + gap + second
  }

  /** Pad, hop, pad, hop. A manual line rather than a single block. */
  private padChain(scale: number): void {
    const pads = 2 + Math.floor(scale * 2.4)
    const y = this.groundY + LEDGE_HEIGHT * 0.6

    for (let i = 0; i < pads; i++) {
      const length = 5 + scale * 9
      const gap = 2.2 + scale * 2.6
      this.push(this.headX, this.headX + length + gap, this.groundY, this.groundY, 'flat', true)
      this.push(this.headX + 0.5, this.headX + length, y, y, 'ledge', false)
      this.headX += length + gap
    }
  }

  /** A block that runs out over a slope, so the landing is already falling. */
  private ledgeToBank(scale: number): void {
    const length = 7 + scale * 14
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    const y = this.groundY + LEDGE_HEIGHT
    this.push(this.headX + 1, this.headX + length, y, y, 'ledge', false)
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
    // A funbox is a box, not a hill. It grows along the road with the size
    // roll, and the ramp onto it stays something you hit rather than climb.
    const rise = Math.min(5, 0.7 + scale * 6)
    const top = this.settle(this.groundY + rise)
    const ramp = Math.max(2, (top - this.groundY) / range(this.rng, 0.34, 0.55))
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
    const floorY = this.settle(this.groundY - (0.8 + scale * 5))
    const { bottom, out } = this.hollow(this.groundY - floorY, 2.2 + scale * 10)

    // A sheer near wall, so the edge reads as something to leave the ground at.
    this.push(this.headX, this.headX + bottom, floorY, floorY, 'flat', true)
    this.headX += bottom

    // And a ramp out that either fits inside one ollie or starts past one.
    this.push(this.headX, this.headX + out, floorY, this.groundY, 'flat', true)
    this.headX += out
  }

  /** A raised platform ending in a sheer edge, with a landing well below. */
  /**
   * A kicker up to a deck with a ledge along it. `keep` leaves the road up
   * there instead of dropping off the far end, which is how the pavement wins
   * back the height a stair set cost it.
   */
/**
   * A transition, built from straight pieces whose slope grows toward the lip.
   * It never passes MAX_SLOPE: past that it stops being a ramp you hit and
   * becomes a wall you climb.
   */
  private transition(rise: number, steepest: number, up: boolean): void {
    // eslint-disable-next-line no-param-reassign
    const base = this.groundY
    const end = this.settle(up ? base + rise : base - rise)
    rise = Math.abs(end - base)
    if (rise < 0.05) return

    const steps = [0.18, 0.42, 0.68, 1].map((t) => t * Math.min(MAX_SLOPE, steepest))
    // Going up it steepens toward the lip. Coming down it does the reverse,
    // so the steep part is at the top and the board flattens out at the base.
    const slopes = up ? steps : steps.slice().reverse()
    const weight = slopes.reduce((a, b) => a + b, 0)
    let y = this.groundY

    for (let i = 0; i < slopes.length; i++) {
      const part = (rise * slopes[i]!) / weight
      const run = part / slopes[i]!
      const next = up ? y + part : y - part
      this.push(this.headX, this.headX + run, y, next, 'flat', true)
      this.headX += run
      y = next
    }
    this.groundY = end
  }

  /** A rail laid in pieces, so it can kink or arch instead of running straight. */
  private railLine(points: Array<[number, number]>): void {
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1]!
      const [x1, y1] = points[i]!
      this.push(x0, x1, y0, y1, 'rail', false)
    }
  }

  /**
   * How the pavement wins back the height a stair set cost it. Every one of
   * these ends higher than it started and gives you something to jump off on
   * the way, so a climb is never just a climb.
   */
  private climbSpot(scale: number): void {
    const roll = this.rng()
    if (roll < 0.4) this.drop(scale, true)
    else if (roll < 0.7) this.euroGap(scale)
    else this.rollIn(scale)
  }

  /** A curved transition up onto a plateau with a flat bar along it. */
  private rollIn(scale: number): void {
    const rise = 1.2 + Math.min(4.2, scale * 4)
    this.transition(rise, 0.78, true)
    const top = this.groundY
    const deck = 12 + scale * 18
    this.push(this.headX, this.headX + deck, top, top, 'flat', true)
    const y = top + RAIL_HEIGHT
    this.push(this.headX + 2, this.headX + deck - 2, y, y, 'rail', false)
    this.headX += deck
  }

  /** A flight of steps down. Several modules need one without the rest of a set. */
  private stepsDown(count: number): void {
    const topX = this.headX
    const topY = this.groundY
    // No room left means no steps. Forcing one through walks the pavement
    // out of the band it is allowed to wander in.
    const room = Math.floor((topY - (LANE_Y[0]! - DRIFT_LIMIT)) / RISE)
    const steps = Math.max(0, Math.min(count, room))
    for (let i = 0; i < steps; i++) {
      const y = topY - (i + 1) * RISE
      this.push(topX + i * TREAD, topX + (i + 1) * TREAD, y, y, 'step', true)
    }
    this.headX = topX + steps * TREAD
    this.groundY = topY - steps * RISE
  }

  /**
   * A transition up to a lip with nothing behind it. You go up it and you
   * leave the ground, and the landing is the street a long way below.
   */
  private quarterPipe(scale: number): void {
    const base = this.groundY
    const rise = 1.4 + Math.min(4.6, scale * 5)
    this.transition(rise, 0.9, true)
    const lip = this.groundY

    // A short deck so the lip reads as an edge rather than a point.
    this.push(this.headX, this.headX + 1.6, lip, lip, 'flat', true)
    this.headX += 1.6

    const landing = JUMP_REACH + 12 + scale * 14
    this.push(this.headX, this.headX + landing, base, base, 'flat', true)
    this.groundY = base
    this.headX += landing
  }

  /** Two transitions back to back with no deck between them. */
  private spine(scale: number): void {
    const rise = 1.2 + Math.min(4, scale * 4.5)
    this.transition(rise, 0.85, true)
    const peak = this.groundY
    this.push(this.headX, this.headX + 1.2, peak, peak, 'flat', true)
    this.headX += 1.2
    this.transition(rise, 0.85, false)
  }

  /** Two banks meeting at a peak, with a rail running over the top of them. */
  private aFrame(scale: number): void {
    const rise = 1.1 + Math.min(3.4, scale * 3.6)
    const run = rise / range(this.rng, 0.34, 0.5)
    const flat = 2 + scale * 4
    const start = this.headX
    const base = this.groundY
    const peak = this.settle(base + rise)

    this.push(this.headX, this.headX + run, base, peak, 'flat', true)
    this.headX += run
    this.push(this.headX, this.headX + flat, peak, peak, 'flat', true)
    this.headX += flat
    this.push(this.headX, this.headX + run, peak, base, 'flat', true)
    this.headX += run
    this.groundY = base

    // The rail follows the roof line, which is what makes it an A-frame.
    const lift = RAIL_HEIGHT
    this.railLine([
      [start + 0.5, base + lift],
      [start + run, peak + lift],
      [start + run + flat, peak + lift],
      [this.headX - 0.5, base + lift],
    ])
  }

  /** Flat, then a slope, then flat again lower down. The classic kinked rail. */
  private kinkedRail(scale: number): void {
    const top = 4 + scale * 8
    const bottom = 5 + scale * 9
    const base = this.groundY
    const start = this.headX

    this.push(this.headX, this.headX + top, base, base, 'flat', true)
    this.headX += top
    const kinkX = this.headX
    this.stepsDown(Math.max(3, Math.round(3 + scale * 9)))
    const breakX = this.headX
    const low = this.groundY
    this.push(this.headX, this.headX + bottom, low, low, 'flat', true)
    this.headX += bottom

    const lift = RAIL_HEIGHT
    this.railLine([
      [start + 1, base + lift],
      [kinkX, base + lift],
      [breakX, low + lift],
      [this.headX - 1, low + lift],
    ])
  }

  /** An arch. It rises off the ground, crests, and comes back down to it. */
  private rainbowRail(scale: number): void {
    const length = 9 + scale * 14
    const crest = 1.1 + Math.min(1.6, scale * 1.8)
    const start = this.headX
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    this.headX += length

    const pieces = 6
    const points: Array<[number, number]> = []
    for (let i = 0; i <= pieces; i++) {
      const t = i / pieces
      points.push([start + 1 + (length - 2) * t, this.groundY + 0.12 + crest * Math.sin(t * Math.PI)])
    }
    this.railLine(points)
  }

  /** A bank to a deck, a notch, and a higher flat to clear onto. */
  private euroGap(scale: number): void {
    const first = 0.8 + scale * 1.6
    const deck = 5 + scale * 8
    const base = this.groundY
    const low = this.settle(base + first)
    const ramp = this.rampRun((low - base) / 0.42, low - base)

    this.push(this.headX, this.headX + ramp, base, low, 'flat', true)
    this.headX += ramp
    this.push(this.headX, this.headX + deck, low, low, 'flat', true)
    this.headX += deck

    // The second flat sits higher than the first, and the notch between them
    // climbs to it steeply enough to fit inside one ollie.
    const high = this.settle(low + 0.6 + scale * 1.8)
    const { bottom: notch, out } = this.hollow(high - base, 2 + scale * 3)
    this.push(this.headX, this.headX + notch, base, base, 'flat', true)
    this.headX += notch
    this.push(this.headX, this.headX + out, base, high, 'flat', true)
    this.headX += out
    this.groundY = high
  }

  /** A low barrier across the road. Ollie it, or lay the board over it. */
  private jerseyBarrier(scale: number): void {
    const count = 1 + Math.floor(scale * 2)
    for (let i = 0; i < count; i++) {
      const length = 3 + scale * 4
      const gap = 7 + scale * 6
      this.push(this.headX, this.headX + length + gap, this.groundY, this.groundY, 'flat', true)
      const y = this.groundY + 0.72
      this.push(this.headX + 0.4, this.headX + length, y, y, 'ledge', false)
      this.headX += length + gap
    }
  }

  /** A bench, a table top, a bench. Three heights in three metres. */
  private picnicTable(scale: number): void {
    const length = 4 + scale * 3
    const bench = 1.6 + scale * 0.8
    const total = bench * 2 + length
    this.push(this.headX, this.headX + total + 6, this.groundY, this.groundY, 'flat', true)

    const seatY = this.groundY + 0.44
    const topY = this.groundY + 0.76
    this.push(this.headX, this.headX + bench, seatY, seatY, 'ledge', false)
    this.push(this.headX + bench, this.headX + bench + length, topY, topY, 'ledge', false)
    this.push(this.headX + bench + length, this.headX + total, seatY, seatY, 'ledge', false)
    this.headX += total + 6
  }

  /** A raised platform that stops dead. Everything about it says jump. */
  private loadingDock(scale: number): void {
    const height = 1.2 + Math.min(3.6, scale * 4)
    const ramp = this.rampRun(height / 0.5, height)
    const deck = 8 + scale * 16
    const base = this.groundY
    const top = this.settle(base + height)

    this.push(this.headX, this.headX + ramp, base, top, 'flat', true)
    this.headX += ramp
    this.push(this.headX, this.headX + deck, top, top, 'flat', true)
    const ledgeY = top + LEDGE_HEIGHT
    this.push(this.headX + 1, this.headX + deck, ledgeY, ledgeY, 'hubba', false)
    this.headX += deck

    const landing = JUMP_REACH + 14 + scale * 14
    this.push(this.headX, this.headX + landing, base, base, 'flat', true)
    this.groundY = base
    this.headX += landing
  }

  /** Ledges stacked down like steps, each one a drop onto the next. */
  private waterfall(scale: number): void {
    const tiers = 2 + Math.floor(scale * 3)
    for (let i = 0; i < tiers; i++) {
      const length = 5 + scale * 7
      const fall = 0.8 + scale * 1.6
      const next = this.settle(this.groundY - fall)
      const run = this.rampRun(fall / MAX_SLOPE, fall)
      this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
      const y = this.groundY + LEDGE_HEIGHT * 0.7
      this.push(this.headX + 0.8, this.headX + length, y, y, 'ledge', false)
      this.headX += length
      this.push(this.headX, this.headX + run, this.groundY, next, 'flat', true)
      this.headX += run
      this.groundY = next
    }
  }

  /** A gap in flat ground. No height to help you, only speed. */
  private flatGap(scale: number): void {
    const floorY = this.settle(this.groundY - (1.2 + scale * 2))
    const { bottom, out } = this.hollow(this.groundY - floorY, 3 + scale * 6)
    this.push(this.headX, this.headX + bottom, floorY, floorY, 'flat', true)
    this.headX += bottom
    this.push(this.headX, this.headX + out, floorY, this.groundY, 'flat', true)
    this.headX += out
  }

  /** A pole out of the ground at an angle. You ride up it and off the end. */
  private poleJam(scale: number): void {
    const length = 8 + scale * 10
    const rise = 0.9 + Math.min(1.4, scale * 1.6)
    const run = 3.5 + scale * 3
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    this.railLine([
      [this.headX + 1, this.groundY + 0.1],
      [this.headX + 1 + run, this.groundY + rise],
    ])
    this.headX += length
  }

  /** Humps in a row. Pump them, or pop off each one. */
  private rollingBumps(scale: number): void {
    const bumps = 2 + Math.floor(scale * 3)
    for (let i = 0; i < bumps; i++) {
      const rise = 0.4 + scale * 1.1
      const run = this.rampRun(rise / 0.44, rise)
      const crest = this.settle(this.groundY + rise)
      const base = this.groundY
      this.push(this.headX, this.headX + run, base, crest, 'flat', true)
      this.headX += run
      this.push(this.headX, this.headX + run, crest, base, 'flat', true)
      this.headX += run
      this.push(this.headX, this.headX + 3 + scale * 4, base, base, 'flat', true)
      this.headX += 3 + scale * 4
      this.groundY = base
    }
  }

  /** Three sets with a landing between each. A rail runs down the biggest. */
  private tripleSet(scale: number): void {
    for (let i = 0; i < 3; i++) {
      const steps = Math.max(2, Math.round(2 + scale * 5 + range(this.rng, -1, 2)))
      const start = this.headX
      const top = this.groundY
      this.stepsDown(steps)
      const low = this.groundY
      const landing = i === 2 ? JUMP_REACH + 6 : 3 + scale * 5

      if (steps > MAX_FREE_STEPS || (i === 1 && this.rng() < 0.5)) {
        this.railLine([
          [start - 0.6, top + RAIL_HEIGHT],
          [this.headX + 0.6, low + RAIL_HEIGHT],
        ])
      }
      this.push(this.headX, this.headX + landing, low, low, 'flat', true)
      this.headX += landing
    }
  }

  private drop(scale: number, keep = false): void {
    const height = Math.min(12, 0.9 + scale * 9)
    const climb = this.rampRun(height / range(this.rng, 0.4, 0.62), height)
    const top = this.settle(this.groundY + height)

    this.push(this.headX, this.headX + climb, this.groundY, top, 'flat', true)
    this.headX += climb

    const deck = 6 + scale * 16
    this.push(this.headX, this.headX + deck, top, top, 'flat', true)
    const ledgeY = top + LEDGE_HEIGHT
    this.push(this.headX + 1.5, this.headX + deck - 1.5, ledgeY, ledgeY, 'ledge', false)
    this.headX += deck

    const landY = keep ? top : this.groundY
    const landing = 20 + scale * 18
    this.push(this.headX, this.headX + landing, landY, landY, 'flat', true)
    this.groundY = landY
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
    this.stepsDown(count)
    const runX = this.headX
    const bottomY = this.groundY

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
    this.push(this.headX + 0.8, this.headX + length - 0.8, y, y, 'rail', false)
    this.headX += length
  }

  /** A block you roll along. Concrete, so it gives a manual and no sparks. */
  private ledgeSpot(scale: number): void {
    // Small is a block to pop onto. Big is a manual pad you can ride forever.
    const length = 3 + scale * range(this.rng, 12, 32)
    this.push(this.headX, this.headX + length, this.groundY, this.groundY, 'flat', true)
    const y = this.groundY + (scale > 0.6 ? LEDGE_HEIGHT * 0.55 : LEDGE_HEIGHT)
    this.push(this.headX + 1, this.headX + length - 1, y, y, 'ledge', false)
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

  /**
   * How to shape a hollow so a jump off its near lip is never punished. Short
   * ones clear in one ollie, ramp and all. Longer ones get a flat bottom at
   * least a jump across, so the jump lands on the flat and not on the climb.
   */
  private hollow(depth: number, want: number): { bottom: number; out: number } {
    const steep = depth / MAX_SLOPE
    if (want + steep <= JUMP_REACH) return { bottom: want, out: Math.max(1, steep) }
    return { bottom: Math.max(want, JUMP_REACH), out: Math.max(4, depth / 0.26) }
  }

  private bank(force: number, scale: number): void {
    // A bank is either a long gentle drift or a short sharp pitch, and the
    // roll decides which rather than averaging the two.
    const steep = this.rng() < 0.4
    const length = steep ? 4 + scale * 12 : 11 + scale * 40
    const swing = steep ? 2 + scale * 7 : 1.1 + scale * 13
    // The road wants to go down. A climb is something you build to jump off,
    // not something the ground does on its own, so an uphill drift is rare
    // and shallow, and a short sharp pitch never goes up at all.
    const raw =
      force > 0
        ? range(this.rng, swing * 0.45, swing * 0.75)
        : force < 0 || steep
          ? -range(this.rng, swing * 0.5, swing)
          : range(this.rng, -swing, swing * 0.28)
    const rise = raw > 0 ? raw * 0.5 : raw
    const endY = this.settle(this.groundY + rise)
    // A long descent is a run. A long ascent is a chore, so a bank that goes
    // up is capped however far the size roll wanted to take it.
    const wanted = endY > this.groundY ? Math.min(length, 30) : length
    const run = this.rampRun(wanted, endY - this.groundY)
    this.push(this.headX, this.headX + run, this.groundY, endY, 'flat', true)
    this.groundY = endY
    this.headX += run
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
