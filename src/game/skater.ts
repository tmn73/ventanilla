import * as C from './constants'
import type { Input } from '../input'
import type { Road, Segment } from './road'

const LABEL: Record<string, string> = {
  rail: 'RAIL',
  wall: 'MURO',
  wire: 'CABLE',
  vehicle: 'CHIVA',
}

export class Skater {
  x = 0
  y = C.LANE_Y[0]!
  vy = 0

  prevX = 0
  prevY = 0

  support: Segment | null = null
  airTime = 0
  grindTime = 0
  spin = 0
  trick = ''
  trickAge = 99

  fell = false
  fallTime = 0

  private cutApplied = false

  reset(x: number): void {
    this.x = x
    this.y = C.LANE_Y[0]!
    this.prevX = x
    this.prevY = this.y
    this.vy = 0
    this.support = null
    this.airTime = 0
    this.grindTime = 0
    this.spin = 0
    this.trick = ''
    this.trickAge = 99
    this.fell = false
    this.fallTime = 0
    this.cutApplied = false
  }

  /** The car carries him forward. All he owns is the vertical. */
  step(dt: number, road: Road, input: Input, carX: number): void {
    this.prevX = this.x
    this.prevY = this.y
    this.trickAge += dt

    if (this.fell) {
      this.fallTime += dt
      this.vy -= C.GRAVITY * dt
      this.y += this.vy * dt
      this.spin += dt * 5
      return
    }

    this.x = carX

    if (this.support && !road.stillCarries(this.support, this.x)) {
      this.support = null
      this.cutApplied = true
    }

    if (this.support) this.ride(dt, this.support, input)
    else this.fly(dt, road, input)
  }

  private ride(dt: number, seg: Segment, input: Input): void {
    this.y = seg.y
    this.vy = 0
    this.grindTime += dt
    this.airTime = 0
    this.spin = 0

    if (input.jumpPressed) {
      this.vy = C.JUMP_SPEED
      this.support = null
      this.cutApplied = false
      this.grindTime = 0
    }
  }

  private fly(dt: number, road: Road, input: Input): void {
    this.airTime += dt
    this.vy -= C.GRAVITY * dt
    if (input.dive) this.vy -= C.DIVE_ACCEL * dt
    if (!input.jumpHeld && this.vy > 0 && !this.cutApplied) {
      this.vy *= C.JUMP_CUT
      this.cutApplied = true
    }
    this.spin += dt * 7
    this.y += this.vy * dt

    if (this.vy <= 0) {
      const hit = road.landingAt(this.x, this.prevY, this.y)
      if (hit) {
        this.land(hit)
        return
      }
    }
    if (this.y <= C.DEATH_Y) {
      this.fell = true
      this.y = C.DEATH_Y
      this.vy = 2.5
    }
  }

  private land(seg: Segment): void {
    this.y = seg.y
    this.vy = 0
    this.support = seg
    this.spin = 0
    this.trick = this.airTime > 0.82 ? `BIG AIR ${LABEL[seg.kind] ?? ''}` : (LABEL[seg.kind] ?? '')
    this.trickAge = 0
    this.airTime = 0
  }
}
