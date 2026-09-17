import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
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
}

/**
 * A rider stands 1.75 tall, so one unit is one metre. The deck keeps its real
 * 84 cm length; the thickness and the wheels are pushed past life size because
 * a true 15 mm deck is two pixels at this zoom.
 */
const DECK_Y = -0.88
const DECK_HALF = 0.42
const DECK_THICK = 0.055
const DECK_BREADTH = 0.22
const KICK_IN = 0.15
const KICK_RISE = 0.06
const KICK_PITCH = 0.38
const TRUCK_X = 0.24
const TRUCK_DROP = 0.075
const WHEEL_RADIUS = 0.045
const WHEEL_Z = 0.11

const FEET_TO_HIP = -DECK_Y + TRUCK_DROP + WHEEL_RADIUS
const TILT = 0.36
/** How far a feeble or a smith tips the deck across the rail. */
const ROLL = 0.52
const HANG = 0.3

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
}

const AIR: Joints = {
  hip: [0, 0],
  shoulder: [-0.04, 0.46],
  head: [-0.08, 0.66],
  kneeBack: [-0.28, -0.26],
  footBack: [-0.22, -0.5],
  kneeFront: [0.3, -0.28],
  footFront: [0.24, -0.52],
  handBack: [-0.5, 0.02],
  handFront: [0.52, 0.56],
}

const JOINT_KEYS = Object.keys(GRIND) as Array<keyof Joints>

function mix(a: Point, b: Point, k: number): Point {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
}

function limb(parent: Group, color: number, breadth: number): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(1, 1, breadth),
    new MeshLambertMaterial({ color, flatShading: true }),
  )
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

/** Stretches a box between two points, the way a bone spans two joints. */
function span(mesh: Mesh, from: Point, to: Point, width: number): void {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy) || 0.001
  mesh.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 0)
  mesh.scale.set(length, width, 1)
  mesh.rotation.z = Math.atan2(dy, dx)
}

export class SkaterView {
  private root = new Group()
  private boardPivot = new Group()
  private board = new Group()
  private body = new Group()

  private deck: Mesh
  private tail: Mesh
  private nose: Mesh
  private trucks: Mesh[] = []
  private wheels: Mesh[] = []
  private bones: Record<string, Mesh> = {}

  constructor(scene: Scene) {
    scene.add(this.root)
    this.root.add(this.boardPivot)
    this.boardPivot.add(this.board)
    this.root.add(this.body)

    const deckColor = Number(BOARD.replace('#', '0x'))
    const gripColor = Number(GRIP.replace('#', '0x'))
    this.deck = limb(this.board, deckColor, DECK_BREADTH)
    this.tail = limb(this.board, deckColor, DECK_BREADTH)
    this.nose = limb(this.board, deckColor, DECK_BREADTH)

    // The grip side, so a kickflip shows a face change and not just a rotation.
    const grip = new Mesh(
      new BoxGeometry(DECK_HALF * 2 - KICK_IN * 2, 0.014, DECK_BREADTH * 0.96),
      new MeshLambertMaterial({ color: gripColor, flatShading: true }),
    )
    grip.position.set(0, DECK_Y + DECK_THICK / 2 + 0.008, 0)
    this.board.add(grip)

    for (const x of [-TRUCK_X, TRUCK_X]) {
      const truck = new Mesh(
        new CylinderGeometry(0.03, 0.03, TRUCK_DROP, 8),
        new MeshLambertMaterial({ color: 0x9aa3ad, flatShading: true }),
      )
      truck.position.set(x, DECK_Y - TRUCK_DROP / 2, 0)
      this.board.add(truck)
      this.trucks.push(truck)

      for (const z of [-WHEEL_Z, WHEEL_Z]) {
        const wheel = new Mesh(
          new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.05, 12),
          new MeshLambertMaterial({ color: Number(WHEEL_COLOR.replace('#', '0x')), flatShading: true }),
        )
        wheel.rotation.x = Math.PI / 2
        wheel.position.set(x, DECK_Y - TRUCK_DROP, z)
        wheel.castShadow = true
        this.board.add(wheel)
        this.wheels.push(wheel)
      }
    }

