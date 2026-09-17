import * as C from './constants'
import { Car } from './car'
import { Road } from './road'
import { Skater } from './skater'
import { mulberry32, seedFrom } from '../core/rng'
import type { Input } from '../input'

export type Phase = 'ready' | 'running' | 'falling' | 'dead'

export class Game {
  phase: Phase = 'ready'
  distance = 0
  best = 0

  readonly car: Car
  readonly road: Road
  readonly skater = new Skater()

  /** The seed the current run was built from. */
  seedLabel = ''

  private rng = mulberry32(0)
  private startX = 0

  /** A null seed means a fresh road every run. A string pins the same one. */
  constructor(private fixedSeed: string | null) {
    const draw = () => this.rng()
    this.car = new Car(draw)
    this.road = new Road(draw)
  }

  start(): void {
    this.seedLabel = this.fixedSeed ?? Math.random().toString(36).slice(2, 10)
    this.rng = mulberry32(seedFrom(this.seedLabel))
    this.car.reset()
    this.road.reset(this.car.x)
    this.road.ensureAhead(this.car.x)
    this.skater.reset(this.car.x)
    this.startX = this.car.x
    this.distance = 0
    this.phase = 'running'
  }

  step(dt: number, input: Input): void {
    if (this.phase !== 'running' && this.phase !== 'falling') return

    this.car.step(dt)
    this.road.ensureAhead(this.car.x)
    this.road.prune(this.car.x)
    this.skater.step(dt, this.road, input, this.car.x, this.car.speed)

    if (this.phase === 'running') {
      this.distance = this.skater.x - this.startX
      if (this.skater.fell) this.phase = 'falling'
    } else if (this.skater.fallTime >= C.FALL_GRACE) {
      this.phase = 'dead'
      this.best = Math.max(this.best, this.distance)
    }
  }

  /** World x of the left edge of the window. */
  get camLeft(): number {
    return this.car.x - C.VIEW_WIDTH * C.ANCHOR
  }
}
