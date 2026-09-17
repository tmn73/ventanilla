import { expect, test } from 'bun:test'
import { mulberry32, seedFrom } from '../core/rng'
import { coversZ, LANE_MAX, LANE_WIDTH, ROAD_HALF, Road } from './road'

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

test('there is ground under every point of the road', () => {
  // A hole is ground at a lower height. A place with nothing under it at all
  // would drop the player out of the world, and that must not exist.
  const empty: string[] = []

  for (let trial = 0; trial < 12; trial++) {
    const floors = laid(trial).segments.filter((s) => s.floor)
    for (let x = 40; x < LENGTH - 40; x += 1.7) {
      for (let z = -ROAD_HALF; z <= ROAD_HALF; z += 1.35) {
        const over = floors.some((s) => x >= s.x0 && x <= s.x1 && coversZ(s, z))
        if (!over) empty.push(`trial ${trial}: nothing at x=${x.toFixed(0)} z=${z.toFixed(1)}`)
      }
    }
  }

  expect(empty.slice(0, 5)).toEqual([])
})

test('everything you can ride sits on a lane', () => {
  // A lane change lands on a lane middle. A rail placed between two of them
  // could never be lined up with, however well you played.
  const adrift: string[] = []

  for (let trial = 0; trial < TRIALS; trial++) {
    for (const segment of laid(trial).segments) {
      if (segment.floor) continue
      const lane = segment.z / LANE_WIDTH
      if (Math.abs(lane - Math.round(lane)) > 1e-6 || Math.abs(lane) > LANE_MAX) {
        adrift.push(`trial ${trial}: ${segment.kind} at z=${segment.z.toFixed(2)}`)
      }
    }
  }

  expect(adrift.slice(0, 5)).toEqual([])
})

test('no lane is half in a hole', () => {
  // A hole takes whole lanes. A lane cut down the middle would be a line you
  // can neither ride nor leave.
  const cut: string[] = []

  for (let trial = 0; trial < 12; trial++) {
    for (const segment of laid(trial).segments) {
      if (!segment.floor || segment.halfWidth >= ROAD_HALF) continue
      for (const edge of [segment.z - segment.halfWidth, segment.z + segment.halfWidth]) {
        if (Math.abs(edge) > ROAD_HALF - 0.01) continue
        for (let lane = -LANE_MAX; lane <= LANE_MAX; lane++) {
          if (Math.abs(edge - lane * LANE_WIDTH) < 0.6) {
            cut.push(`trial ${trial}: edge ${edge.toFixed(2)} splits lane ${lane}`)
          }
        }
      }
    }
  }

  expect(cut.slice(0, 5)).toEqual([])
})
