import * as C from './constants'
import type { Input } from '../input'
import type { Road, Segment } from './road'

const GRIND_NAME = ['5-0', '50-50', 'NOSEGRIND']

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
  /** -1 is a 5-0, 0 is a 50-50, 1 is a nosegrind. */
  grind = 0
  /** Radians through the current kickflip. Zero when the board is flat. */
  flipAngle = 0

  private flipping = false
  private flipsThisJump = 0
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
    this.grind = 0
    this.flipAngle = 0
    this.flipping = false
    this.flipsThisJump = 0
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

    if (!this.fell && road.blockedAt(this.x, this.y)) this.crash()
  }

  private ride(dt: number, seg: Segment, input: Input): void {
    this.y = seg.y
    this.vy = 0
    this.grindTime += dt
    this.airTime = 0
    this.spin = 0

    if (input.lean !== this.grind) {
      this.grind = input.lean
      this.trick = GRIND_NAME[this.grind + 1] ?? '50-50'
      this.trickAge = 0
    }

    if (input.jumpPressed) {
      this.vy = C.JUMP_SPEED
      this.support = null
      this.grind = 0
      this.flipsThisJump = 0
      this.cutApplied = false
      this.grindTime = 0
    }
  }

  private fly(dt: number, road: Road, input: Input): void {
    this.airTime += dt

    if (input.leftPressed && !this.flipping) this.flipping = true
    if (this.flipping) {
      this.flipAngle += ((Math.PI * 2) / C.FLIP_DURATION) * dt
      if (this.flipAngle >= Math.PI * 2) {
        this.flipAngle = 0
        this.flipping = false
        this.flipsThisJump++
      }
    }

    this.vy -= C.GRAVITY * dt
    if (!input.jumpHeld && this.vy > 0 && !this.cutApplied) {
      this.vy *= C.JUMP_CUT
      this.cutApplied = true
    }
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

  private crash(): void {
    this.fell = true
    this.support = null
    this.vy = 3.2
  }

  private land(seg: Segment): void {
    const flips = this.flipsThisJump
    this.y = seg.y
    this.vy = 0
    this.support = seg
    this.spin = 0
    this.grind = 0
    this.flipAngle = 0
    this.flipping = false
    this.flipsThisJump = 0

    if (flips > 1) this.trick = `${flips}x KICKFLIP`
    else if (flips === 1) this.trick = 'KICKFLIP'
    else this.trick = this.airTime > 0.82 ? `BIG AIR ${LABEL[seg.kind] ?? ''}` : (LABEL[seg.kind] ?? '')
    this.trickAge = 0
    this.airTime = 0
  }
}
