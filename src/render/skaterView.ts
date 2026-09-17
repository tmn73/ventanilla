import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  Scene,
} from 'three'
import { BOARD, GRIP, SKATER, SKATER_FACE, SKATER_LEAD, WHEEL_COLOR } from './palette'

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

/** Just after the pop: knees snap up, front arm rises, board comes with them. */
const POP: Joints = {
  hip: [0, 0],
  shoulder: [-0.03, 0.45],
  head: [-0.07, 0.65],
  kneeBack: [-0.26, -0.16],
  footBack: [-0.19, -0.4],
  kneeFront: [0.3, -0.14],
  footFront: [0.25, -0.37],
  handBack: [-0.4, 0.32],
  handFront: [0.44, 0.7],
}

/** On the way down, legs reaching for the landing. */
const REACH: Joints = {
  hip: [0, 0],
  shoulder: [0.03, 0.47],
  head: [0.06, 0.67],
  kneeBack: [-0.24, -0.44],
  footBack: [-0.26, -0.84],
  kneeFront: [0.3, -0.42],
  footFront: [0.3, -0.84],
  handBack: [-0.6, 0.3],
  handFront: [0.54, 0.44],
}

/**
 * Mid push: the trailing foot is off the board and driving behind him, and
 * the body opens over it. Nobody pushes mongo, so in switch this whole pose
 * is mirrored rather than reused, because the rig is turned round by then and
 * reusing it would put the leading foot on the ground.
 */
const PUSH: Joints = {
  hip: [0.05, -0.05],
  shoulder: [0.14, 0.41],
  head: [0.18, 0.61],
  kneeBack: [-0.42, -0.36],
  footBack: [-0.74, -0.66],
  kneeFront: [0.23, -0.45],
  footFront: [0.2, -0.79],
  handBack: [-0.52, 0.3],
  handFront: [0.7, 0.34],
}

/** The same push with the roles swapped, for when the rig is riding switch. */
const PUSH_SWITCH: Joints = mirror(PUSH)

const JOINT_KEYS = Object.keys(GRIND) as Array<keyof Joints>

/** Flips a pose front to back, so the other foot leads and the other pushes. */
function mirror(pose: Joints): Joints {
  const flip = (p: Point): Point => [-p[0], p[1]]
  return {
    hip: flip(pose.hip),
    shoulder: flip(pose.shoulder),
    head: flip(pose.head),
    kneeBack: flip(pose.kneeFront),
    footBack: flip(pose.footFront),
    kneeFront: flip(pose.kneeBack),
    footFront: flip(pose.footBack),
    handBack: flip(pose.handFront),
    handFront: flip(pose.handBack),
  }
}

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

/**
 * Everything the rig needs for one frame. It is an object rather than a list
 * of arguments because every one of these is a number, and a value slipped
 * into the wrong place would look like a pose and not like a mistake.
 */
export interface Rider {
  x: number
  y: number
  z: number
  heading: number
  lean: number
  yaw: number
  grounded: number
  pump: number
  grind: number
  flip: number
  rise: number
  absorb: number
  push: number
  switched: boolean
  stance: number
  shove: number
  /** True when he popped off the nose, which tips the board the other way. */
  nose: boolean
}

export class SkaterView {
  private root = new Group()
  /** The road's heading, then the ramp lean, then the rider's own facing. */
  private leaner = new Group()
  private face!: Mesh
  private turner = new Group()
  private boardPivot = new Group()
  private board = new Group()
  /** Origin on the deck centreline, so a kickflip turns the board on its axis. */
  private deckAxis = new Group()
  private body = new Group()

  private deck: Mesh
  private tail: Mesh
  private nose: Mesh
  private trucks: Mesh[] = []
  private wheels: Mesh[] = []
  private bones: Record<string, Mesh> = {}

