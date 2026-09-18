/**
 * What a trick was made of, rather than what it is called.
 *
 * A challenge has to ask for a kickflip and accept a 360 flip, which is one,
 * and refuse a varial heelflip, which is not. Neither of those can be decided
 * from the name: "360 flip" does not contain the word kickflip and "varial
 * kickflip" contains it by accident of spelling. So the parts are kept.
 */
export interface Trick {
  /** What a skater calls it, for showing. */
  name: string
  /** Half turns of the body, signed. Frontside is positive for a regular rider. */
  halves: number
  /** Whole revolutions of the deck, and which way it rolled. */
  flips: number
  flipSign: number
  /** Half turns of the board under him, and which way it scooped. */
  shoves: number
  shoveSign: number
  /** Lying across the obstacle rather than along it. */
  slide: 'none' | 'boardslide' | 'tailslide' | 'noseslide'
  /** Frontside or backside, from whichever rotation there was. */
  side: 'frontside' | 'backside' | ''
  /** Empty, nollie, switch or fakie. */
  stance: string
  /** What he landed on. */
  surface: string
  /** Square enough to be worth saying so, or scrappy enough to have cost him. */
  grade: 'perfect' | 'clean' | 'sketchy'
  /** Where along the road it landed. */
  at: number
}

/**
 * What a challenge asks for. Every field given has to be matched; every field
 * left out is not looked at, which is the whole of the difference between an
 * easy level and a strict one.
 */
export interface Ask {
  halves?: number
  flips?: number
  flipSign?: number
  shoves?: number
  slide?: Trick['slide']
  side?: Trick['side']
  stance?: string
  /** What it says on the screen. */
  label: string
}

/**
 * Does this trick satisfy the ask?
 *
 * More than was asked for always passes: asked a boardslide, a kickflip
 * boardslide is one and then some, and refusing it would punish playing well.
 * So counts are a floor, not an equality, and anything unasked is ignored.
 */
export function satisfies(trick: Trick, ask: Ask): boolean {
  if (trick.grade === 'sketchy') return false
  if (ask.slide !== undefined && trick.slide !== ask.slide) return false
  if (ask.side !== undefined && trick.side !== ask.side) return false
  if (ask.stance !== undefined && trick.stance !== ask.stance) return false
  if (ask.halves !== undefined && Math.abs(trick.halves) < Math.abs(ask.halves)) return false
  if (ask.flips !== undefined && trick.flips < ask.flips) return false
  if (ask.shoves !== undefined && trick.shoves < ask.shoves) return false
  // Which way the deck rolled is a different trick, not a bigger one.
  if (ask.flipSign !== undefined && trick.flips > 0 && trick.flipSign !== ask.flipSign) return false
  return true
}
