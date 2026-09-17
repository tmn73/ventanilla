import { expect, test } from 'bun:test'
import { BACKSIDE_SHOVE, FRONTSIDE_SHOVE, HEELFLIP, KICKFLIP, swipeAction } from './input'

const TRAILING = -1
const LEADING = 1
const HELD = true
const ALONE = false

test('an ollie needs the other foot on the board', () => {
  // Straight up off the front foot, with the back foot resting on the tail.
  expect(swipeAction(90, LEADING, HELD)).toEqual({ popEnd: TRAILING, latch: 2 })
  // The same flick with nothing holding the other end does nothing at all.
  expect(swipeAction(90, LEADING, ALONE)).toEqual({})
})

test('the end that was held is the end it pops off', () => {
  expect(swipeAction(90, LEADING, HELD).popEnd).toBe(TRAILING)
  expect(swipeAction(90, TRAILING, HELD).popEnd).toBe(LEADING)
})

test('flicking out to one side rolls the deck with it', () => {
  expect(swipeAction(45, LEADING, HELD)).toEqual({ popEnd: TRAILING, flip: KICKFLIP, latch: 1 })
  expect(swipeAction(135, LEADING, HELD)).toEqual({ popEnd: TRAILING, flip: HEELFLIP, latch: -1 })
})

test('a scoop is the whole trick, with no other foot needed', () => {
  const back = swipeAction(-120, TRAILING, ALONE)
  expect(back.shove).toBe(BACKSIDE_SHOVE)
  expect(back.popEnd).toBe(TRAILING)
  expect(swipeAction(-60, TRAILING, ALONE).shove).toBe(FRONTSIDE_SHOVE)
})

test('the foot that scoops is the end it pops off', () => {
  // Scooping the nose is a nollie shove-it, and a fakie one turned round.
  expect(swipeAction(-120, LEADING, ALONE).popEnd).toBe(LEADING)
  expect(swipeAction(-120, TRAILING, ALONE).popEnd).toBe(TRAILING)
})

test('only the back foot pushes, so there is no mongo', () => {
  expect(swipeAction(180, TRAILING, ALONE)).toEqual({ push: true })
  expect(swipeAction(180, LEADING, ALONE)).toEqual({})
})

test('nothing fires from a flick that goes nowhere useful', () => {
  expect(swipeAction(0, TRAILING, HELD)).toEqual({})
  expect(swipeAction(0, LEADING, HELD)).toEqual({})
})
