import * as C from './constants'
import type { Input } from '../input'
import type { Road, Segment } from './road'

const SURFACE_LABEL: Record<string, string> = {
  ground: 'TIERRA',
  rail: 'RAIL',
  wall: 'MURO',
  wire: 'CABLE',
  vehicle: 'CHIVA',
}

export class Skater {
  x = 0
  y = C.LANE_Y[1]!
  vx = C.CAR_START
  vy = 0

  prevX = 0
  prevY = 0

  support: Segment | null = null
  airTime = 0
  grindTime = 0
  spin = 0
  trick = ''
  trickAge = 99

  private cutApplied = false

  reset(x: number): void {
    this.x = x
    this.y = C.LANE_Y[1]!
    this.prevX = x
    this.prevY = this.y
    this.vx = C.CAR_START
    this.vy = 0
    this.support = null
    this.airTime = 0
    this.grindTime = 0
    this.spin = 0
    this.trick = ''
    this.trickAge = 99
    this.cutApplied = false
  }

  step(dt: number, road: Road, input: Input): void {
    this.prevX = this.x
    this.prevY = this.y
    this.trickAge += dt

    if (this.support && !road.stillCarries(this.support, this.x)) {
      this.support = null
      this.cutApplied = true
    }

    if (this.support) this.ride(dt, this.support, input)
    else this.fly(dt, road, input)

    this.x += this.vx * dt
    if (this.vx < C.SPEED_FLOOR) this.vx = C.SPEED_FLOOR
  }

  private ride(dt: number, seg: Segment, input: Input): void {
    this.y = seg.y
    this.vy = 0
    this.grindTime += dt
    this.airTime = 0
    this.spin = 0

    if (seg.kind === 'ground') {
      this.vx -= C.GROUND_DRAG * dt
    } else {
      this.vx += C.GRIND_ACCEL[seg.lane]! * dt
    }
    if (seg.kind === 'vehicle') {
      this.vx += (seg.vx - this.vx) * Math.min(1, dt * 0.9)
    }

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
    this.vx -= C.AIR_DRAG * dt
    this.spin += dt * 7

    this.y += this.vy * dt

    if (this.vy <= 0) {
      const hit = road.landingAt(this.x, this.prevY, this.y)
      if (hit) this.land(hit)
    }
  }

  private land(seg: Segment): void {
    const credit = Math.min(this.airTime, C.MAX_AIR_CREDIT)
    this.y = seg.y
    this.vy = 0
    this.support = seg
    this.spin = 0
    this.vx += credit * C.LANDING_BOOST * (seg.kind === 'ground' ? 0.25 : 1)

    const surface = SURFACE_LABEL[seg.kind] ?? ''
    this.trick = credit > 0.85 ? `BIG AIR ${surface}` : surface
    this.trickAge = 0
    this.airTime = 0
  }
}
