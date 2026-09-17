import { expect, test } from 'bun:test'
import { mulberry32, seedFrom } from '../core/rng'
import { Road } from './road'

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
      expect(Math.abs(segment.y0 - 2.2)).toBeLessThanOrEqual(60.01)
      expect(Math.abs(segment.y1 - 2.2)).toBeLessThanOrEqual(60.01)
    }
  }
})
