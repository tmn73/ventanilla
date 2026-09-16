import { LANE_Y, VIEW_WIDTH } from './constants'
import { range } from '../core/rng'

export type SurfaceKind = 'ground' | 'rail' | 'wall' | 'wire' | 'vehicle'

export interface Segment {
  x0: number
  x1: number
  y: number
  lane: number
  kind: SurfaceKind
  /** Metres per second. Only vehicles move. */
  vx: number
}

interface LaneSpec {
  kind: SurfaceKind
  run: [number, number]
  gap: [number, number]
  /** Odds that a passing truck fills the break. */
  vehicleChance: number
}

/** Lane 0 is the dirt verge and never breaks, so a fall always lands somewhere. */
const LANES: LaneSpec[] = [
  { kind: 'ground', run: [60, 60], gap: [0, 0], vehicleChance: 0 },
  { kind: 'rail', run: [16, 36], gap: [6, 13], vehicleChance: 0.4 },
  { kind: 'wall', run: [11, 26], gap: [8, 16], vehicleChance: 0 },
  { kind: 'wire', run: [9, 22], gap: [10, 19], vehicleChance: 0 },
]

const VEHICLE_Y = 2.1
const LOOKAHEAD = VIEW_WIDTH * 2.5
const TRAIL = VIEW_WIDTH * 0.8

export class Road {
  segments: Segment[] = []
  private cursor = [0, 0, 0, 0]

  constructor(
    private rng: () => number,
    private carSpeed: () => number,
  ) {}

  reset(): void {
    this.segments = []
    this.cursor = [0, 0, 0, 0]
  }

  /** Lays track until the generator is well past the right edge of the window. */
  ensureAhead(x: number): void {
    const limit = x + LOOKAHEAD
    for (let lane = 0; lane < LANES.length; lane++) {
      const spec = LANES[lane]!
      while (this.cursor[lane]! < limit) {
        const x0 = this.cursor[lane]!
        const run = range(this.rng, spec.run[0], spec.run[1])
        this.segments.push({
          x0,
          x1: x0 + run,
          y: LANE_Y[lane]!,
          lane,
          kind: spec.kind,
          vx: 0,
        })
        let next = x0 + run
        if (spec.gap[1] > 0) {
          const gap = range(this.rng, spec.gap[0], spec.gap[1])
          if (this.rng() < spec.vehicleChance) this.spawnVehicle(next, gap)
          next += gap
        }
        this.cursor[lane] = next
      }
    }
  }

  private spawnVehicle(gapStart: number, gapWidth: number): void {
    const length = Math.max(7, gapWidth * range(this.rng, 0.9, 1.4))
    this.segments.push({
      x0: gapStart - 1,
      x1: gapStart - 1 + length,
      y: VEHICLE_Y,
      lane: 1,
      kind: 'vehicle',
      vx: this.carSpeed() * range(this.rng, 0.72, 1.12),
    })
  }

  step(dt: number): void {
    for (const segment of this.segments) {
      if (segment.vx === 0) continue
      segment.x0 += segment.vx * dt
      segment.x1 += segment.vx * dt
    }
  }

  prune(x: number): void {
    const cutoff = x - TRAIL
    this.segments = this.segments.filter((s) => s.x1 > cutoff)
  }

  /**
   * Highest surface the skater crossed while falling from fromY to toY.
   * Returns null when he is still in open air.
   */
  landingAt(x: number, fromY: number, toY: number): Segment | null {
    let best: Segment | null = null
    for (const segment of this.segments) {
      if (x < segment.x0 || x > segment.x1) continue
      if (segment.y > fromY + 1e-4 || segment.y < toY - 1e-4) continue
      if (!best || segment.y > best.y) best = segment
    }
    return best
  }

  /** True while the segment still runs under this point. */
  stillCarries(segment: Segment, x: number): boolean {
    return x >= segment.x0 && x <= segment.x1
  }
}
