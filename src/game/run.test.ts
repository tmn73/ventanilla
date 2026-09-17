import { expect, test } from 'bun:test'
import { FIXED_DT } from './constants'
import { Game } from './game'

/** A player who never touches a key. The run has to carry on regardless. */
const IDLE = {
  jumpHeld: false,
  jumpReleased: false,
  popLeading: false,
  flipPressed: false,
  flipSign: 1,
  grind: 0,
  pushing: false,
  braking: false,
  rotate: 0,
  pressedEnd: 0,
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
      const floor = game.road.floorAt(game.skater.x)
      if (game.skater.y < floor - 0.6) {
        sunk.push(`trial ${trial}: y=${game.skater.y.toFixed(2)} under floor ${floor.toFixed(2)}`)
        break
      }
    }
  }

  expect(sunk).toEqual([])
})

test('a player who keeps popping still gets down the road', () => {
  const stuck: string[] = []

  for (let trial = 0; trial < 20; trial++) {
    const game = new Game(`pop-${trial}`)
    game.start()
    for (let tick = 0; tick < 120 * 90; tick++) {
      // Holds for a quarter second, then lets go. The pop is the release.
      const phase = tick % 90
      const input = {
        ...IDLE,
        jumpHeld: phase < 30,
        jumpReleased: phase === 30,
      } as never
      game.step(FIXED_DT, input)

      const floor = game.road.floorAt(game.skater.x)
      if (!Number.isFinite(game.skater.y) || game.skater.y < floor - 0.6) {
        stuck.push(`trial ${trial}: y=${game.skater.y.toFixed(2)} under floor ${floor.toFixed(2)}`)
        break
      }
    }
    if (game.phase !== 'running') stuck.push(`trial ${trial}: phase ${game.phase}`)
    // Ninety seconds without a single push sits near the floor speed.
    if (game.distance < 330) stuck.push(`trial ${trial}: only ${game.distance.toFixed(0)} m`)
  }

  expect(stuck).toEqual([])
})
