import { expect, test } from 'bun:test'
import { FIXED_DT } from './constants'
import { Game } from './game'

/** A player who never touches a key. The run has to carry on regardless. */
const IDLE = {
  jumpHeld: false,
  jumpPressed: false,
  flipPressed: false,
  flipSign: 1,
  grind: 0,
  pushing: false,
  braking: false,
  rotate: 0,
  lean: 0,
}
const idle = IDLE as never

test('a run never ends, whatever the road throws up', () => {
  const stalled: string[] = []

  for (let trial = 0; trial < 30; trial++) {
    const game = new Game(`seed-${trial}`)
    game.start()
    for (let tick = 0; tick < 120 * 120; tick++) game.step(FIXED_DT, idle)

    if (game.phase !== 'running') stalled.push(`trial ${trial}: phase ${game.phase}`)
    // Two minutes coasting, never pushing, still covers a few hundred metres.
    if (game.distance < 400) stalled.push(`trial ${trial}: only ${game.distance.toFixed(0)} m`)
  }

  expect(stalled).toEqual([])
})

test('the skater is never left under the pavement', () => {
  const sunk: string[] = []

  for (let trial = 0; trial < 20; trial++) {
    const game = new Game(`seed-${trial}`)
    game.start()
    for (let tick = 0; tick < 120 * 60; tick++) {
      game.step(FIXED_DT, idle)
      const floor = game.road.floorAt(game.skater.x, game.skater.z)
      if (game.skater.y < floor - 0.6) {
        sunk.push(`trial ${trial}: y=${game.skater.y.toFixed(2)} under floor ${floor.toFixed(2)}`)
        break
      }
    }
  }

  expect(sunk).toEqual([])
})

test('a player who keeps crossing the road is never trapped', () => {
  const stuck: string[] = []

  for (let trial = 0; trial < 20; trial++) {
    const game = new Game(`cross-${trial}`)
    game.start()
    for (let tick = 0; tick < 120 * 90; tick++) {
      // Sweeps the full width over and over, so every line gets ridden.
      const input = { ...IDLE, lean: Math.sin(tick / 90) } as never
      game.step(FIXED_DT, input)
      const floor = game.road.floorAt(game.skater.x, game.skater.z)
      if (!Number.isFinite(game.skater.z) || !Number.isFinite(game.skater.y)) {
        stuck.push(`trial ${trial}: left the world at tick ${tick}`)
        break
      }
      if (game.skater.y < floor - 0.6) {
        stuck.push(`trial ${trial}: y=${game.skater.y.toFixed(2)} under floor ${floor.toFixed(2)}`)
        break
      }
    }
    if (game.distance < 300) stuck.push(`trial ${trial}: only ${game.distance.toFixed(0)} m`)
  }

  expect(stuck).toEqual([])
})
