import * as C from './constants'
import { Car } from './car'
import { Road } from './road'
import { Skater } from './skater'
import { mulberry32, seedFrom } from '../core/rng'
import type { Input } from '../input'

export type Phase = 'ready' | 'running' | 'dead'

export class Game {
  phase: Phase = 'ready'
  distance = 0
  best = 0

  readonly car: Car
  readonly road: Road
  readonly skater = new Skater()

  private rng = mulberry32(0)

  constructor(private seedLabel: string) {
    const draw = () => this.rng()
    this.car = new Car(draw)
    this.road = new Road(draw, () => this.car.speed)
  }

  start(): void {
    this.rng = mulberry32(seedFrom(this.seedLabel))
    this.car.reset()
    this.road.reset()
    this.road.ensureAhead(this.car.x)
    this.skater.reset(this.car.x)
    this.distance = 0
    this.phase = 'running'
  }

  step(dt: number, input: Input): void {
    if (this.phase !== 'running') return

    this.car.step(dt)
    this.road.step(dt)
    this.road.ensureAhead(this.car.x)
    this.road.prune(this.car.x)
    this.skater.step(dt, this.road, input)

    const ceiling = this.car.speed + C.SPEED_LEAD_CAP
    if (this.skater.vx > ceiling) this.skater.vx = ceiling

    const place = this.framePosition
    if (place > C.LEAD_LIMIT) {
      this.skater.x = this.camLeft + C.LEAD_LIMIT * C.VIEW_WIDTH
      if (this.skater.vx > this.car.speed) this.skater.vx = this.car.speed
    }
    if (place < C.TRAIL_LIMIT) {
      this.phase = 'dead'
      this.best = Math.max(this.best, this.distance)
    }

    this.distance = Math.max(this.distance, this.skater.x)
  }

  /** World x of the left edge of the window. */
  get camLeft(): number {
    return this.car.x - C.VIEW_WIDTH * C.ANCHOR
  }

  /** Where the skater sits in the window, 0 at the left edge and 1 at the right. */
  get framePosition(): number {
    return (this.skater.x - this.camLeft) / C.VIEW_WIDTH
  }
}
