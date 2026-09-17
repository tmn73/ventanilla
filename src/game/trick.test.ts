import { expect, test } from 'bun:test'
import { nameTrick } from './skater'

const KICK = 1
const HEEL = -1
const BS = -1
const FS = 1
const REGULAR = 1

/** halves, flips, flipSign, shoves, shoveSign -> what a skater calls it. */
const CASES: Array<[string, number, number, number, number, number]> = [
  ['ollie', 0, 0, KICK, 0, BS],
  ['kickflip', 0, 1, KICK, 0, BS],
  ['heelflip', 0, 1, HEEL, 0, BS],
  ['double kickflip', 0, 2, KICK, 0, BS],
  ['triple heelflip', 0, 3, HEEL, 0, BS],
  ['shove-it', 0, 0, KICK, 1, BS],
  ['frontside shove-it', 0, 0, KICK, 1, FS],
  ['360 shove-it', 0, 0, KICK, 2, BS],
  ['varial kickflip', 0, 1, KICK, 1, BS],
  ['varial heelflip', 0, 1, HEEL, 1, BS],
  ['360 flip', 0, 1, KICK, 2, BS],
  ['laser flip', 0, 1, HEEL, 2, BS],
  ['frontside 180', 1, 0, KICK, 0, BS],
  ['backside 180', -1, 0, KICK, 0, BS],
  ['frontside flip', 1, 1, KICK, 0, BS],
  ['frontside heelflip', 1, 1, HEEL, 0, BS],
  ['frontside 360 kickflip', 2, 1, KICK, 0, BS],
]

test('a trick is called what a skater calls it', () => {
  const wrong: string[] = []
  for (const [want, halves, flips, flipSign, shoves, shoveSign] of CASES) {
    const got = nameTrick(halves, flips, flipSign, shoves, shoveSign, REGULAR, false, '', false)
    if (got !== want) wrong.push(`${want} -> ${got}`)
  }
  expect(wrong).toEqual([])
})

test('riding switch says so, and only once', () => {
  const got = nameTrick(1, 1, KICK, 0, BS, REGULAR, true, '', false)
  expect(got).toBe('switch frontside flip')
})

test('goofy reverses which side a spin is on', () => {
  const regular = nameTrick(1, 0, KICK, 0, BS, 1, false, '', false)
  const goofy = nameTrick(1, 0, KICK, 0, BS, -1, false, '', false)
  expect(regular).toBe('frontside 180')
  expect(goofy).toBe('backside 180')
})
