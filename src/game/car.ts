import { CAR_START } from './constants'
import { range } from '../core/rng'

interface Mood {
  name: string
  speed: number
  hold: [number, number]
  weight: number
}

/** The road the driver is on. The player never picks this. */
const MOODS: Mood[] = [
  { name: 'trancon', speed: 11, hold: [4, 8], weight: 1 },
  { name: 'peaje', speed: 14, hold: [3, 6], weight: 1 },
  { name: 'pueblo', speed: 16, hold: [5, 9], weight: 1.5 },
  { name: 'carretera', speed: 21, hold: [8, 14], weight: 3 },
  { name: 'recta', speed: 26, hold: [6, 11], weight: 2 },
]

const TOTAL_WEIGHT = MOODS.reduce((sum, m) => sum + m.weight, 0)

/** The car carries the camera. Its speed sets the scroll the player must match. */
export class Car {
  x = 0
  prevX = 0
  speed = CAR_START
  mood = 'carretera'

  private target = CAR_START
  private hold = 0

  constructor(private rng: () => number) {}

  reset(): void {
    this.x = 0
    this.prevX = 0
    this.speed = CAR_START
    this.target = CAR_START
    this.hold = 6
    this.mood = 'carretera'
  }

  step(dt: number): void {
    this.prevX = this.x
    this.hold -= dt
    if (this.hold <= 0) this.shift()
    this.speed += (this.target - this.speed) * Math.min(1, dt * 0.8)
    this.x += this.speed * dt
  }

  private shift(): void {
    let roll = this.rng() * TOTAL_WEIGHT
    let chosen = MOODS[MOODS.length - 1]!
    for (const mood of MOODS) {
      roll -= mood.weight
      if (roll <= 0) {
        chosen = mood
        break
      }
    }
    this.target = chosen.speed
    this.mood = chosen.name
    this.hold = range(this.rng, chosen.hold[0], chosen.hold[1])
  }
}
