import { expect, test } from 'bun:test'
import { mulberry32, seedFrom } from '../core/rng'
import { Coach } from './challenge'
import { Road } from './road'
import type { Skater } from './skater'
import type { Trick } from './trick'

/** Just enough of a skater for the coach: where he is and what he last landed. */
const rider = (x: number, landed: Trick | null = null, sideways = false) =>
  ({ x, landed, sideways }) as unknown as Skater

const trick = (over: Partial<Trick> = {}): Trick => ({
  name: 'x',
  halves: 0,
  flips: 0,
  flipSign: 1,
  shoves: 0,
  shoveSign: -1,
  slide: 'none',
  side: '',
  stance: '',
  surface: 'rail',
  grade: 'clean',
  at: 0,
  ...over,
})

function laid() {
  const rng = mulberry32(seedFrom('coach'))
  const road = new Road(() => rng())
  road.reset(0)
  const coach = new Coach(() => rng())
  coach.ensureAhead(road, 0)
  return { coach, road }
}

test('a wrong trick does not settle the spot', () => {
  const { coach } = laid()
  const asked = coach.current
  const where = coach.target!
  expect(asked).not.toBeNull()

  // Landed right on the spot, and deliberately not what was asked for: every
  // part of it is set against the ask rather than merely left out.
  const wrong = trick({
    at: where.from,
    slide: asked!.ask.slide === 'tailslide' ? 'noseslide' : 'tailslide',
    side: asked!.ask.side === 'frontside' ? 'backside' : 'frontside',
    stance: 'fakie',
    halves: 0,
    flips: 0,
    shoves: 0,
  })
  coach.step(1 / 120, rider(where.from, wrong))

  expect(coach.landed).toBe(0)
  expect(coach.current).toBe(asked)
})

test('riding past without landing it brings the same call back', () => {
  const { coach, road } = laid()
  const asked = coach.current!

  coach.step(1 / 120, rider(9999))
  expect(coach.landed).toBe(0)

  // The next spot is only built once this one is settled, and it is the same.
  coach.ensureAhead(road, 9999)
  expect(coach.current?.hint).toBe(asked.hint)
  expect(coach.current?.module).toBe(asked.module)
})

test('one landing settles one spot and no more', () => {
  const { coach, road } = laid()
  const asked = coach.current!
  const where = coach.target!
  const done = trick({ at: where.from, ...askedAsTrick(asked.ask) })

  coach.step(1 / 120, rider(where.from, done))
  expect(coach.landed).toBe(1)

  // The very same landing is still on the skater. It must not count twice.
  coach.ensureAhead(road, 9999)
  coach.step(1 / 120, rider(200, done))
  expect(coach.landed).toBe(1)
})

/** The smallest trick that satisfies an ask, built from the ask itself. */
function askedAsTrick(ask: ReturnType<typeof Object>): Partial<Trick> {
  const a = ask as Record<string, unknown>
  return {
    slide: (a.slide as Trick['slide']) ?? 'none',
    side: (a.side as Trick['side']) ?? '',
    stance: (a.stance as string) ?? '',
    halves: (a.halves as number) ?? 0,
    flips: (a.flips as number) ?? 0,
    flipSign: (a.flipSign as number) ?? 1,
    shoves: (a.shoves as number) ?? 0,
  }
}

test('the retry comes back quickly, not eventually', () => {
  // The gap between missing a spot and meeting the next one is the whole feel
  // of the mode. Too long and it reads as never having been offered a retry.
  const rng = mulberry32(seedFrom('gap'))
  const road = new Road(() => rng())
  road.reset(0)
  const coach = new Coach(() => rng())

  let x = 0
  const gaps: number[] = []
  for (let spot = 0; spot < 6; spot++) {
    coach.ensureAhead(road, x)
    const where = coach.target
    if (!where) break
    gaps.push(where.from - x)
    // Ride past it without doing the thing.
    x = where.to + 20
    coach.step(1 / 120, rider(x))
  }

  expect(gaps.length).toBeGreaterThan(3)
  for (const gap of gaps) expect(gap).toBeLessThan(52)
})

test('a slide counts when he settles on the end, not when he touches down', () => {
  // He lands across the rail first and puts his weight on an end after. The
  // trick he is doing is the one at the end of that, not the one at the start.
  const rng = mulberry32(seedFrom('slide'))
  const road = new Road(() => rng())
  road.reset(0)
  const coach = new Coach(() => rng())
  coach.ensureAhead(road, 0)

  // Walk the calls on until one of them asks for a tailslide.
  for (let guard = 0; guard < 40 && coach.current?.ask.slide !== 'tailslide'; guard++) {
    coach.skip()
    coach.ensureAhead(road, road.head)
  }
  const where = coach.target
  if (!where || coach.current?.ask.slide !== 'tailslide') return

  const sliding = trick({ at: where.from, slide: 'boardslide' })
  coach.step(1 / 120, rider(where.from, sliding, true))
  expect(coach.landed).toBe(0)

  // Same landing, same object, now weighted onto the tail.
  sliding.slide = 'tailslide'
  coach.step(1 / 120, rider(where.from + 1, sliding, true))
  expect(coach.landed).toBe(1)
})
