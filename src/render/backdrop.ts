import {
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from 'three'
import { VIEW_WIDTH } from '../game/constants'
import {
  FOAM,
  STREET,
  TOWN,
  HEADLAND,
  JUNGLE,
  PALM_CROWN,
  PALM_TRUNK,
  SAND,
  SAND_WET,
  SEA,
  SEA_DEEP,
  SIERRA,
  SIERRA_SNOW,
  skyAt,
} from './palette'

const RIDGE_SPAN = 240
const RIDGE_SAMPLES = 200

interface Layer {
  near: Mesh
  far: Mesh
  parallax: number
  depth: number
}

/**
 * Flat bands, stacked by distance. Nearest is lowest in the window, because
 * that is what a side window shows: tarmac at your feet, then the shoulder,
 * the sand, the bay, and the headlands across it.
 */
interface Band {
  mesh: Mesh
  drop: number
  from: number
  to: number
}

/**
 * Ground, laid flat. These were upright bands painted behind the promenade,
 * which is why it looked like it floated in front of a wall of sand instead
 * of standing on a beach.
 *
 * `drop` is metres below the pavement, `from` and `to` are metres to the side
 * of the road. Positive is toward the camera.
 */
/**
 * A malecon has the water on one side and the town on the other. The camera
 * looks from the sea side, so the bay is in the foreground and the town rises
 * behind: positive is toward the camera, negative is away.
 */
const GROUND: Array<{ color: string; drop: number; from: number; to: number }> = [
  { color: SEA_DEEP, drop: 1.54, from: 26, to: 80 },
  { color: SEA, drop: 1.5, from: 15.5, to: 80 },
  { color: FOAM, drop: 1.42, from: 14.5, to: 15.6 },
  { color: SAND_WET, drop: 1.36, from: 13, to: 14.6 },
  { color: SAND, drop: 1.3, from: 5.8, to: 13.1 },
  { color: STREET, drop: 0.14, from: -12.5, to: -5.8 },
  { color: TOWN, drop: 0.14, from: -23, to: -12.5 },
]

/** Where the flat ground stops and the upright backdrop takes over. */
const HORIZON_LATERAL = -23

const MAX_PALMS = 26
const PALM_SPACING = 7.4
const PALM_PARALLAX = 0.52

/**
 * Seamless ridge line. Every wave completes a whole number of cycles over the
 * span, so the tile joins itself without a visible seam.
 */
function ridgeGeometry(amplitude: number, baseline: number, phase: number): BufferGeometry {
  const profile = new Float32Array(RIDGE_SAMPLES + 1)
  for (let i = 0; i <= RIDGE_SAMPLES; i++) {
    const t = i / RIDGE_SAMPLES
    profile[i] =
      baseline +
      amplitude *
        (0.55 * Math.sin(2 * Math.PI * (t + phase)) +
          0.28 * Math.sin(2 * Math.PI * (3 * t + phase * 2)) +
          0.17 * Math.sin(2 * Math.PI * (7 * t + phase * 3)))
  }

  const floor = -40
  const positions = new Float32Array(RIDGE_SAMPLES * 6 * 3)
  let k = 0
  const push = (x: number, y: number) => {
    positions[k++] = x
    positions[k++] = y
    positions[k++] = 0
  }
  for (let i = 0; i < RIDGE_SAMPLES; i++) {
    const x0 = (i / RIDGE_SAMPLES) * RIDGE_SPAN
    const x1 = ((i + 1) / RIDGE_SAMPLES) * RIDGE_SPAN
    push(x0, floor)
    push(x1, floor)
    push(x1, profile[i + 1]!)
    push(x0, floor)
    push(x1, profile[i + 1]!)
    push(x0, profile[i]!)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  return geometry
}

function ridgeLayer(
  scene: Object3D,
  color: string,
  amplitude: number,
  baseline: number,
  phase: number,
  parallax: number,
  depth: number,
): Layer {
  const geometry = ridgeGeometry(amplitude, baseline, phase)
  const material = new MeshBasicMaterial({ color })
  const near = new Mesh(geometry, material)
  const far = new Mesh(geometry, material)
  for (const mesh of [near, far]) {
    mesh.position.z = depth
    mesh.frustumCulled = false
    scene.add(mesh)
  }
  return { near, far, parallax, depth }
}

function band(scene: Object3D, color: string, z: number): Mesh {
  const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color }))
  mesh.position.z = z
  mesh.frustumCulled = false
  scene.add(mesh)
  return mesh
}

function instanced(scene: Object3D, color: string, max: number, z: number): InstancedMesh {
  const mesh = new InstancedMesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({ color: new Color(color) }),
    max,
  )
  mesh.frustumCulled = false
  mesh.position.z = z
  scene.add(mesh)
  return mesh
}

export class Backdrop {
  private sky: Mesh
  private bands: Band[]
  private trunks: InstancedMesh
  private crowns: InstancedMesh
  private proxy = new Object3D()
  private layers: Layer[]

