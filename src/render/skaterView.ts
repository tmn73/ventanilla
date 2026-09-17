import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
} from 'three'
import { BOARD, GRIP, SKATER, WHEEL_COLOR } from './palette'

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

const BODY_LIMBS = 8
const BOARD_LIMBS = 5

/**
 * A rider stands 1.75 tall, so one unit is one metre. The deck keeps its real
 * 84 cm length, but the thickness, the kicks and the wheels are pushed past
 * life size: at this zoom a true 15 mm deck is two pixels and reads as a plank.
 */
const DECK_Y = -0.88
const DECK_HALF = 0.42
const DECK_THICK = 0.06
/** The kicked tail and nose are the silhouette everyone recognises. */
const KICK_IN = 0.15
const KICK_RISE = 0.06
const TRUCK_X = 0.24
const TRUCK_DROP = 0.075
const WHEEL_RADIUS = 0.045

/** Lifts the figure so the wheels rest on the surface instead of sinking in. */
const FEET_TO_HIP = -DECK_Y + TRUCK_DROP + WHEEL_RADIUS
const TILT = 0.36

/** Crouched over the rail, arms out for balance. The hip is the origin. */
const GRIND: Joints = {
  hip: [0, 0],
  shoulder: [0.05, 0.48],
  head: [0.09, 0.68],
  kneeBack: [-0.24, -0.42],
  footBack: [-0.24, -0.79],
  kneeFront: [0.28, -0.4],
  footFront: [0.26, -0.79],
  handBack: [-0.62, 0.6],
  handFront: [0.58, 0.2],
  deckBack: [-DECK_HALF, DECK_Y],
  deckFront: [DECK_HALF, DECK_Y],
}

/** Tucked in the air, board pulled up under the body. */
const AIR: Joints = {
  hip: [0, 0],
  shoulder: [-0.04, 0.46],
  head: [-0.08, 0.66],
  kneeBack: [-0.28, -0.26],
  footBack: [-0.22, -0.52],
  kneeFront: [0.3, -0.28],
  footFront: [0.24, -0.54],
  handBack: [-0.5, 0.02],
  handFront: [0.52, 0.56],
  deckBack: [-DECK_HALF, -0.62],
  deckFront: [DECK_HALF, -0.62],
}

const JOINT_KEYS = Object.keys(GRIND) as Array<keyof Joints>

function mix(a: Point, b: Point, k: number): Point {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
}

