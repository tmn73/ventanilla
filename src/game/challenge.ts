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

/** Where the rider starts, and how far past the spot counts as having missed it. */
const START = 30
const OVERRUN = 14

/**
 * A spot, a thing to do on it, and as many attempts as you like.
 *
 * Nothing here judges by the name of a trick. The skater reports what the
 * trick was made of and the level says what it needs, so asking for a
 * boardslide accepts a kickflip boardslide without having to list it.
 */
export class Challenge {
  /** 'try' while it is on him, 'won' for the beat after he lands it. */
  phase: 'try' | 'won' = 'try'
  /** How many times he has been put back, which is shown and never punished. */
  attempts = 0
  private spot = { from: 0, to: 0 }

  constructor(readonly level: Level) {}

  /** Lays the spot out and says where the rider goes. */
  build(road: Road): number {
    road.reset(0)
    this.spot = road.stage(this.level.module, this.level.scale, START)
    road.ensureAhead(this.spot.to + 60)
    this.phase = 'try'
    return 0
  }

  /**
   * Called every step. Returns true when the rider has to go back, which is
   * simply having gone past the spot without doing the thing.
   */
  step(skater: Skater): boolean {
    if (this.phase === 'won') return false

    const landed = skater.landed
    if (landed && landed.at >= this.spot.from - 4 && landed.at <= this.spot.to + OVERRUN) {
      if (satisfies(landed, this.level.ask)) {
        this.phase = 'won'
        return false
      }
    }

    if (skater.x > this.spot.to + OVERRUN) {
      this.attempts++
      return true
    }
    return false
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
