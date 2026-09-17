import {
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
} from 'three'
import { DEATH_Y, VIEW_WIDTH } from '../game/constants'
import {
  FOAM,
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
}

/**
 * Flat bands, stacked by distance. Nearest is lowest in the window, because
 * that is what a side window shows: tarmac at your feet, then the shoulder,
 * the sand, the bay, and the headlands across it.
 */
interface Band {
  mesh: Mesh
  top: number
  depth: number
  z: number
}

/**
 * The promenade runs along the sand, the sand meets the water, and the
 * headlands close the bay. Every band is offset by the pavement height, so
 * the composition holds while the street climbs and drops.
 */
const BANDS: Array<{ color: string; top: number; depth: number; z: number }> = [
  { color: SAND, top: 1.6, depth: 60, z: -14 },
  { color: SAND_WET, top: 1.75, depth: 0.28, z: -14.2 },
  { color: FOAM, top: 1.95, depth: 0.22, z: -14.4 },
  { color: SEA, top: 4.6, depth: 2.65, z: -14.6 },
  { color: SEA_DEEP, top: 4.9, depth: 0.3, z: -14.8 },
]

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
  scene: Scene,
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
  return { near, far, parallax }
}

function band(scene: Scene, color: string, z: number): Mesh {
  const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color }))
  mesh.position.z = z
  mesh.frustumCulled = false
  scene.add(mesh)
  return mesh
}

function instanced(scene: Scene, color: string, max: number, z: number): InstancedMesh {
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

  constructor(scene: Scene) {
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

    // Headlands rise out of the bay, so they are drawn before the water bands.
    this.layers = [
      ridgeLayer(scene, SIERRA_SNOW, 7.2, 9.4, 0.21, 0.05, -80),
      ridgeLayer(scene, SIERRA, 6.4, 7.6, 0.24, 0.07, -78),
      ridgeLayer(scene, HEADLAND, 3.8, 5.2, 0.44, 0.14, -60),
      ridgeLayer(scene, JUNGLE, 2.4, 4.1, 0.67, 0.26, -50),
    ]

    this.bands = BANDS.map((spec) => ({
      mesh: band(scene, spec.color, spec.z),
      top: spec.top,
      depth: spec.depth,
      z: spec.z,
    }))

    this.trunks = instanced(scene, PALM_TRUNK, MAX_PALMS, -13)
    this.crowns = instanced(scene, PALM_CROWN, MAX_PALMS * 5, -12.8)
  }

  update(camLeft: number, viewHeight: number, ground: number): void {
    const lift = ground - DEATH_Y
    const top = viewHeight * 0.76
    const centre = camLeft + VIEW_WIDTH / 2
    this.sky.scale.set(VIEW_WIDTH * 1.05, top + 40, 1)
    this.sky.position.set(centre, lift + (top + 40) / 2 - 20, -90)

    for (const item of this.bands) {
      item.mesh.scale.set(VIEW_WIDTH * 1.1, item.depth, 1)
      item.mesh.position.set(centre, lift + item.top - item.depth / 2, item.z)
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
      const footY = lift + 1.5

      this.proxy.position.set(wx, footY + height / 2, -13)
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
          -12.8,
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
      // A layer drifting at `parallax` sits at camLeft * (1 - parallax).
      const anchor = camLeft * (1 - layer.parallax)
      const start = anchor + Math.floor((camLeft - anchor) / RIDGE_SPAN) * RIDGE_SPAN
      layer.near.position.set(start, lift, layer.near.position.z)
      layer.far.position.set(start + RIDGE_SPAN, lift, layer.far.position.z)
    }
  }
}