  constructor(scene: Scene) {
    scene.add(this.root)
    this.root.add(this.leaner)
    this.leaner.add(this.turner)
    this.turner.add(this.boardPivot)
    this.boardPivot.add(this.board)
    this.board.add(this.deckAxis)
    this.deckAxis.position.y = DECK_Y
    this.turner.add(this.body)

    const deckColor = Number(BOARD.replace('#', '0x'))
    const gripColor = Number(GRIP.replace('#', '0x'))
    this.deck = limb(this.deckAxis, deckColor, DECK_BREADTH)
    this.tail = limb(this.deckAxis, deckColor, DECK_BREADTH)
    this.nose = limb(this.deckAxis, deckColor, DECK_BREADTH)

    // The grip side, so a kickflip shows a face change and not just a rotation.
    const grip = new Mesh(
      new BoxGeometry(DECK_HALF * 2 - KICK_IN * 2, 0.014, DECK_BREADTH * 0.96),
      new MeshLambertMaterial({ color: gripColor, flatShading: true }),
    )
    grip.position.set(0, DECK_THICK / 2 + 0.008, 0)
    this.deckAxis.add(grip)

    for (const x of [-TRUCK_X, TRUCK_X]) {
      const truck = new Mesh(
        new CylinderGeometry(0.03, 0.03, TRUCK_DROP, 8),
        new MeshLambertMaterial({ color: 0x9aa3ad, flatShading: true }),
      )
      truck.position.set(x, -TRUCK_DROP / 2, 0)
      this.deckAxis.add(truck)
      this.trucks.push(truck)

      for (const z of [-WHEEL_Z, WHEEL_Z]) {
        const wheel = new Mesh(
          new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.05, 12),
          new MeshLambertMaterial({ color: Number(WHEEL_COLOR.replace('#', '0x')), flatShading: true }),
        )
        wheel.rotation.x = Math.PI / 2
        wheel.position.set(x, -TRUCK_DROP, z)
        wheel.castShadow = true
        this.deckAxis.add(wheel)
        this.wheels.push(wheel)
      }
    }

    const skin = Number(SKATER.replace('#', '0x'))
    const lead = Number(SKATER_LEAD.replace('#', '0x'))
    for (const name of ['thighBack', 'shinBack', 'thighFront', 'shinFront', 'torso', 'armBack']) {
      this.bones[name] = limb(this.body, skin, 0.17)
    }
    // The arm nearest the nose is lighter, which is what tells you which way
    // he is travelling when the rest of him is one silhouette.
    this.bones.armFront = limb(this.body, lead, 0.17)

    const head = new Mesh(
      new BoxGeometry(0.3, 0.3, 0.27),
      new MeshLambertMaterial({ color: skin, flatShading: true }),
    )
    head.castShadow = true
    this.body.add(head)
    this.bones.head = head

