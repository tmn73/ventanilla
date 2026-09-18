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

/** How far ahead the road is built, and how long the walk up to a spot is. */
const LOOKAHEAD = 150
const WALK_UP = 34
const OVERRUN = 12
/** Pavement laid while the spot in front of him is still undecided. */
const HOLD = 18
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
   * What the next spot will be. It is decided when the last one is settled and
   * not before: miss one and this still holds it, so the same thing comes
   * round again and again until it is landed.
   */
  private next: Level
  /**
   * The last landing already accounted for. Without it one trick settles the
   * spot it was done on and then the next one too, because the skater keeps
   * reporting it until he lands again.
   */
  private spent: unknown = null

  constructor(private rng: () => number) {
    this.next = rollLevel(rng)
  }

  /** What he is being asked for right now, or nothing once the list is done. */
  get current(): Level | null {
    return this.spots.find((s) => s.outcome === 'open')?.level ?? null
  }

  /** Gives up on the one in front of him. Another is along in a moment. */
  skip(): void {
    const open = this.spots.find((spot) => spot.outcome === 'open')
    if (open) open.outcome = 'missed'
    // Given up on rather than missed, so it does not come round again.
    this.next = rollLevel(this.rng)
  }

  /**
   * Lays road as he rides, and only lays the next spot once the one in front
   * of him is settled. Until then it is plain pavement: what comes next
   * depends on whether he lands this, so it cannot be built yet.
   */
  ensureAhead(road: Road, x: number): void {
    for (let guard = 0; guard < 10 && road.head < x + LOOKAHEAD; guard++) {
      if (this.spots.some((spot) => spot.outcome === 'open')) {
        road.pave(HOLD)
        continue
      }
      const laid = road.stage(this.next.module, this.next.scale, WALK_UP)
      this.spots.push({ ...laid, level: this.next, outcome: 'open' })
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
        // Landed, so the next one is something else.
        this.next = rollLevel(this.rng)
        this.shout = 'landed'
        this.shoutFor = SHOUT
        return
      }
    }

    if (skater.x > spot.to + OVERRUN) {
      // Missed, so `next` is left alone: the same spot and the same trick come
      // round again, and again, until he lands it or gives up on it.
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