  constructor(scene: Object3D, world: Object3D) {
    const geometry = new PlaneGeometry(1, 1, 1, 28)
    const position = geometry.getAttribute('position')
    const colors = new Float32Array(position.count * 3)
    const shade = new Color()
    for (let i = 0; i < position.count; i++) {
      skyAt(position.getY(i) + 0.5, shade)
      colors[i * 3] = shade.r
      colors[i * 3 + 1] = shade.g
      colors[i * 3 + 2] = shade.b
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3))

    this.sky = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }))
    this.sky.position.z = -60
    this.sky.frustumCulled = false
    scene.add(this.sky)

    // The hills stay put in the world while the road turns under them. That
    // swing is the only thing that shows a bend, since the camera and the
    // promenade both turn together and cancel each other out.
    this.layers = [
      ridgeLayer(world, SIERRA_SNOW, 2.8, 5.6, 0.21, 0.05, -22.6),
      ridgeLayer(world, SIERRA, 2.3, 4.2, 0.24, 0.07, -22.5),
      ridgeLayer(world, HEADLAND, 1.5, 2.3, 0.44, 0.14, -22.4),
      ridgeLayer(world, JUNGLE, 1.0, 1.3, 0.67, 0.26, -22.3),
    ]

    this.bands = GROUND.map((spec) => {
      const mesh = band(scene, spec.color, 0)
      // Flat on the ground rather than standing up facing the camera.
      mesh.rotation.x = -Math.PI / 2
      return { mesh, drop: spec.drop, from: spec.from, to: spec.to }
    })

    this.trunks = instanced(scene, PALM_TRUNK, MAX_PALMS, -13)
    this.crowns = instanced(scene, PALM_CROWN, MAX_PALMS * 5, -12.8)
  }

  update(camLeft: number, viewHeight: number, ground: number, worldX: number, worldZ: number): void {
    const top = viewHeight * 0.76
    const centre = camLeft + VIEW_WIDTH / 2
    this.sky.scale.set(VIEW_WIDTH * 9, top + 30, 1)
    this.sky.position.set(centre, ground - 0.14 + (top + 30) / 2, HORIZON_LATERAL - 2)

    for (const item of this.bands) {
      item.mesh.scale.set(VIEW_WIDTH * 9, item.to - item.from, 1)
      item.mesh.position.set(centre, ground - item.drop, (item.from + item.to) / 2)
    }

    // Palms along the promenade, drifting at their own rate.
    let planted = 0
    let fronds = 0
    const base = camLeft * PALM_PARALLAX
    const lag = camLeft - base
    const firstPalm = Math.ceil((base - 8) / PALM_SPACING) * PALM_SPACING
    for (let px = firstPalm; px < base + VIEW_WIDTH + 8 && planted < MAX_PALMS; px += PALM_SPACING) {
      const hash = Math.abs(Math.sin(px * 7.311) * 21374.9) % 1
      const spread = Math.abs(Math.sin(px * 3.117) * 9431.7) % 1
      if (spread < 0.3) continue
      const height = 3.4 + hash * 2.8
      const wx = px + lag
      const footY = ground - 1.28
      // Scattered back across the sand rather than all on one line.
      const back = 8 + spread * 5

      this.proxy.position.set(wx, footY + height / 2, back)
      this.proxy.scale.set(0.26, height, 1)
      this.proxy.rotation.z = (hash - 0.5) * 0.16
      this.proxy.updateMatrix()
      this.proxy.rotation.z = 0
      this.trunks.setMatrixAt(planted++, this.proxy.matrix)

      for (const angle of [2.55, 2.0, 1.571, 1.14, 0.6]) {
        if (fronds >= MAX_PALMS * 5) break
        const reach = 1.5
        this.proxy.position.set(
          wx + Math.cos(angle) * reach * 0.5,
          footY + height + Math.sin(angle) * reach * 0.3,
          back + Math.cos(angle) * 0.6,
        )
        this.proxy.scale.set(reach * 1.4, 0.2, 1)
        this.proxy.rotation.z = angle - Math.PI / 2 + (angle > 1.571 ? 0.55 : -0.55)
        this.proxy.updateMatrix()
        this.proxy.rotation.z = 0
        this.crowns.setMatrixAt(fronds++, this.proxy.matrix)
      }
    }
    this.trunks.count = planted
    this.crowns.count = fronds
    this.trunks.instanceMatrix.needsUpdate = true
    this.crowns.instanceMatrix.needsUpdate = true

    for (const layer of this.layers) {
      // Tiled against the camera's world position, since these sit outside the
      // frame that carries the bend.
      const anchor = worldX * (1 - layer.parallax)
      const start = anchor + Math.floor((worldX - RIDGE_SPAN / 2 - anchor) / RIDGE_SPAN) * RIDGE_SPAN
      layer.near.position.set(start, ground - 0.14, worldZ + layer.depth)
      layer.far.position.set(start + RIDGE_SPAN, ground - 0.14, worldZ + layer.depth)
    }
  }
}
