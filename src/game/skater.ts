import * as C from './constants'
import type { Input } from '../input'
import { GRINDABLE, slopeOf, surfaceYAt, type Road, type Segment } from './road'
import type { Trick } from './trick'

/** Indexed from -2, so a feeble and a smith sit either side of the three basics. */
const GRIND_NAME = ['feeble', '5-0', '50-50', 'nosegrind', 'smith']
const MANUAL_NAME = ['manual', 'manual', '', 'nose manual', 'nose manual']
/** Sideways on the obstacle. The same three keys pick which end takes it. */
const SLIDE_NAME = ['tailslide', 'tailslide', 'boardslide', 'noseslide', 'noseslide']
/** The same five, as the value a challenge is matched against. */
const SLIDE_KIND: Array<Trick['slide']> = [
  'tailslide',
  'tailslide',
  'boardslide',
  'noseslide',
  'noseslide',
]
const FLIP_COUNT = ['', '', 'double', 'triple', 'quadruple']
/**
 * Which stance a trick goes out under, from whether the board is turned round
 * and which end he popped. Riding normally you pop the tail for an ollie and
 * the nose for a nollie. Turned round it is a switch ollie off the tail and a
 * fakie off the nose.
 */
const STANCE_WORD = ['', 'nollie', 'switch', 'fakie']

export function stanceOf(reversed: boolean, nose: boolean): string {
  return STANCE_WORD[(reversed ? 2 : 0) + (nose ? 1 : 0)]!
}
const QUARTER = Math.PI / 2

/**
 * Skate names it properly. Which way a spin goes is frontside or backside
 * depending on the stance, so goofy reverses both, and a trick started while
 * riding switch carries that word in front of everything else.
 */
export function nameTrick(
  halves: number,
  flips: number,
  flipSign: number,
  shoves: number,
  shoveSign: number,
  stance: number,
  reversed: boolean,
  nose: boolean,
  surface: string,
  bigAir: boolean,
): string {
  // The stance word comes first, the way a skater says it.
  const parts: string[] = []
  const word = stanceOf(reversed, nose)
  if (word) parts.push(word)

  const turn = Math.abs(halves) * 180
  const shoveTurn = Math.abs(shoves) * 180
  const spinSide = halves > 0 === stance > 0 ? 'frontside' : 'backside'
  const shoveSide = shoveSign > 0 === stance > 0 ? 'frontside' : 'backside'
  const flipName = flipSign > 0 ? 'kickflip' : 'heelflip'

  // What the board did, before the body is taken into account. A shove and a
  // flip together carry their own name rather than the sum of the two.
  let core = ''
  if (shoves > 0 && flips > 0) {
    if (shoveTurn === 180) core = flipSign > 0 ? 'varial kickflip' : 'varial heelflip'
    else if (shoveTurn === 360) core = flipSign > 0 ? '360 flip' : 'laser flip'
    else core = `${shoveTurn} shove-it ${flipName}`
  } else if (shoves > 0) {
    // An unqualified shove-it is the backside one, so only the other is named.
    core = shoveTurn === 180 ? 'shove-it' : `${shoveTurn} shove-it`
    if (shoveSide === 'frontside') core = `frontside ${core}`
  } else if (flips > 1) {
    core = `${FLIP_COUNT[Math.min(flips, 4)]} ${flipName}`.trim()
  } else if (flips === 1) {
    core = flipName
  }

  if (turn > 0) {
    // A half turn with a kickflip has its own name and drops both numbers.
    if (turn === 180 && core === 'kickflip') parts.push(spinSide, 'flip')
    else if (turn === 180 && core) parts.push(spinSide, core)
    else if (core) parts.push(spinSide, String(turn), core)
    else parts.push(spinSide, String(turn))
  } else if (core) {
    parts.push(core)
  } else if (bigAir) {
    parts.push('big air')
  } else if (surface) {
    parts.push(surface)
  } else if (word !== 'nollie') {
    // A nollie is the whole name on its own. The others take the word ollie.
    parts.push('ollie')
  }

  return parts.join(' ')
}

/** Sideways onto a rail or a ledge. Which way he turned on names the side. */
function nameSlide(quarters: number, stance: number, reversed: boolean, nose: boolean): string {
  const side = quarters > 0 === stance > 0 ? 'frontside' : 'backside'
  const word = stanceOf(reversed, nose)
  return [word, side, 'boardslide'].filter(Boolean).join(' ')
}

