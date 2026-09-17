import { expect, test } from 'bun:test'
import { mulberry32, seedFrom } from '../core/rng'
import { Road, surfaceYAt } from './road'

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

test('nothing you can ride has a hazard buried under it', () => {
  const buried: string[] = []
  for (let trial = 0; trial < TRIALS; trial++) {
    const road = laid(trial)
    for (const item of road.obstacles) {
      for (const segment of road.segments) {
        if (segment.floor) continue
        if (item.x < segment.x0 - 0.4 || item.x > segment.x1 + 0.4) continue
        const top = surfaceYAt(segment, item.x)
        if (top > item.base - 0.45 && top < item.base + item.height) {
          buried.push(`trial ${trial}: ${item.kind} under a ${segment.kind}`)
        }
      }
    }
  }
  expect(buried).toEqual([])
})

test('the pavement stays within reach of where it started', () => {
  for (let trial = 0; trial < TRIALS; trial++) {
    for (const segment of laid(trial).segments) {
      if (!segment.floor) continue
      expect(Math.abs(segment.y0 - 2.2)).toBeLessThan(8)
      expect(Math.abs(segment.y1 - 2.2)).toBeLessThan(8)
    }
  }
})
