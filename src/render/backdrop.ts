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
  ASPHALT,
  AWNING,
  FACADE,
  FACADE_ROOF,
  HEADLAND,
  JUNGLE,
  SIERRA,
  SIERRA_SNOW,
  WINDOW,
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

/** Everything under the pavement is the street below, in shade. */
const BANDS: Array<{ key: string; color: string; top: number; depth: number; z: number }> = [
  { key: 'street', color: ASPHALT, top: DEATH_Y - 2.4, depth: 60, z: -2.8 },
]

const MAX_HOUSES = 48
const HOUSE_SPACING = 5.4
const HOUSE_PARALLAX = 0.38
const HOUSE_BASE = 1.4

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
    new MeshBasicMaterial({ color: new Color(color), vertexColors: color === '#ffffff' }),
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
  private houses: InstancedMesh
  private roofs: InstancedMesh
  private windows: InstancedMesh
  private awnings: InstancedMesh
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
      ridgeLayer(scene, SIERRA_SNOW, 7.2, 9.4, 0.21, 0.05, -52),
      ridgeLayer(scene, SIERRA, 6.4, 7.6, 0.24, 0.07, -50),
      ridgeLayer(scene, HEADLAND, 3.8, 5.2, 0.44, 0.14, -45),
      ridgeLayer(scene, JUNGLE, 2.4, 4.1, 0.67, 0.26, -40),
    ]

    this.bands = BANDS.map((spec) => ({
      mesh: band(scene, spec.color, spec.z),
      top: spec.top,
      depth: spec.depth,
      z: spec.z,
    }))

    this.houses = instanced(scene, '#ffffff', MAX_HOUSES, -3.4)
    this.roofs = instanced(scene, FACADE_ROOF, MAX_HOUSES, -3.38)
    this.windows = instanced(scene, WINDOW, MAX_HOUSES * 2, -3.36)
    this.awnings = instanced(scene, AWNING, MAX_HOUSES, -3.34)
  }

  update(camLeft: number, viewHeight: number): void {
    const top = viewHeight * 0.76
    const centre = camLeft + VIEW_WIDTH / 2
    this.sky.scale.set(VIEW_WIDTH * 1.05, top, 1)
    this.sky.position.set(centre, top / 2, -60)

    for (const item of this.bands) {
      item.mesh.scale.set(VIEW_WIDTH * 1.1, item.depth, 1)
      item.mesh.position.set(centre, item.top - item.depth / 2, item.z)
    }

    // Painted colonial facades, drifting at their own rate behind the street.
    let built = 0
    let panes = 0
    const base = camLeft * HOUSE_PARALLAX
    const lag = camLeft - base
    const firstHouse = Math.ceil((base - 10) / HOUSE_SPACING) * HOUSE_SPACING
    const tint = new Color()
    for (let hx = firstHouse; hx < base + VIEW_WIDTH + 10 && built < MAX_HOUSES; hx += HOUSE_SPACING) {
      const hash = Math.abs(Math.sin(hx * 7.311) * 21374.9) % 1
      const spread = Math.abs(Math.sin(hx * 3.117) * 9431.7) % 1
      const height = 4.5 + hash * 5.5
      const width = HOUSE_SPACING + 0.6
      const wx = hx + lag

      tint.set(FACADE[Math.floor(spread * FACADE.length) % FACADE.length]!)
      this.proxy.position.set(wx, HOUSE_BASE + height / 2, -3.4)
      this.proxy.scale.set(width, height, 1)
      this.proxy.updateMatrix()
      this.houses.setMatrixAt(built, this.proxy.matrix)
      this.houses.setColorAt(built, tint)

      this.proxy.position.set(wx, HOUSE_BASE + height + 0.22, -3.38)
      this.proxy.scale.set(width * 1.08, 0.44, 1)
      this.proxy.updateMatrix()
      this.roofs.setMatrixAt(built, this.proxy.matrix)

      this.proxy.position.set(wx, HOUSE_BASE + 2.1, -3.34)
      this.proxy.scale.set(width * 0.82, 0.3, 1)
      this.proxy.updateMatrix()
      this.awnings.setMatrixAt(built, this.proxy.matrix)
      built++

      for (const [row, side] of [[0.62, -1], [0.62, 1]] as Array<[number, number]>) {
        if (panes >= MAX_HOUSES * 2) break
        this.proxy.position.set(wx + side * width * 0.22, HOUSE_BASE + height * row, -3.36)
        this.proxy.scale.set(0.9, 1.3, 1)
        this.proxy.updateMatrix()
        this.windows.setMatrixAt(panes++, this.proxy.matrix)
      }
    }
    this.houses.count = built
    this.roofs.count = built
    this.awnings.count = built
    this.windows.count = panes
    this.houses.instanceMatrix.needsUpdate = true
    if (this.houses.instanceColor) this.houses.instanceColor.needsUpdate = true
    this.roofs.instanceMatrix.needsUpdate = true
    this.awnings.instanceMatrix.needsUpdate = true
    this.windows.instanceMatrix.needsUpdate = true

    for (const layer of this.layers) {
      // A layer drifting at `parallax` sits at camLeft * (1 - parallax).
      const anchor = camLeft * (1 - layer.parallax)
      const start = anchor + Math.floor((camLeft - anchor) / RIDGE_SPAN) * RIDGE_SPAN
      layer.near.position.x = start
      layer.far.position.x = start + RIDGE_SPAN
    }
  }
}