const LABEL: Record<string, string> = {
  rail: 'rail',
  hubba: 'hubba',
  ledge: 'ledge',
  step: 'stairs',
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
  /** Radians the board has turned under him this jump. A half turn is one shove. */
  shoveAngle = 0
  shoveSign = 1
  /**
   * Which way he is facing, and it persists. Land a 180 and you ride switch
   * until the next one brings you back round.
   */
  yaw = 0

  /**
   * True while the board is turned round under him. Measured in quarters, so
   * lying across a rail counts as neither way round.
   */
  get reversed(): boolean {
    return Math.abs(Math.round(this.yaw / QUARTER)) % 4 === 2
  }

  /** What he is riding right now, which is the word every trick carries. */
  get stanceWord(): string {
    return this.reversed ? 'switch' : ''
  }

  /** Which end of the board he popped off. The nose makes it a nollie. */
  poppedNose = false

  /** True while the board lies across what it is on, rather than along it. */
  sideways = false

  airTime = 0
  grindTime = 0
  spin = 0
  /** Spikes to 1 on impact and decays, so the knees soak up a landing. */
  absorb = 0
  /** Counts down a push, which drives the kick in the animation. */
  pushTime = 0
  /** How far into the crouch he is, from 0 to 1. The pop spends it. */
  crouch = 0
  /**
   * Where his weight is along the board while balancing, from -1 to 1. It runs
   * away from the middle by itself; at the ends he comes off.
   */
  balance = 0
  /** True while a manual or a grind is being held, which is when it matters. */
  balancing = false
  private balanceVel = 0
  private wobble = 0
  /** Which way the stance is set, so the rig can pick the right pushing foot. */
  stance: 1 | -1 = 1
  trick = ''
  trickAge = 99
  /**
   * The last landing, taken apart. The name is for reading; this is for
   * deciding whether a challenge was met, which cannot be done from a name.
   */
  landed: Trick | null = null

  /** Where the yaw stood when he left the ground, so a trick names its own turn. */
  private takeoffYaw = 0
  private flipping = false
  private flipsThisJump = 0
  private shoving = false
  private shovesThisJump = 0
  private pushCooldown = 0
  /** Set on landing, so the frame after it adopts the held grind in silence. */
  private justLanded = false

  /**
   * Everything that makes him what he is at this instant. It is taken as a
   * whole rather than field by field so that adding a field to him and
   * forgetting it here is impossible.
   */
  snapshot(): Record<string, unknown> {
    return { ...this } as Record<string, unknown>
  }

  restore(state: Record<string, unknown>): void {
    Object.assign(this, state)
  }

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
    this.shoveAngle = 0
    this.shoveSign = 1
    this.shoving = false
    this.shovesThisJump = 0
    this.yaw = 0
    this.sideways = false
    this.takeoffYaw = 0
    this.flipping = false
    this.flipsThisJump = 0
    this.airTime = 0
    this.grindTime = 0
    this.spin = 0
    this.absorb = 0
    this.pushTime = 0
    this.crouch = 0
    this.balance = 0
    this.balanceVel = 0
    this.balancing = false
    this.wobble = 0
    this.trick = ''
    this.trickAge = 99
    this.landed = null
    this.pushCooldown = 0
    this.justLanded = false
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
        if (this.sideways) {
          this.yaw = Math.round(this.yaw / Math.PI) * Math.PI
          this.takeoffYaw = this.yaw
          this.sideways = false
        }
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
        this.pushTime = 0.34
      }
      if (input.braking) this.vx -= C.BRAKE_ACCEL * dt
    }

    if (this.vx < C.MIN_SPEED) this.vx = C.MIN_SPEED
    if (this.vx > C.MAX_SPEED) this.vx = C.MAX_SPEED

    // Plain pavement always rolls flat. A latched flick belongs to the block
    // or the rail it was aimed at, and must not follow him onto the ground.
    this.keepBalance(dt, seg, input)

    // Sideways on a rail, the end under a foot decides which slide it is, the
    // same way it decides which end the pop comes off. Press the nose for a
    // noseslide, the tail for a tailslide, neither for a boardslide.
    // Weighting an end on flat ground is a manual, and it used to be thrown
    // away here: a flick latched a grind, and the latch had to be kept off the
    // pavement. Nothing is latched now, so a manual is simply held.
    const held = input.pressedEnd
    const asked =
      this.sideways && held !== 0 ? ((held === 1) !== this.reversed ? 1 : -1) : input.grind
    // Up and down are push and brake first. They only pick the outer two
    // grinds on something there is to grind, or holding a push on the flat
    // would put him into a nose manual he never asked for.
    const clamped = rolling && Math.abs(asked) > 1 ? 0 : asked
    // Letting go mid slide does not put him on a different one. The board is
    // already across the rail on one end; changing that takes weighting the
    // other end, not simply stopping.
    const wanted = this.sideways && clamped === 0 ? this.grind : clamped
    if (wanted !== this.grind) {
      this.grind = wanted
      // He has just landed and named the trick. A grind key he was already
      // holding is not a new choice, and must not overwrite that name.
      if (!this.justLanded) {
        const names = this.sideways ? SLIDE_NAME : GRINDABLE[seg.kind] ? GRIND_NAME : MANUAL_NAME
        this.trick = names[this.grind + 2] ?? ''
        this.trickAge = 0
      }
      // A slide is not decided when he touches down, it is decided while he is
      // on it. Keeping the landing in step with what he is actually doing is
      // what lets a tailslide asked for be a tailslide done.
      if (this.sideways && this.landed) {
        this.landed.slide = SLIDE_KIND[this.grind + 2]!
        this.landed.name = this.trick
      }
    }
    this.justLanded = false

    // Holding the key is the crouch. Nothing leaves the ground until it comes
    // back up, which is how a pop works.
    if (input.jumpHeld) this.crouch = Math.min(1, this.crouch + dt / C.CROUCH_TIME)

    if (input.jumpReleased) {
      // Coming out of a slide, the quarter turn back onto the road is part of
      // the pop. Making the player spin it again would bail every boardslide.
      if (this.sideways) {
        const halves = Math.round(this.yaw / Math.PI)
        this.yaw = halves * Math.PI
        this.sideways = false
      }
      // How long he held it decides how high it goes, and a ramp adds its own
      // rise on top, so an uphill launch still goes higher.
      // The input says which end of the board he popped in screen terms. Turn
      // the board round and that same end is the other one, which is the whole
      // difference between an ollie, a nollie, a switch ollie and a fakie.
      this.poppedNose = input.popLeading !== this.reversed
      const end = this.poppedNose ? C.NOLLIE_KEEP : 1
      const charge = C.POP_MIN + (1 - C.POP_MIN) * this.crouch
      this.vy = C.JUMP_SPEED * charge * end + Math.max(0, slope * this.vx)
      this.crouch = 0
      this.support = null
      this.grind = 0
      this.balancing = false
      this.balance = 0
      this.balanceVel = 0
      this.takeoffYaw = this.yaw
      this.flipsThisJump = 0
      this.shovesThisJump = 0
      this.shoveAngle = 0
      this.shoving = false
      this.grindTime = 0

      // A flick or a scoop that arrives with the pop belongs to the jump it
      // started. Without this the step that pops never reaches fly(), and the
      // edge is gone by the next one.
      if (input.flipPressed) {
        this.flipping = true
        this.flipSign = input.flipSign
      }
      if (input.shovePressed) {
        this.shoving = true
        this.shoveSign = input.shoveSign
      }
    }
  }

  /**
   * A manual and a grind do not hold themselves. The weight runs away from the
   * middle, faster the further it has gone, and leaning the other way is what
   * keeps it there. Run out of board and he simply rolls off it.
   */
  private keepBalance(dt: number, seg: Segment, input: Input): void {
    // Anything ridden on one end has to be held there: a manual on the flat as
    // much as a grind on a rail.
    const wants = this.grind !== 0 || (seg.kind !== 'flat' && seg.kind !== 'step')

    if (!wants) {
      this.balancing = false
      this.balance += (0 - this.balance) * Math.min(1, dt * 8)
      this.balanceVel = 0
      return
    }

    if (!this.balancing) {
      this.balancing = true
      this.balance = 0
      this.balanceVel = 0
    }

    // An unstable point: the further it is from the middle, the harder it goes.
    this.wobble += dt
    const restless = Math.sin(this.wobble * 5.3) * 0.5 + Math.sin(this.wobble * 2.1) * 0.5
    this.balanceVel += this.balance * C.BALANCE_RUNAWAY * dt
    this.balanceVel += restless * C.BALANCE_DRIFT * dt
    // The needle follows the finger rather than opposing it. Correcting a
    // lean by leaning the other way is what a board does; moving the thing you
    // are looking at the way you moved your hand is what a control does.
    this.balanceVel += input.lean * C.BALANCE_CORRECT * dt
    this.balanceVel *= 1 - Math.min(1, dt * 2.2)
    this.balance += this.balanceVel * dt

    if (Math.abs(this.balance) >= 1) {
      // Which way it went out decides what it costs. Toward the end already
      // in the air, the raised wheels simply come back down and he rolls on.
      // Toward the end he is standing on, he has gone over it.
      const overCooked = Math.sign(this.balance) === Math.sign(this.grind)
      this.balance = 0
      this.balanceVel = 0
      this.balancing = false
      this.grind = 0
      if (overCooked) {
        this.vx *= C.BAIL_SPEED_KEEP
        if (this.vx < C.MIN_SPEED) this.vx = C.MIN_SPEED
        this.absorb = 1
        this.trick = 'slam'
      } else {
        this.absorb = 0.45
        this.trick = ''
      }
      this.trickAge = 0
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
        // Keep the overshoot, so a held key rolls the deck without a hitch.
        this.flipAngle -= Math.PI * 2
        this.flipsThisJump++
        // Holding the key keeps it turning, which is where a double comes from.
        if (!input.flipHeld) {
          this.flipping = false
          this.flipAngle = 0
        }
      }
    }

    if (input.shovePressed && !this.shoving) {
      this.shoving = true
      if (this.shovesThisJump === 0) this.shoveSign = input.shoveSign
    }
    if (this.shoving) {
      this.shoveAngle += (Math.PI / C.SHOVE_DURATION) * dt
      // A shove always finishes the half turn it started, released or not.
      if (this.shoveAngle >= (this.shovesThisJump + 1) * Math.PI) {
        this.shovesThisJump++
        if (!input.shoveHeld) {
          this.shoving = false
          this.shoveAngle = this.shovesThisJump * Math.PI
        }
      }
    }

    // Spin for exactly as long as it is held. Nothing snaps to a half turn.
    this.yaw += input.rotate * C.SPIN_RATE * dt

    this.vy -= C.GRAVITY * dt
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
    const shoves = this.shovesThisJump

    // A rail or a ledge takes the board across it as readily as along it, so
    // the landing is judged on quarter turns. Flat ground has nothing to
    // slide on and still asks for a half.
    const slideable = seg.kind !== 'flat' && seg.kind !== 'step'
    const unit = slideable ? QUARTER : Math.PI
    const target = Math.round(this.yaw / unit) * unit
    const off = Math.abs(this.yaw - target)
    // Landing is graded, not passed or failed. He rides away from all of them;
    // what changes is how square it was and what that costs him.
    const sketchy = off > C.LANDING_TOLERANCE

    const wasReversed = Math.abs(Math.round(this.takeoffYaw / QUARTER)) % 4 === 2
    const quarters = Math.round((target - this.takeoffYaw) / QUARTER)
    this.yaw = target
    this.takeoffYaw = target
    this.sideways = slideable && Math.abs(quarters) % 2 === 1

    // The harder he arrives, the deeper he soaks it up.
    this.absorb = Math.min(1, 0.35 + Math.abs(this.vy) / 11)
    if (sketchy) {
      // The cost follows how far off he was. Nearly landing it nearly costs
      // nothing, and only a real miss is expensive.
      const miss = Math.min(1, off / (unit / 2))
      this.vx *= 1 - miss * (1 - C.BAIL_SPEED_KEEP)
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
    this.shoveAngle = 0
    this.shoving = false
    this.shovesThisJump = 0

    const named = this.sideways
      ? nameSlide(quarters, this.stance, wasReversed, this.poppedNose)
      : nameTrick(
          Math.round(quarters / 2),
          flips,
          this.flipSign,
          shoves,
          this.shoveSign,
          this.stance,
          wasReversed,
          this.poppedNose,
          LABEL[seg.kind] ?? '',
          this.airTime > 0.82,
        )
    const grade = sketchy ? 'sketchy' : off < C.LANDING_PERFECT ? 'perfect' : 'clean'
    this.trick = grade === 'clean' ? named : `${named} ${grade}`

    const halves = this.sideways ? 0 : Math.round(quarters / 2)
    const turned = this.sideways ? quarters : halves
    this.landed = {
      name: this.trick,
      halves,
      flips,
      flipSign: this.flipSign,
      shoves,
      shoveSign: this.shoveSign,
      slide: this.sideways ? SLIDE_KIND[this.grind + 2]! : 'none',
      side: turned === 0 ? '' : turned > 0 === this.stance > 0 ? 'frontside' : 'backside',
      stance: stanceOf(wasReversed, this.poppedNose),
      surface: seg.kind,
      grade,
      at: this.x,
    }
    this.trickAge = 0
    this.airTime = 0
  }

}
