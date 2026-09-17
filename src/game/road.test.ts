import { expect, test } from 'bun:test'
import { mulberry32, seedFrom } from '../core/rng'
import { JUMP_REACH, Road, surfaceYAt, type Segment } from './road'

const TRIALS = 60
const LENGTH = 1500

function laid(trial: number): Road {
  const rng = mulberry32(seedFrom(`seed-${trial}`))
  const road = new Road(() => rng())
  road.reset(0)
  road.ensureAhead(LENGTH)
  return road
}

test('the pavement never breaks', () => {
  const holes: string[] = []
  for (let trial = 0; trial < TRIALS; trial++) {
    const floors = laid(trial)
      .segments.filter((s) => s.floor)
      .sort((a, b) => a.x0 - b.x0)
    for (let i = 1; i < floors.length; i++) {
      const gap = floors[i]!.x0 - floors[i - 1]!.x1
      if (gap > 0.01) holes.push(`trial ${trial}: ${gap.toFixed(2)} m at x=${floors[i]!.x0.toFixed(1)}`)
    }
  }
  expect(holes).toEqual([])
})

test('the pavement stays within reach of where it started', () => {
  for (let trial = 0; trial < TRIALS; trial++) {
    for (const segment of laid(trial).segments) {
      if (!segment.floor) continue
      expect(Math.abs(segment.y0 - 2.2)).toBeLessThanOrEqual(20.01)
      expect(Math.abs(segment.y1 - 2.2)).toBeLessThanOrEqual(20.01)
    }
  }
})

test('you can always ride out of a hollow', () => {
  // A hole is only fun if the far side is a ramp. A wall traps the player,
  // and a bank at 45 degrees is already the steepest thing we build.
  // and this game never traps the player.
  const walls: string[] = []

  for (let trial = 0; trial < TRIALS; trial++) {
    for (const s of laid(trial).segments) {
      if (!s.floor) continue
      const run = s.x1 - s.x0
      const climb = s.y1 - s.y0
      if (climb > 0.05 && climb / run > 1) {
        walls.push(`trial ${trial}: climbs ${climb.toFixed(1)} m over ${run.toFixed(1)} m`)
      }
    }
  }

  expect(walls).toEqual([])
})

/** The lowest ground at a point, which is what a fall ends on. */
function groundAt(floors: Segment[], x: number): number | null {
  let low: number | null = null
  for (const s of floors) {
    if (x < s.x0 || x > s.x1) continue
    const top = surfaceYAt(s, x)
    if (low === null || top < low) low = top
  }
  return low
}

test('a jump off a lip never lands on the way up', () => {
  // Off the edge of a hole you either come down on its flat bottom or clear
  // the far side. Coming down part way up the ramp out is the one landing
  // that punishes the jump, and it must not be possible to build.
  const bad: string[] = []

  for (let trial = 0; trial < TRIALS; trial++) {
    const floors = laid(trial).segments.filter((s) => s.floor)
    for (const lip of floors) {
      if (lip.x1 > LENGTH - JUMP_REACH - 5) continue
      const top = surfaceYAt(lip, lip.x1)
      const below = groundAt(floors, lip.x1 + 0.05)
      if (below === null || top - below < 1) continue

      const far = groundAt(floors, lip.x1 + JUMP_REACH)
      if (far === null) continue
      const onBottom = Math.abs(far - below) < 0.01
      const cleared = far >= top - 0.01
      if (!onBottom && !cleared) bad.push(`trial ${trial}: lip at x=${lip.x1.toFixed(0)}`)
    }
  }

  expect(bad.slice(0, 5)).toEqual([])
})
