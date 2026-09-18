import { expect, test } from 'bun:test'
import { mulberry32, seedFrom } from '../core/rng'
import { Coach, type Level } from './challenge'
import { FIXED_DT } from './constants'
import { Game } from './game'
import type { Segment } from './road'
import type { Ask, Trick } from './trick'

const KEYS = {
  jumpHeld: false,
  jumpReleased: false,
  popLeading: false,
  flipPressed: false,
  flipSign: 1,
  shovePressed: false,
  shoveSign: 1,
  shoveHeld: false,
  flipHeld: false,
  grind: 0,
  pushing: false,
  braking: false,
  rotate: 0,
  pressedEnd: 0,
  lean: 0,
}

/** How long the pop hangs him up, as a share of the gap he has to clear. */
const REACH = 0.3

/**
 * Rides a real skater at a real rail and turns him a quarter on the way in,
 * the way a player does it. `after` is asked for the input once he is on the
 * rail, which is where every one of these questions actually lives.
 */
function slide(game: Game, rail: Segment, turn: 1 | -1, ticks: number) {
  let popped = false
  let landed = false
  let onRail: Trick | null = null
  for (let tick = 0; tick < ticks; tick++) {
    const input = { ...KEYS }
    const toGo = rail.x0 - game.skater.x
    const gap = game.skater.vx * REACH
    if (!landed) {
      // Keep his speed up, or he arrives at four metres a second and the pop
      // lands him short of the rail rather than on it.
      if (!popped && toGo > 12 && game.skater.vx < 11) input.pushing = true
      if (!popped && toGo < gap + 3 && toGo > gap) input.jumpHeld = true
      if (!popped && toGo <= gap) {
        input.jumpReleased = true
        popped = true
      }
      // Turn until the board is across the rail, then hold it there. Landing
      // mid turn is a bail, not a slide.
      if (popped && game.skater.support === null && Math.abs(game.skater.yaw) < 1.45) {
        input.rotate = turn
      }
    }
    game.step(FIXED_DT, input as never)
    if (game.skater.sideways) {
      landed = true
      onRail = game.skater.landed
    }
    // Once he is off the far end and back on the ground, the question is over.
    if (landed && !game.skater.sideways && game.skater.support && game.skater.x > rail.x1) break
  }
  return onRail
}

function onRails(ask?: Ask) {
  const game = new Game('slide')
  game.course = 'rails'
  if (ask) {
    const rng = mulberry32(seedFrom('slide'))
    const coach = new Coach(() => rng())
    const level: Level = { module: 'railSpot', scale: 0.35, ask, hint: ask.label }
    ;(coach as unknown as { next: Level }).next = level
    game.coach = coach
  }
  game.start()
  game.road.ensureAhead(300)
  return game
}

function firstRail(game: Game): Segment {
  const rail = game.road.segments.find((s) => s.kind === 'rail' && s.x0 > 20)
  if (!rail) throw new Error('the rails course laid no rail')
  return rail
}

test('turning a quarter onto a rail is a boardslide, and it says which way', () => {
  for (const [turn, side] of [
    [1, 'frontside'],
    [-1, 'backside'],
  ] as const) {
    const game = onRails()
    const onRail = slide(game, firstRail(game), turn, 7200)
    expect(onRail?.slide).toBe('boardslide')
    expect(onRail?.side).toBe(side)
  }
})

test('riding a boardslide out to the end counts, and he keeps his stance', () => {
  const ask: Ask = {
    slide: 'boardslide',
    side: 'frontside',
    label: 'frontside boardslide',
    how: 'pop, quarter turn with D',
  }
  const game = onRails(ask)
  const rail = firstRail(game)
  slide(game, rail, 1, 7200)

  // He touched nothing on the rail and rolled off the end of it.
  expect(game.coach!.landed).toBe(1)
  // Coming off square, he unwinds the way he came in. Being handed a switch
  // stance here named his next landing for a trick he never did.
  expect(game.skater.landed?.stance).not.toBe('switch')
  // Rolling off the end is not an ollie. It used to say so, over the top of
  // the slide he had just done.
  expect(game.skater.trick).toContain('boardslide')
  expect(game.skater.x).toBeGreaterThan(rail.x1)
})
