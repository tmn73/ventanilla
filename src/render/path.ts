import { mulberry32, seedFrom } from '../core/rng'

/**
 * The promenade runs straight, then takes a corner, then runs straight again.
 * It only bends for the eye: everything upstream still lives on one axis, and
 * the skater's x is a distance along this path.
 *
 * A leg is either a straight or a quarter circle, so the position and heading
 * have exact closed forms and nothing has to be stepped along and stored.
 */
interface Leg {
  /** Path distance where this leg begins. */
  s0: number
  length: number
  /** Zero for a straight, otherwise the signed reciprocal of the radius. */
  curvature: number
  x: number
  z: number
  heading: number
}

const STRAIGHT_MIN = 110
const STRAIGHT_MAX = 240
const RADIUS_MIN = 22
const RADIUS_MAX = 34
const QUARTER = Math.PI / 2

export class Path {
  private legs: Leg[] = []
  private rng: () => number
  /** Pretend the lead-in was a corner, so a straight is laid before the first one. */
  private lastWasCorner = true

  constructor(seed: string) {
    this.rng = mulberry32(seedFrom(seed))
    this.legs.push({ s0: -400, length: 400, curvature: 0, x: -400, z: 0, heading: 0 })
    this.extendTo(600)
  }

  /** Lays legs forward until the path covers this distance. */
  private extendTo(s: number): void {
    while (true) {
      const last = this.legs[this.legs.length - 1]!
      if (last.s0 + last.length > s) return

      const end = this.endOf(last)
      // A corner is always a right angle. Between them the road is dead straight.
      if (this.lastWasCorner) {
        this.legs.push({
          s0: last.s0 + last.length,
          length: STRAIGHT_MIN + this.rng() * (STRAIGHT_MAX - STRAIGHT_MIN),
          curvature: 0,
          ...end,
        })
      } else {
        const radius = RADIUS_MIN + this.rng() * (RADIUS_MAX - RADIUS_MIN)
        const sign = this.rng() < 0.5 ? -1 : 1
        this.legs.push({
          s0: last.s0 + last.length,
          length: radius * QUARTER,
          curvature: sign / radius,
          ...end,
        })
      }
      this.lastWasCorner = !this.lastWasCorner
    }
  }

  /** Position and heading at the far end of a leg. */
  private endOf(leg: Leg): { x: number; z: number; heading: number } {
    return this.walk(leg, leg.length)
  }

  private walk(leg: Leg, distance: number): { x: number; z: number; heading: number } {
    if (leg.curvature === 0) {
      return {
        x: leg.x + Math.cos(leg.heading) * distance,
        z: leg.z + Math.sin(leg.heading) * distance,
        heading: leg.heading,
      }
    }
    const heading = leg.heading + leg.curvature * distance
    return {
      x: leg.x + (Math.sin(heading) - Math.sin(leg.heading)) / leg.curvature,
      z: leg.z - (Math.cos(heading) - Math.cos(leg.heading)) / leg.curvature,
      heading,
    }
  }

  private legAt(s: number): Leg {
    this.extendTo(s + 400)
    for (let i = this.legs.length - 1; i >= 0; i--) {
      const leg = this.legs[i]!
      if (s >= leg.s0) return leg
    }
    return this.legs[0]!
  }

  /** Reciprocal of the turning radius here, or zero on a straight. */
  curvatureAt(s: number): number {
    return this.legAt(s).curvature
  }

  /** Radians the road has turned away from straight at this distance. */
  headingAt(s: number): number {
    const leg = this.legAt(s)
    return leg.heading + leg.curvature * (s - leg.s0)
  }

  /**
   * World position of a point that sits `lateral` metres to the side of the
   * road at distance `s`. The side is square to the heading, not to any axis.
   */
  place(s: number, lateral: number, out: { x: number; z: number }): void {
    const leg = this.legAt(s)
    const on = this.walk(leg, s - leg.s0)
    out.x = on.x - Math.sin(on.heading) * lateral
    out.z = on.z + Math.cos(on.heading) * lateral
  }
}
