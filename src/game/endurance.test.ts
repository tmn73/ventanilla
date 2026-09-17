import { expect, test } from 'bun:test'
import { FIXED_DT } from './constants'
import { Game } from './game'
import { Path } from '../render/path'

const idle = {
  jumpHeld: false,
  jumpPressed: false,
  flipPressed: false,
  flipSign: 1,
  grind: 0,
  pushing: false,
  braking: false,
  rotate: 0,
} as never

/**
 * The tab was dying after a few minutes. Nothing here may grow with the
 * distance travelled, so both lists get held to a ceiling over a long run.
 */
test('a ten minute run holds its memory flat', () => {
  const game = new Game('endurance')
  game.start()
  const path = new Path(game.seedLabel)

  let peakSegments = 0
  let peakLegs = 0

  for (let tick = 0; tick < 120 * 600; tick++) {
    game.step(FIXED_DT, idle)
    if (tick % 240 !== 0) continue

    // The renderer walks the path every frame, which is what used to make the
    // leg list both grow and get slower to search.
    path.headingAt(game.skater.x)
    path.forget(game.skater.x)

    peakSegments = Math.max(peakSegments, game.road.segments.length)
    peakLegs = Math.max(peakLegs, path.legCount)
  }

  expect(game.distance).toBeGreaterThan(1500)
  expect(peakSegments).toBeLessThan(400)
  expect(peakLegs).toBeLessThan(40)
})
