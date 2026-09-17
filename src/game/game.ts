import * as C from './constants'
import { Road, type Course } from './road'
import { Skater } from './skater'
import { mulberry32, seedFrom } from '../core/rng'
import type { Input } from '../input'

export type Phase = 'ready' | 'running'

/** How often he is written down, and how many of those are kept. */
const SNAP_EVERY = 1 / 30
const SNAP_COUNT = 30 * 6
/** Winding back runs faster than the run did, or it is not a rewind. */
const REWIND_SPEED = 2.5

export class Game {
  phase: Phase = 'ready'
  distance = 0

  readonly road: Road
  readonly skater = new Skater()

  /** The seed the current run was built from. */
  seedLabel = ''

  /** True while the player is winding the run back. */
  rewinding = false

  private rng = mulberry32(0)
  private startX = 0
  /**
   * The last few seconds of him, taken a few times a second. The road behind
   * is kept back as far as the oldest of these, or winding back would arrive
   * somewhere the pavement had already been thrown away.
   */
  private history: Array<{ at: number; state: Record<string, unknown> }> = []
  private sinceSnap = 0

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
    this.history = []
    this.sinceSnap = 0
    this.rewinding = false
    this.phase = 'running'
  }

  step(dt: number, input: Input): void {
    if (this.phase !== 'running') return

    if (this.rewinding && this.history.length > 1) {
      this.unwind(dt)
    } else {
      this.skater.step(dt, this.road, input)
      this.record(dt)
    }

    this.road.ensureAhead(this.skater.x)
    // Kept back to the oldest moment he could be wound to, not to where he is.
    this.road.prune(this.history[0]?.state.x as number | undefined ?? this.skater.x)

    this.distance = this.skater.x - this.startX
  }

  private record(dt: number): void {
    this.sinceSnap += dt
    if (this.sinceSnap < SNAP_EVERY) return
    this.sinceSnap = 0
    this.history.push({ at: this.skater.x, state: this.skater.snapshot() })
    while (this.history.length > SNAP_COUNT) this.history.shift()
  }

  /** Walks back through the snapshots, faster than they were laid down. */
  private unwind(dt: number): void {
    let budget = dt * REWIND_SPEED
    while (budget > 0 && this.history.length > 1) {
      budget -= SNAP_EVERY
      this.history.pop()
    }
    const last = this.history[this.history.length - 1]
    if (last) this.skater.restore(last.state)
  }

  /** World x of the left edge of the window. */
  get camLeft(): number {
    return this.skater.x - C.VIEW_WIDTH * C.ANCHOR
  }
}
