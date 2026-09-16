import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Scene } from 'three'
import { BOARD, SKATER } from './palette'

type Point = [number, number]

interface Joints {
  hip: Point
  shoulder: Point
  head: Point
  kneeBack: Point
  footBack: Point
  kneeFront: Point
  footFront: Point
  handBack: Point
  handFront: Point
  deckBack: Point
  deckFront: Point
}

/** Crouched over the rail, arms out for balance. The hip is the origin. */
const GRIND: Joints = {
  hip: [0, 0],
  shoulder: [0.05, 0.48],
  head: [0.09, 0.68],
  kneeBack: [-0.26, -0.42],
  footBack: [-0.3, -0.78],
  kneeFront: [0.3, -0.4],
  footFront: [0.34, -0.78],
  handBack: [-0.62, 0.6],
  handFront: [0.58, 0.2],
  deckBack: [-0.52, -0.88],
  deckFront: [0.52, -0.88],
}

/** Tucked in the air, board pulled up under the body. */
const AIR: Joints = {
  hip: [0, 0],
  shoulder: [-0.04, 0.46],
  head: [-0.08, 0.66],
  kneeBack: [-0.3, -0.26],
  footBack: [-0.24, -0.5],
  kneeFront: [0.32, -0.28],
  footFront: [0.28, -0.52],
  handBack: [-0.5, 0.02],
  handFront: [0.52, 0.56],
  deckBack: [-0.5, -0.6],
  deckFront: [0.5, -0.6],
}

const JOINT_KEYS = Object.keys(GRIND) as Array<keyof Joints>

const BODY_LIMBS = 8
const BOARD_LIMBS = 5

function mix(a: Point, b: Point, k: number): Point {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
}

function stroked(scene: Scene, limbs: number, color: string): { mesh: Mesh; data: Float32Array } {
  const data = new Float32Array(limbs * 6 * 3)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(data, 3))
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ color, side: DoubleSide }))
  mesh.frustumCulled = false
  mesh.renderOrder = 10
  scene.add(mesh)
  return { mesh, data }
}

export class SkaterView {
  private body: { mesh: Mesh; data: Float32Array }
  private board: { mesh: Mesh; data: Float32Array }
  private cursor = 0
  private target: Float32Array

  constructor(scene: Scene) {
    this.board = stroked(scene, BOARD_LIMBS, BOARD)
    this.body = stroked(scene, BODY_LIMBS, SKATER)
    this.target = this.body.data
  }

  /**
   * @param x world position of the feet
   * @param y height of the surface under the feet
   * @param spin radians of forward rotation, only while airborne
   * @param grounded blends the tucked pose into the crouched one
   * @param pump -1 to 1, the compress and extend of a grind
   */
  update(x: number, y: number, spin: number, grounded: number, pump: number): void {
    const pose = {} as Joints
    for (const key of JOINT_KEYS) pose[key] = mix(AIR[key], GRIND[key], grounded)

    // Riding compresses the legs and swings the arms against the motion.
    const squat = pump * 0.07 * grounded
    pose.hip = [pose.hip[0], pose.hip[1] + squat]
    pose.shoulder = [pose.shoulder[0], pose.shoulder[1] + squat * 1.3]
    pose.head = [pose.head[0], pose.head[1] + squat * 1.4]
    pose.kneeBack = [pose.kneeBack[0], pose.kneeBack[1] + squat * 0.5]
    pose.kneeFront = [pose.kneeFront[0], pose.kneeFront[1] + squat * 0.5]
    pose.handBack = [pose.handBack[0] - pump * 0.06 * grounded, pose.handBack[1]]
    pose.handFront = [pose.handFront[0] + pump * 0.06 * grounded, pose.handFront[1]]

    const cos = Math.cos(-spin)
    const sin = Math.sin(-spin)
    const originY = y + 0.88

    const truckBack = mix(pose.deckBack, pose.deckFront, 0.2)
    const truckFront = mix(pose.deckBack, pose.deckFront, 0.8)
    const axleBack: Point = [truckBack[0], truckBack[1] - 0.17]
    const axleFront: Point = [truckFront[0], truckFront[1] - 0.17]

    this.begin(this.board, cos, sin, x, originY)
    this.limb(pose.deckBack, pose.deckFront, 0.11)
    this.limb(truckBack, axleBack, 0.07)
    this.limb(truckFront, axleFront, 0.07)
    this.limb([axleBack[0] - 0.01, axleBack[1]], [axleBack[0] + 0.01, axleBack[1]], 0.28)
    this.limb([axleFront[0] - 0.01, axleFront[1]], [axleFront[0] + 0.01, axleFront[1]], 0.28)
    this.end(this.board)

    this.begin(this.body, cos, sin, x, originY)
    this.limb(pose.hip, pose.kneeBack, 0.13)
    this.limb(pose.kneeBack, pose.footBack, 0.11)
    this.limb(pose.hip, pose.kneeFront, 0.13)
    this.limb(pose.kneeFront, pose.footFront, 0.11)
    this.limb(pose.hip, pose.shoulder, 0.18)
    this.limb(pose.shoulder, pose.handBack, 0.095)
    this.limb(pose.shoulder, pose.handFront, 0.095)
    this.limb(pose.head, [pose.head[0], pose.head[1] + 0.02], 0.3)
    this.end(this.body)
  }

  private transform = { cos: 1, sin: 0, x: 0, y: 0 }

  private begin(part: { data: Float32Array }, cos: number, sin: number, x: number, y: number): void {
    this.target = part.data
    this.cursor = 0
    this.transform = { cos, sin, x, y }
  }

  private end(part: { mesh: Mesh }): void {
    part.mesh.geometry.getAttribute('position').needsUpdate = true
  }

  private limb(from: Point, to: Point, width: number): void {
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

    for (const index of [0, 1, 2, 0, 2, 3]) {
      const point = corners[index]!
      const { cos, sin, x, y } = this.transform
      this.target[this.cursor++] = point[0] * cos - point[1] * sin + x
      this.target[this.cursor++] = point[0] * sin + point[1] * cos + y
      this.target[this.cursor++] = 1
    }
  }
}
