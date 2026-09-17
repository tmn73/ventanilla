import * as C from './constants'
import type { Input } from '../input'
import { GRINDABLE, slopeOf, surfaceYAt, type Road, type Segment } from './road'

/** Indexed from -2, so a feeble and a smith sit either side of the three basics. */
const GRIND_NAME = ['FEEBLE', '5-0', '50-50', 'NOSEGRIND', 'SMITH']
const MANUAL_NAME = ['MANUAL', 'MANUAL', '', 'NOSE MANUAL', 'NOSE MANUAL']

const LABEL: Record<string, string> = {
  rail: 'RAIL',
  hubba: 'HUBBA',
  ledge: 'LEDGE',
  step: 'STAIRS',
  flat: '',
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
  step(dt: number, road: Road, input: Input, carX: number, carSpeed: number): void {
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
      // Rolling off the end of a ramp carries its rise into the air.
      this.vy = slopeOf(this.support) * carSpeed
      this.support = null
      this.cutApplied = true
    }

    if (this.support) this.ride(dt, this.support, input, carSpeed)
    else this.fly(dt, road, input)

    if (!this.fell && road.blockedAt(this.x, this.y)) this.crash()
  }

  private ride(dt: number, seg: Segment, input: Input, carSpeed: number): void {
    this.y = surfaceYAt(seg, this.x)
    this.vy = 0
    this.grindTime += dt
    this.airTime = 0
    this.spin = 0

    if (input.grind !== this.grind) {
      this.grind = input.grind
      const names = GRINDABLE[seg.kind] ? GRIND_NAME : MANUAL_NAME
      this.trick = names[this.grind + 2] ?? ''
      this.trickAge = 0
    }

    if (input.jumpPressed) {
      // A ramp adds its own rise, so an uphill launch goes higher.
      this.vy = C.JUMP_SPEED + Math.max(0, slopeOf(seg) * carSpeed)
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
    const floor = road.deathLineAt(this.x)
    if (this.y <= floor) {
      this.fell = true
      this.y = floor
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
    this.y = surfaceYAt(seg, this.x)
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
