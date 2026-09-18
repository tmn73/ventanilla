import { expect, test } from 'bun:test'
import { satisfies, type Trick } from './trick'

const landed = (over: Partial<Trick> = {}): Trick => ({
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

test('more than was asked for still passes', () => {
  const ask = { slide: 'boardslide' as const, label: 'boardslide', how: '' }
  // A plain one.
  expect(satisfies(landed({ slide: 'boardslide' }), ask)).toBe(true)
  // The same with a flip in it is one and then some.
  expect(satisfies(landed({ slide: 'boardslide', flips: 1 }), ask)).toBe(true)
  // A tailslide is a different trick, not a bigger one.
  expect(satisfies(landed({ slide: 'tailslide' }), ask)).toBe(false)
})

test('a name would have got these wrong, and the parts do not', () => {
  const ask = { flips: 1, flipSign: 1, label: 'kickflip', how: '' }
  // A 360 flip is a kickflip with a shove in it. Its name says neither word.
  expect(satisfies(landed({ flips: 1, flipSign: 1, shoves: 2 }), ask)).toBe(true)
  // A varial heelflip has the deck rolling the other way, so it is not one.
  expect(satisfies(landed({ flips: 1, flipSign: -1, shoves: 1 }), ask)).toBe(false)
})

test('what is not asked for is not looked at', () => {
  const loose = { slide: 'boardslide' as const, label: 'boardslide', how: '' }
  const strict = { slide: 'boardslide' as const, side: 'frontside' as const, label: 'fs board', how: '' }
  const back = landed({ slide: 'boardslide', side: 'backside' })
  expect(satisfies(back, loose)).toBe(true)
  expect(satisfies(back, strict)).toBe(false)
})

test('a landing he did not ride away from is not a landing', () => {
  const ask = { slide: 'boardslide' as const, label: 'boardslide', how: '' }
  expect(satisfies(landed({ slide: 'boardslide', grade: 'sketchy' }), ask)).toBe(false)
})