    // A pale plate on the front of the head. It is the only thing on him that
    // is not the same from both sides, so it is the whole answer to whether
    // you are looking at his face or his back.
    this.face = new Mesh(
      new BoxGeometry(0.2, 0.13, 0.04),
      new MeshLambertMaterial({ color: Number(SKATER_FACE.replace('#', '0x')), flatShading: true }),
    )
    this.face.position.y = 0.02
    head.add(this.face)
  }

  /**
   * @param z where the bending road has put him
   * @param heading which way the road points under him
   * @param lean radians of the ramp under him
   * @param yaw radians he has turned about his own axis
   * @param grounded blends the airborne pose into the riding one
   * @param pump the compress and extend of a roll
   * @param grind -2 feeble, -1 five-o, 0 fifty-fifty, 1 nosegrind, 2 smith
   * @param flip signed radians through a flip: one way a kickflip, the other
   *   a heelflip
   * @param rise vertical speed over the pop speed, 1 at the pop and -1 falling
   * @param absorb 0 to 1, how hard the last landing has to be soaked up
   * @param push 0 to 1, how far through a kick he is
   * @param switched true when the rig is turned round, so the push mirrors
   * @param stance 1 for regular, -1 for goofy, which swaps the leading foot
   */
  update(rider: Rider): void {
    const {
      x,
      y,
      z,
      heading,
      lean,
      yaw,
      grounded,
      pump,
      grind,
      flip,
      rise,
      absorb,
      push,
      switched,
      stance,
      shove,
      nose,
    } = rider
    // Airborne, the pose runs pop to level to reach. On the ground it settles
    // into the ride, then compresses under whatever the landing cost.
    const air = {} as Joints
    for (const key of JOINT_KEYS) {
      air[key] = rise >= 0 ? mix(AIR[key], POP[key], rise) : mix(AIR[key], REACH[key], -rise)
    }

    // Riding switch turns the rig round, so the foot that was at the back is
    // now at the front. Pushing with it would be mongo, which nobody does.
    const kick = switched ? PUSH_SWITCH : PUSH
    const ride = {} as Joints
    for (const key of JOINT_KEYS) ride[key] = mix(GRIND[key], kick[key], push)

    const pose = {} as Joints
    for (const key of JOINT_KEYS) pose[key] = mix(air[key], ride[key], grounded)

    // Stance only swaps which shoulder leads. Mirroring the whole pose would
    // put the leading foot on the ground, which is the mongo it was meant to
    // stop: whichever way you stand, you push off the back foot.
    if (stance < 0) {
      const back = pose.handBack
      pose.handBack = [back[0], pose.handFront[1]]
      pose.handFront = [pose.handFront[0], back[1]]
    }

    const squat = pump * 0.06 * grounded - absorb * 0.2 * grounded
    const shift = Math.sign(grind) * 0.1 * grounded
    pose.hip = [pose.hip[0] + shift, pose.hip[1] + squat]
    pose.shoulder = [pose.shoulder[0] + shift, pose.shoulder[1] + squat * 1.25]
    pose.head = [pose.head[0] + shift, pose.head[1] + squat * 1.35]
    pose.kneeBack = [pose.kneeBack[0] - absorb * 0.06, pose.kneeBack[1] + squat * 0.45]
    pose.kneeFront = [pose.kneeFront[0] + absorb * 0.06, pose.kneeFront[1] + squat * 0.45]
    pose.handBack = [pose.handBack[0] - pump * 0.05 * grounded, pose.handBack[1] + absorb * 0.1]
    pose.handFront = [pose.handFront[0] + pump * 0.05 * grounded, pose.handFront[1] + absorb * 0.1]

    // The deck rides under the feet rather than at a fixed height, which is
    // what makes a pop look like the board coming up with him. During a push
    // only the front foot is on it, so the back foot must not drag it down.
    const boardY =
      push > 0.05
        ? pose.footFront[1] - 0.09
        : (pose.footBack[1] + pose.footFront[1]) / 2 - 0.09

    this.root.position.set(x, y + FEET_TO_HIP, z)
    this.root.rotation.y = -heading
    this.leaner.rotation.z = lean
    this.turner.rotation.y = yaw

    const onRail = grounded > 0.5 && grind !== 0
    const backTruck = grind === 1
    const pivotX = backTruck ? TRUCK_X : -TRUCK_X

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
    } else {
      // The end he popped off snaps down and the board levels out at the top.
      // A nollie does it with the nose, which is the whole look of the trick.
      const end = nose ? -1 : 1
      pitch = (rise > 0 ? rise * 0.52 : rise * 0.16) * (1 - grounded) * end
    }

    // The pivot sits on the truck that is touching, so the board turns on it.
    this.boardPivot.position.set(pivotX, boardY - TRUCK_DROP, hang)
    this.board.position.set(-pivotX, -(boardY - TRUCK_DROP), 0)
    this.deckAxis.position.y = boardY
    this.boardPivot.rotation.set(roll, 0, pitch)

    // A flip rolls the deck around its own long axis, not around the rider.
    // A shove turns it about the upright, under feet that do not follow it.
    this.deckAxis.rotation.set(flip, shove, 0)

    span(this.deck, [-DECK_HALF + KICK_IN, 0], [DECK_HALF - KICK_IN, 0], DECK_THICK)
    span(this.tail, [-DECK_HALF + KICK_IN, 0], [-DECK_HALF, KICK_RISE], DECK_THICK)
    span(this.nose, [DECK_HALF - KICK_IN, 0], [DECK_HALF, KICK_RISE], DECK_THICK)

    span(this.bones.thighBack!, pose.hip, pose.kneeBack, 0.13)
    span(this.bones.shinBack!, pose.kneeBack, pose.footBack, 0.11)
    span(this.bones.thighFront!, pose.hip, pose.kneeFront, 0.13)
    span(this.bones.shinFront!, pose.kneeFront, pose.footFront, 0.11)
    span(this.bones.torso!, pose.hip, pose.shoulder, 0.19)
    span(this.bones.armBack!, pose.shoulder, pose.handBack, 0.1)
    span(this.bones.armFront!, pose.shoulder, pose.handFront, 0.1)
    this.bones.head!.position.set(pose.head[0], pose.head[1] + 0.12, 0)
    // Standing regular he has his back to the camera, goofy he faces it. The
    // yaw turns the rest, so this only has to follow the stance.
    this.face.position.z = stance > 0 ? -0.16 : 0.16
  }
}
