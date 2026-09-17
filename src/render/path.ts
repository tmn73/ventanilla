import { seedFrom } from '../core/rng'

/**
 * The promenade bends, but only for the eye. Everything upstream still lives
 * on one axis: the skater's x is a distance along the path, and this maps it
 * to a point and a heading. Nothing in the simulation knows the road turns.
 *
 * Headings stay small, so arc length and x can be treated as the same thing.
 * That keeps the lateral offset an exact integral of the heading rather than
 * something that has to be stepped along and stored.
 */
interface Wave {
  amplitude: number
  wavelength: number
  phase: number
}

export class Path {
  private waves: Wave[]

  constructor(seed: string) {
    const hash = seedFrom(seed)
    const turn = (hash % 1000) / 1000
    const sway = ((hash >> 10) % 1000) / 1000
    this.waves = [
      { amplitude: 0.3, wavelength: 52, phase: turn * Math.PI * 2 },
      { amplitude: 0.18, wavelength: 21, phase: sway * Math.PI * 2 },
    ]
  }

  /** Radians the road has turned away from straight at this distance. */
  headingAt(s: number): number {
    let heading = 0
    for (const wave of this.waves) {
      heading += wave.amplitude * Math.sin(s / wave.wavelength + wave.phase)
    }
    return heading
  }

  /** How far the road has wandered sideways, the integral of the heading. */
  offsetAt(s: number): number {
    let offset = 0
    for (const wave of this.waves) {
      offset += -wave.amplitude * wave.wavelength * Math.cos(s / wave.wavelength + wave.phase)
    }
    return offset
  }

  /**
   * World position of a point that sits `lateral` metres to the side of the
   * road at distance `s`. The side is square to the heading, not to the axis.
   */
  place(s: number, lateral: number, out: { x: number; z: number }): void {
    const heading = this.headingAt(s)
    out.x = s - heading * lateral
    out.z = this.offsetAt(s) + lateral
  }
}
