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
  /** How many spots he has landed, which is the only score there is. */
  landed = 0
  /** What just happened, for showing, and how long it has left on the screen. */
  shout: 'landed' | 'missed' | '' = ''
  shoutFor = 0

  private spots: Spot[] = []
  /**
   * The last landing already accounted for. Without it one trick settles the
   * spot it was done on and then the next one too, because the skater keeps
   * reporting it until he lands again.
   */
  private spent: unknown = null

  constructor(private rng: () => number) {}

  /** What he is being asked for right now, or nothing once the list is done. */
  get current(): Level | null {
    return this.spots.find((s) => s.outcome === 'open')?.level ?? null
  }

  /** Gives up on the one in front of him. Another is along in a moment. */
  skip(): void {
    const open = this.spots.find((spot) => spot.outcome === 'open')
    if (open) open.outcome = 'missed'
  }

  /** Lays spots as he rides, so the road never runs out and never stops. */
  ensureAhead(road: Road, x: number): void {
    for (let guard = 0; guard < 8 && road.head < x + LOOKAHEAD; guard++) {
      const level = rollLevel(this.rng)
      const laid = road.stage(level.module, level.scale, WALK_UP)
      this.spots.push({ ...laid, level, outcome: 'open' })
    }
  }

  step(dt: number, skater: Skater): void {
    if (this.shoutFor > 0) {
      this.shoutFor -= dt
      if (this.shoutFor <= 0) this.shout = ''
    }

    // Only the one in front of him. Looking at all of them let a trick landed
    // on this spot settle the next one as well, and a wrong one settle the
    // next one by luck.
    const spot = this.spots.find((s) => s.outcome === 'open')
    if (!spot) return

    // A landing is considered once, whatever comes of it. The skater keeps
    // reporting the last one until he lands again, and reading it twice is
    // what made a miss count as the next spot's success.
    const trick = skater.landed !== this.spent ? skater.landed : null
    if (trick) this.spent = trick

    if (trick && trick.at >= spot.from - 4 && trick.at <= spot.to + OVERRUN) {
      if (satisfies(trick, spot.level.ask)) {
        spot.outcome = 'landed'
        this.landed++
        this.shout = 'landed'
        this.shoutFor = SHOUT
        return
      }
    }

    if (skater.x > spot.to + OVERRUN) {
      spot.outcome = 'missed'
      this.shout = 'missed'
      this.shoutFor = SHOUT
    }

    // Nothing behind him is looked at again.
    if (this.spots.length > 12) this.spots = this.spots.slice(-8)
  }

}

/** Things to do on something you can slide along. */
const ON_A_RAIL: Ask[] = [
  { slide: 'boardslide', label: 'boardslide', how: 'pop, quarter turn with A or D' },
  { slide: 'boardslide', side: 'frontside', label: 'frontside boardslide', how: 'pop, quarter turn with D' },
  { slide: 'boardslide', side: 'backside', label: 'backside boardslide', how: 'pop, quarter turn with A' },
  { slide: 'tailslide', label: 'tailslide', how: 'quarter turn, then hold Left' },
  { slide: 'noseslide', label: 'noseslide', how: 'quarter turn, then hold Right' },
  { slide: 'boardslide', stance: 'switch', label: 'switch boardslide', how: 'land a 180 first, then boardslide' },
]

/** Things to do with the board off the ground. */
const IN_THE_AIR: Ask[] = [
  { flips: 1, flipSign: 1, label: 'kickflip', how: 'pop, then Left in the air' },
  { flips: 1, flipSign: -1, label: 'heelflip', how: 'pop, then Right in the air' },
  { flips: 2, flipSign: 1, label: 'double kickflip', how: 'pop, then hold Left' },
  { shoves: 1, label: 'shove-it', how: 'pop, then Q' },
  { shoves: 2, label: '360 shove-it', how: 'pop, then hold Q' },
  { halves: 1, label: '180', how: 'pop, then A or D until half round' },
  { halves: 1, side: 'frontside', label: 'frontside 180', how: 'pop, then D until half round' },
  { halves: 1, side: 'backside', label: 'backside 180', how: 'pop, then A until half round' },
  { halves: 2, label: '360', how: 'pop, then hold A or D all the way round' },
  { halves: 1, flips: 1, flipSign: 1, label: 'frontside flip', how: 'pop, Left, then D half round' },
  { flips: 1, shoves: 1, flipSign: 1, label: 'varial kickflip', how: 'pop, then Left and Q' },
  { flips: 1, shoves: 2, flipSign: 1, label: '360 flip', how: 'pop, then Left and hold Q' },
  { stance: 'nollie', label: 'nollie', how: 'hold Shift with Space' },
  { stance: 'nollie', flips: 1, flipSign: 1, label: 'nollie kickflip', how: 'Shift and Space, then Left' },
]

const RAILS = ['railSpot', 'ledgeSpot', 'kinkedRail', 'stepUp', 'plaza']
const AIRS = ['stairs', 'doubleSet', 'flatGap', 'channel', 'funbox', 'bumpToBar', 'quarterPipe']

/**
 * One spot and one thing to do on it, drawn at random.
 *
 * There is no ladder. A ladder means being stuck on step four, and the way out
 * of being stuck is another spot in ten seconds, not a menu.
 */
export function rollLevel(rng: () => number): Level {
  const onRail = rng() < 0.45
  const modules = onRail ? RAILS : AIRS
  const asks = onRail ? ON_A_RAIL : IN_THE_AIR
  const ask = asks[Math.floor(rng() * asks.length)]!
  return {
    module: modules[Math.floor(rng() * modules.length)]!,
    scale: 0.2 + rng() * 0.45,
    ask,
    hint: ask.label,
  }
}