    const skin = Number(SKATER.replace('#', '0x'))
    for (const name of ['thighBack', 'shinBack', 'thighFront', 'shinFront', 'torso', 'armBack', 'armFront']) {
      this.bones[name] = limb(this.body, skin, 0.17)
    }
    const head = new Mesh(
      new BoxGeometry(0.3, 0.3, 0.27),
      new MeshLambertMaterial({ color: skin, flatShading: true }),
    )
    head.castShadow = true
    this.body.add(head)
    this.bones.head = head
  }

  /**
   * @param grounded blends the tucked pose into the crouched one
   * @param grind -2 feeble, -1 five-o, 0 fifty-fifty, 1 nosegrind, 2 smith
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
    const shift = Math.sign(grind) * 0.1 * grounded
    pose.hip = [pose.hip[0] + shift, pose.hip[1] + squat]
    pose.shoulder = [pose.shoulder[0] + shift, pose.shoulder[1] + squat * 1.3]
    pose.head = [pose.head[0] + shift, pose.head[1] + squat * 1.4]
    pose.handBack = [pose.handBack[0] - pump * 0.06 * grounded, pose.handBack[1]]
    pose.handFront = [pose.handFront[0] + pump * 0.06 * grounded, pose.handFront[1]]

    this.root.position.set(x, y + FEET_TO_HIP, 0)
    this.root.rotation.z = -spin

    // The deck rides high off the hip in the air and sits low on a grind.
    const deckLift = (1 - grounded) * 0.26

    const onRail = grounded > 0.5 && grind !== 0
    const backTruck = grind === 1
    const pivotX = backTruck ? TRUCK_X : -TRUCK_X
    // The pivot sits on the truck that is touching, so the board turns on it.
    this.boardPivot.position.set(pivotX, DECK_Y - TRUCK_DROP + deckLift, 0)
    this.board.position.set(-pivotX, -(DECK_Y - TRUCK_DROP), 0)

    let pitch = 0
    let roll = 0
    let hang = 0
    if (onRail) {
      if (grind === -1) pitch = TILT
      else if (grind === 1) pitch = -TILT
      else {
        // Feeble and smith both ride the back truck with the nose dropped.
        pitch = -TILT * 0.78
        roll = grind === -2 ? ROLL : -ROLL
        hang = grind === -2 ? -HANG : HANG
      }
    }
    this.boardPivot.rotation.set(roll, 0, pitch)
    this.boardPivot.position.z = hang

    // A kickflip rolls the deck around its long axis, on top of any grind roll.
    this.board.rotation.x = flip

    span(this.deck, [-DECK_HALF + KICK_IN, DECK_Y], [DECK_HALF - KICK_IN, DECK_Y], DECK_THICK)
    span(
      this.tail,
      [-DECK_HALF + KICK_IN, DECK_Y],
      [-DECK_HALF, DECK_Y + KICK_RISE],
      DECK_THICK,
    )
    this.tail.rotation.z = Math.PI - KICK_PITCH
    span(this.nose, [DECK_HALF - KICK_IN, DECK_Y], [DECK_HALF, DECK_Y + KICK_RISE], DECK_THICK)

    span(this.bones.thighBack!, pose.hip, pose.kneeBack, 0.13)
    span(this.bones.shinBack!, pose.kneeBack, pose.footBack, 0.11)
    span(this.bones.thighFront!, pose.hip, pose.kneeFront, 0.13)
    span(this.bones.shinFront!, pose.kneeFront, pose.footFront, 0.11)
    span(this.bones.torso!, pose.hip, pose.shoulder, 0.19)
    span(this.bones.armBack!, pose.shoulder, pose.handBack, 0.1)
    span(this.bones.armFront!, pose.shoulder, pose.handFront, 0.1)
    this.bones.head!.position.set(pose.head[0], pose.head[1] + 0.12, 0)
  }
}
