import { expect, test } from 'bun:test'
import { DECK_REACH, DECK_SIDE, DECK_TOP, LIMB_HALF, pushFoot, STEP_OUT } from './skaterView'

/** Every hundredth of one kick. A fault anywhere in it is a fault on screen. */
const WHOLE_KICK = Array.from({ length: 101 }, (_, i) => i / 100)

test('the push foot never goes through the board', () => {
  for (const t of WHOLE_KICK) {
    const { along, height, out } = pushFoot(t)
    const overDeck = Math.abs(along) <= DECK_REACH
    // A leg has a thickness, and that thickness is what shows through the deck.
    const besideIt = out * STEP_OUT >= DECK_SIDE + LIMB_HALF
    const inTheDeck = overDeck && !besideIt && height < DECK_TOP
    expect({ t, along, height, inTheDeck }).toMatchObject({ inTheDeck: false })
  }
})

test('the kick reaches the road and comes back to the board', () => {
  const road = pushFoot(0.5)
  expect(road.height).toBeLessThan(DECK_TOP)
  expect(road.out).toBe(1)

  // It starts and ends where a foot stands on the deck, or it jumps there.
  const start = pushFoot(0.001)
  const end = pushFoot(0.999)
  expect(Math.abs(start.height - end.height)).toBeLessThan(0.02)
  expect(Math.abs(start.along - end.along)).toBeLessThan(0.02)
})
