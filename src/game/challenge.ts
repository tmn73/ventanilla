import type { Road } from './road'
import type { Skater } from './skater'
import { satisfies, type Ask } from './trick'

/** One thing to do, on one thing to do it on. */
export interface Level {
  module: string
  scale: number
  ask: Ask
  /** How it is put to the player, in their words rather than the code's. */
  hint: string
}

interface Spot {
  from: number
  to: number
  level: Level
  outcome: 'open' | 'landed' | 'missed'
}

/** How far ahead spots are laid, how far apart, and how far past one counts as missed. */
const LOOKAHEAD = 150
const WALK_UP = 26
const OVERRUN = 12
/** How long the result of a spot stays on the screen once it is settled. */
const SHOUT = 1.6

/**
 * The lesson, laid along the road rather than put in front of the rider.
 *
 * Nothing stops and nothing is reset. Land the thing and the next spot carries
 * the next lesson; miss it and the next spot carries the same one again. The
 * run itself never breaks, which is the only reason it is worth riding.
 */
export class Coach {
  /** How far down the list he has got. */
  index = 0
  /** How many spots he has landed, which is the only score there is. */
  landed = 0
  /** What just happened, for showing, and how long it has left on the screen. */
  shout: 'landed' | 'missed' | '' = ''
  shoutFor = 0

  private spots: Spot[] = []

  constructor(private levels: Level[]) {}

  /** What he is being asked for right now, or nothing once the list is done. */
  get current(): Level | null {
    return this.spots.find((s) => s.outcome === 'open')?.level ?? null
  }

  /** Lays spots as he rides, so the road never runs out and never stops. */
  ensureAhead(road: Road, x: number): void {
    for (let guard = 0; guard < 8 && road.head < x + LOOKAHEAD; guard++) {
      const level = this.levels[Math.min(this.index, this.levels.length - 1)]!
      const laid = road.stage(level.module, level.scale, WALK_UP)
      this.spots.push({ ...laid, level, outcome: 'open' })
    }
  }

  step(dt: number, skater: Skater): void {
    if (this.shoutFor > 0) {
      this.shoutFor -= dt
      if (this.shoutFor <= 0) this.shout = ''
    }

    for (const spot of this.spots) {
      if (spot.outcome !== 'open') continue

      const trick = skater.landed
      if (trick && trick.at >= spot.from - 4 && trick.at <= spot.to + OVERRUN) {
        if (satisfies(trick, spot.level.ask)) {
          spot.outcome = 'landed'
          this.landed++
          // Only a landing moves him on. A miss leaves the list where it is,
          // so the very next spot asks for the same thing again.
          this.index++
          this.shout = 'landed'
          this.shoutFor = SHOUT
          continue
        }
      }

      if (skater.x > spot.to + OVERRUN) {
        spot.outcome = 'missed'
        this.shout = 'missed'
        this.shoutFor = SHOUT
      }
    }

    // Nothing behind him is looked at again.
    if (this.spots.length > 12) this.spots = this.spots.slice(-8)
  }
}

/**
 * The tutorial, in order. It opens loose: any boardslide counts, because the
 * first thing to learn is that the board goes across the rail at all.
 */
export const LEVELS: Level[] = [
  {
    module: 'railSpot',
    scale: 0.35,
    ask: { slide: 'boardslide', label: 'boardslide' },
    hint: 'Boardslide the rail',
  },
]