function rotateAbout(point: Point, pivot: Point, angle: number): Point {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point[0] - pivot[0]
  const dy = point[1] - pivot[1]
  return [pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos]
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
  private wheels: InstancedMesh
  private proxy = new Object3D()
  private cursor = 0
  private target: Float32Array
  private transform = { cos: 1, sin: 0, x: 0, y: 0 }

  constructor(scene: Scene) {
    this.board = stroked(scene, BOARD_LIMBS, BOARD)
    this.body = stroked(scene, BODY_LIMBS, SKATER)
    this.target = this.body.data

    this.wheels = new InstancedMesh(
      new CircleGeometry(WHEEL_RADIUS, 12),
      new MeshBasicMaterial({ color: WHEEL_COLOR }),
      2,
    )
    this.wheels.frustumCulled = false
    this.wheels.renderOrder = 11
    scene.add(this.wheels)
  }

  /**
   * @param grounded blends the tucked pose into the crouched one
   * @param grind -1 for a 5-0, 0 for a 50-50, 1 for a nosegrind
   * @param flip radians through a kickflip, which rolls the deck edge on
   */
  update(
    x: number,
    y: number,
    spin: number,
    grounded: number,
    pump: number,
    grind: number,
    flip: number,
  ): void {
    const pose = {} as Joints
    for (const key of JOINT_KEYS) pose[key] = mix(AIR[key], GRIND[key], grounded)

    const squat = pump * 0.07 * grounded
    const shift = grind * 0.12 * grounded
    pose.hip = [pose.hip[0] + shift, pose.hip[1] + squat]
    pose.shoulder = [pose.shoulder[0] + shift, pose.shoulder[1] + squat * 1.3]
    pose.head = [pose.head[0] + shift, pose.head[1] + squat * 1.4]
    pose.kneeBack = [pose.kneeBack[0], pose.kneeBack[1] + squat * 0.5]
    pose.kneeFront = [pose.kneeFront[0], pose.kneeFront[1] + squat * 0.5]
    pose.handBack = [pose.handBack[0] - pump * 0.06 * grounded, pose.handBack[1]]
    pose.handFront = [pose.handFront[0] + pump * 0.06 * grounded, pose.handFront[1]]

    // The flat middle of the deck, then the two tips kicked up off its ends.
    let tailBase: Point = [pose.deckBack[0] + KICK_IN, pose.deckBack[1]]
    let noseBase: Point = [pose.deckFront[0] - KICK_IN, pose.deckFront[1]]
    let tailTip: Point = [pose.deckBack[0], pose.deckBack[1] + KICK_RISE * Math.cos(flip)]
    let noseTip: Point = [pose.deckFront[0], pose.deckFront[1] + KICK_RISE * Math.cos(flip)]
    // Side on, the readable part of a kickflip is the trucks crossing over
    // the deck. `facing` swings them from below to above and back.
    const facing = Math.cos(flip)
    let axleBack: Point = [-TRUCK_X, pose.deckBack[1] - TRUCK_DROP * facing]
    let axleFront: Point = [TRUCK_X, pose.deckFront[1] - TRUCK_DROP * facing]

    // A 5-0 rides the back truck with the nose up. A nosegrind is the mirror.
    if (grind !== 0 && grounded > 0.5) {
      const pivot = grind < 0 ? axleBack : axleFront
      const angle = grind < 0 ? TILT : -TILT
      const turn = (point: Point) => rotateAbout(point, pivot, angle)
      tailBase = turn(tailBase)
      noseBase = turn(noseBase)
      tailTip = turn(tailTip)
      noseTip = turn(noseTip)
      axleBack = turn(axleBack)
      axleFront = turn(axleFront)
      pose.footBack = rotateAbout(pose.footBack, pivot, angle * 0.7)
      pose.footFront = rotateAbout(pose.footFront, pivot, angle * 0.7)
    }

    const cos = Math.cos(-spin)
    const sin = Math.sin(-spin)
    const originY = y + FEET_TO_HIP

    // The deck thins to its edge at the quarter turn, then shows its grip side.
    const deckThickness = DECK_THICK * Math.max(0.16, Math.abs(facing))
    const boardMaterial = this.board.mesh.material as MeshBasicMaterial
    boardMaterial.color.set(facing >= 0 ? BOARD : GRIP)

    this.begin(this.board, cos, sin, x, originY)
    this.limb(tailBase, noseBase, deckThickness)
    this.limb(tailBase, tailTip, deckThickness)
    this.limb(noseBase, noseTip, deckThickness)
    this.limb([axleBack[0], axleBack[1] + TRUCK_DROP * facing], axleBack, 0.055)
    this.limb([axleFront[0], axleFront[1] + TRUCK_DROP * facing], axleFront, 0.055)
    this.end(this.board)

    for (const [index, axle] of [axleBack, axleFront].entries()) {
      const world = this.toWorld(axle)
      this.proxy.position.set(world[0], world[1], 1.1)
      this.proxy.updateMatrix()
      this.wheels.setMatrixAt(index, this.proxy.matrix)
    }
    this.wheels.instanceMatrix.needsUpdate = true

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

  private toWorld(point: Point): Point {
    const { cos, sin, x, y } = this.transform
    return [point[0] * cos - point[1] * sin + x, point[0] * sin + point[1] * cos + y]
  }

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
      const world = this.toWorld(corners[index]!)
      this.target[this.cursor++] = world[0]
      this.target[this.cursor++] = world[1]
      this.target[this.cursor++] = 1
    }
  }
}
