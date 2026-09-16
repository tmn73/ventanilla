import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Scene } from 'three'
import { SKATER } from './palette'

/** board, back leg, front leg, torso, back arm, front arm, head */
const LIMBS = 7
const VERTICES = LIMBS * 6

type Point = [number, number]
interface Pose {
  board: [Point, Point]
  backLeg: [Point, Point]
  frontLeg: [Point, Point]
  torso: [Point, Point]
  backArm: [Point, Point]
  frontArm: [Point, Point]
  head: [Point, Point]
}

/** Crouched over the rail, arms out for balance. */
const GRIND: Pose = {
  board: [[-0.5, -0.88], [0.5, -0.88]],
  backLeg: [[0, 0], [-0.3, -0.82]],
  frontLeg: [[0, 0], [0.34, -0.82]],
  torso: [[0, 0], [0.06, 0.5]],
  backArm: [[0.04, 0.42], [-0.6, 0.66]],
  frontArm: [[0.04, 0.42], [0.58, 0.24]],
  head: [[0.08, 0.6], [0.1, 0.82]],
}

/** Tucked in the air, board pulled up to the body. */
const AIR: Pose = {
  board: [[-0.46, -0.58], [0.46, -0.58]],
  backLeg: [[0, 0], [-0.26, -0.5]],
  frontLeg: [[0, 0], [0.3, -0.52]],
  torso: [[0, 0], [-0.04, 0.46]],
  backArm: [[-0.02, 0.4], [-0.46, 0.05]],
  frontArm: [[-0.02, 0.4], [0.5, 0.58]],
  head: [[-0.06, 0.56], [-0.08, 0.78]],
}

const WIDTH: Record<keyof Pose, number> = {
  board: 0.13,
  backLeg: 0.12,
  frontLeg: 0.12,
  torso: 0.17,
  backArm: 0.1,
  frontArm: 0.1,
  head: 0.36,
}

const ORDER: Array<keyof Pose> = ['board', 'backLeg', 'frontLeg', 'torso', 'backArm', 'frontArm', 'head']

function lerpPoint(a: Point, b: Point, k: number): Point {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
}

export class SkaterView {
  private mesh: Mesh
  private positions: Float32Array

  constructor(scene: Scene) {
    this.positions = new Float32Array(VERTICES * 3)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
    this.mesh = new Mesh(geometry, new MeshBasicMaterial({ color: SKATER }))
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 10
    scene.add(this.mesh)
  }

  /**
   * @param x world position of the feet
   * @param y height of the surface under the feet
   * @param spin radians of forward rotation, only while airborne
   * @param grounded blends between the tucked and the crouched pose
   */
  update(x: number, y: number, spin: number, grounded: number): void {
    const cos = Math.cos(-spin)
    const sin = Math.sin(-spin)
    const originY = y + 0.88

    let cursor = 0
    for (const limb of ORDER) {
      const from = lerpPoint(AIR[limb][0], GRIND[limb][0], grounded)
      const to = lerpPoint(AIR[limb][1], GRIND[limb][1], grounded)
      cursor = this.stroke(cursor, from, to, WIDTH[limb], cos, sin, x, originY)
    }

    this.mesh.geometry.getAttribute('position').needsUpdate = true
  }

  private stroke(
    cursor: number,
    from: Point,
    to: Point,
    width: number,
    cos: number,
    sin: number,
    offsetX: number,
    offsetY: number,
  ): number {
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const length = Math.hypot(dx, dy) || 1
    const nx = (-dy / length) * (width / 2)
    const ny = (dx / length) * (width / 2)

    const corners: Point[] = [
      [from[0] + nx, from[1] + ny],
      [to[0] + nx, to[1] + ny],
      [to[0] - nx, to[1] - ny],
      [from[0] - nx, from[1] - ny],
    ]

    const write = (index: number) => {
      const point = corners[index]!
      const px = point[0] * cos - point[1] * sin + offsetX
      const py = point[0] * sin + point[1] * cos + offsetY
      this.positions[cursor++] = px
      this.positions[cursor++] = py
      this.positions[cursor++] = 1
    }

    write(0)
    write(1)
    write(2)
    write(0)
    write(2)
    write(3)
    return cursor
  }
}
