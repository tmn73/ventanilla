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
  /** His own speed now. Nothing else carries him forward. */
  vx = C.START_SPEED
  vy = 0

  prevX = 0
  prevY = 0

  support: Segment | null = null
  /** -1 is a 5-0, 0 is a 50-50, 1 is a nosegrind. */
  grind = 0
  /** Radians through the current flip. Zero when the board is flat. */
  flipAngle = 0
  /** Which way the deck is turning: a kickflip one way, a heelflip the other. */
  flipSign = 1
  /** Radians he has turned. Held input spins it; the landing judges it. */
  yaw = 0

  airTime = 0
  grindTime = 0
  spin = 0
  /** Spikes to 1 on impact and decays, so the knees soak up a landing. */
  absorb = 0
  /** Counts down a push, which drives the kick in the animation. */
  pushTime = 0
  trick = ''
  trickAge = 99

  private flipping = false
  private flipsThisJump = 0
  private cutApplied = false
  private pushCooldown = 0

  reset(x: number): void {
    this.x = x
    this.y = C.LANE_Y[0]!
    this.prevX = x
    this.prevY = this.y
    this.vx = C.START_SPEED
    this.vy = 0
    this.support = null
    this.grind = 0
    this.flipAngle = 0
    this.flipSign = 1
    this.yaw = 0
    this.flipping = false
    this.flipsThisJump = 0
    this.airTime = 0
    this.grindTime = 0
    this.spin = 0
    this.absorb = 0
    this.pushTime = 0
    this.trick = ''
    this.trickAge = 99
    this.cutApplied = false
    this.pushCooldown = 0
  }

  step(dt: number, road: Road, input: Input): void {
    this.prevX = this.x
    this.prevY = this.y
    this.trickAge += dt
    if (this.absorb > 0) this.absorb = Math.max(0, this.absorb - dt * 5.5)
    if (this.pushTime > 0) this.pushTime = Math.max(0, this.pushTime - dt)
    if (this.pushCooldown > 0) this.pushCooldown = Math.max(0, this.pushCooldown - dt)

    if (this.support && !road.stillCarries(this.support, this.x)) {
      // Hand over to whatever continues at this height before calling it a fall.
      const next = road.continuationAt(this.x, this.y)
      if (next) {
        this.support = next
      } else {
        // Rolling off the end of a ramp carries its rise into the air.
        this.vy = slopeOf(this.support) * this.vx
        this.support = null
        this.cutApplied = true
      }
    }

    if (this.support) this.ride(dt, this.support, input)
    else this.fly(dt, road, input)

    this.x += this.vx * dt
  }

  private ride(dt: number, seg: Segment, input: Input): void {
    this.y = surfaceYAt(seg, this.x)
    this.vy = 0
    this.grindTime += dt
    this.airTime = 0
    this.spin = 0

    const slope = slopeOf(seg)
    const rolling = seg.kind === 'flat' || seg.kind === 'step'

    // A slope pulls him along it, which is why a bank is worth taking.
    this.vx -= slope * C.SLOPE_PULL * dt
    this.vx -= (C.DRAG_BASE + this.vx * C.DRAG_SPEED) * dt

    if (rolling) {
      if (input.pushing && this.pushCooldown <= 0) {
        this.vx += C.PUSH_IMPULSE
        this.pushCooldown = C.PUSH_COOLDOWN
        this.pushTime = 0.26
      }
      if (input.braking) this.vx -= C.BRAKE_ACCEL * dt
    }

    if (this.vx < C.MIN_SPEED) this.vx = C.MIN_SPEED
    if (this.vx > C.MAX_SPEED) this.vx = C.MAX_SPEED

    // Plain pavement always rolls flat. A latched flick belongs to the block
    // or the rail it was aimed at, and must not follow him onto the ground.
    const wanted = rolling ? 0 : input.grind
    if (wanted !== this.grind) {
      this.grind = wanted
      const names = GRINDABLE[seg.kind] ? GRIND_NAME : MANUAL_NAME
      this.trick = names[this.grind + 2] ?? ''
      this.trickAge = 0
    }

    // A turn eases back to straight once he is rolling again.
    if (this.yaw !== 0) {
      const settle = Math.min(Math.abs(this.yaw), dt * 6)
      this.yaw -= Math.sign(this.yaw) * settle
    }

    if (input.jumpPressed) {
      // A ramp adds its own rise, so an uphill launch goes higher.
      this.vy = C.JUMP_SPEED + Math.max(0, slope * this.vx)
      this.support = null
      this.grind = 0
      this.yaw = 0
      this.flipsThisJump = 0
      this.cutApplied = false
      this.grindTime = 0
    }
  }

  private fly(dt: number, road: Road, input: Input): void {
    this.airTime += dt

    if (input.flipPressed && !this.flipping) {
      this.flipping = true
      this.flipSign = input.flipSign
    }
    if (this.flipping) {
      this.flipAngle += ((Math.PI * 2) / C.FLIP_DURATION) * dt
      if (this.flipAngle >= Math.PI * 2) {
        this.flipAngle = 0
        this.flipping = false
        this.flipsThisJump++
      }
    }

    // Spin for exactly as long as it is held. Nothing snaps to a half turn.
    this.yaw += input.rotate * C.SPIN_RATE * dt

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

    // Nothing is fatal. If he ever ends up under the pavement, put him back on.
    const floor = road.floorAt(this.x)
    if (this.y < floor) {
      const landing = road.continuationAt(this.x, floor, 0.1, 0.1)
      if (landing) this.land(landing)
      else {
        this.y = floor
        this.vy = 0
      }
    }
  }

  private land(seg: Segment): void {
    const flips = this.flipsThisJump

    // A landing is judged on the angle he stopped at. Half turns are clean,
    // anything between them is a bail: he keeps rolling, but not the speed.
    const halves = Math.round(this.yaw / Math.PI)
    const error = Math.abs(this.yaw - halves * Math.PI)
    const bailed = error > C.LANDING_TOLERANCE
    this.yaw = halves * Math.PI

    // The harder he arrives, the deeper he soaks it up.
    this.absorb = Math.min(1, 0.35 + Math.abs(this.vy) / 11)
    if (bailed) {
      this.vx *= C.BAIL_SPEED_KEEP
      this.absorb = 1
      if (this.vx < C.MIN_SPEED) this.vx = C.MIN_SPEED
    }
    this.y = surfaceYAt(seg, this.x)
    this.vy = 0
    this.support = seg
    this.spin = 0
    this.grind = 0
    this.flipAngle = 0
    this.flipping = false
    this.flipsThisJump = 0

    const flipName = this.flipSign > 0 ? 'KICKFLIP' : 'HEELFLIP'
    const turn = Math.abs(halves) * 180
    const spin = turn > 0 ? `${turn}` : ''

    if (bailed) this.trick = 'BAIL'
    else if (flips > 0 && turn > 0) this.trick = `${spin} ${flipName}`
    else if (flips > 1) this.trick = `${flips}x ${flipName}`
    else if (flips === 1) this.trick = flipName
    else if (turn > 0) this.trick = spin
    else this.trick = this.airTime > 0.82 ? `BIG AIR ${LABEL[seg.kind] ?? ''}` : (LABEL[seg.kind] ?? '')
    this.trickAge = 0
    this.airTime = 0
  }
}
