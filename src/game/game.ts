import * as C from './constants'
import { Road, type Course } from './road'
import { Skater } from './skater'
import { mulberry32, seedFrom } from '../core/rng'
import type { Input } from '../input'

export type Phase = 'ready' | 'running'

export class Game {
  phase: Phase = 'ready'
  distance = 0

  readonly road: Road
  readonly skater = new Skater()

  /** The seed the current run was built from. */
  seedLabel = ''

  private rng = mulberry32(0)
  private startX = 0

  /** A null seed means a fresh road every run. A string pins the same one. */
  constructor(private fixedSeed: string | null) {
    this.road = new Road(() => this.rng())
  }

  /** Which road to build. Takes effect on the next start. */
  course: Course = 'street'

  start(): void {
    this.road.course = this.course
    this.seedLabel = this.fixedSeed ?? Math.random().toString(36).slice(2, 10)
    this.rng = mulberry32(seedFrom(this.seedLabel))
    this.road.reset(0)
    this.road.ensureAhead(0)
    this.skater.reset(0)
    this.startX = 0
    this.distance = 0
    this.phase = 'running'
  }

  step(dt: number, input: Input): void {
    if (this.phase !== 'running') return

    this.skater.step(dt, this.road, input)
    this.road.ensureAhead(this.skater.x)
    this.road.prune(this.skater.x)

    this.distance = this.skater.x - this.startX
  }

  /** World x of the left edge of the window. */
  get camLeft(): number {
    return this.skater.x - C.VIEW_WIDTH * C.ANCHOR
  }
}
