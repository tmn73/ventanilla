import { expect, test } from 'bun:test'
import { FIXED_DT } from './constants'
import { Game } from './game'

/** A player who never touches a key. Every death must be something they hit. */
const idle = { jumpHeld: false, jumpPressed: false, leftPressed: false, grind: 0 } as never

test('rolling without jumping only ever dies to an obstacle', () => {
  const falls: string[] = []

  for (let trial = 0; trial < 30; trial++) {
    const game = new Game(`seed-${trial}`)
    game.start()

    for (let tick = 0; tick < 120 * 90; tick++) {
      game.step(FIXED_DT, idle)
      if (game.phase === 'running') continue

      const skater = game.skater
      const struck = game.road.obstacles.some(
        (item) => Math.abs(item.x - skater.x) < item.halfWidth + 0.6,
      )
      if (!struck) falls.push(`trial ${trial}: fell at ${game.distance.toFixed(1)} m`)
      break
    }
  }

  expect(falls).toEqual([])
})
