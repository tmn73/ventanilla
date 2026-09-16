import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
} from 'three'
import { DEATH_Y, VIEW_WIDTH } from '../game/constants'
import { Color as ThreeColor, InstancedMesh, Object3D } from 'three'
import { RIDGE_FAR, RIDGE_MID, RIDGE_NEAR, TUFT, VERGE, skyAt } from './palette'

const RIDGE_SPAN = 240
const RIDGE_SAMPLES = 200

interface Layer {
  near: Mesh
  far: Mesh
  parallax: number
}

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
      amplitude * (0.55 * Math.sin(2 * Math.PI * (t + phase)) +
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
    const y0 = profile[i]!
    const y1 = profile[i + 1]!
    push(x0, floor)
    push(x1, floor)
    push(x1, y1)
    push(x0, floor)
    push(x1, y1)
    push(x0, y0)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  return geometry
}

function ridgeLayer(scene: Scene, color: string, amplitude: number, baseline: number, phase: number, parallax: number, depth: number): Layer {
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

const MAX_TUFTS = 120
const TUFT_SPACING = 1.15

export class Backdrop {
  private sky: Mesh
  private verge: Mesh
  private tufts: InstancedMesh
  private proxy = new Object3D()
  private layers: Layer[]

  constructor(scene: Scene) {
    const geometry = new PlaneGeometry(1, 1, 1, 28)
    const position = geometry.getAttribute('position')
    const colors = new Float32Array(position.count * 3)
    const shade = new Color()
    for (let i = 0; i < position.count; i++) {
      const t = position.getY(i) + 0.5
      skyAt(t, shade)
      colors[i * 3] = shade.r
      colors[i * 3 + 1] = shade.g
      colors[i * 3 + 2] = shade.b
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3))

    this.sky = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }))
    this.sky.position.z = -60
    this.sky.frustumCulled = false
    scene.add(this.sky)

    this.verge = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: VERGE }))
    this.verge.position.z = -3
    this.verge.frustumCulled = false
    scene.add(this.verge)

    this.tufts = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ color: new ThreeColor(TUFT) }),
      MAX_TUFTS,
    )
    this.tufts.frustumCulled = false
    scene.add(this.tufts)

    this.layers = [
      ridgeLayer(scene, RIDGE_FAR, 8.2, 7.5, 0.21, 0.07, -50),
      ridgeLayer(scene, RIDGE_MID, 5.4, 4.2, 0.44, 0.15, -45),
      ridgeLayer(scene, RIDGE_NEAR, 3.4, 1.9, 0.67, 0.27, -40),
    ]
  }

  update(camLeft: number, viewHeight: number): void {
    const top = viewHeight * 0.76

    // The verge. Touching it ends the run, so it is drawn as a flat dead floor.
    const depth = 40
    this.verge.scale.set(VIEW_WIDTH * 1.1, depth, 1)
    this.verge.position.set(camLeft + VIEW_WIDTH / 2, DEATH_Y - depth / 2, -3)

    let planted = 0
    const first = Math.ceil((camLeft - 1) / TUFT_SPACING) * TUFT_SPACING
    for (let x = first; x < camLeft + VIEW_WIDTH + 1 && planted < MAX_TUFTS; x += TUFT_SPACING) {
      // A position hash keeps every tuft in the same place from frame to frame.
      const hash = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1
      const height = 0.2 + hash * 0.42
      this.proxy.position.set(x, DEATH_Y + height / 2, -2.5)
      this.proxy.scale.set(0.1, height, 1)
      this.proxy.updateMatrix()
      this.tufts.setMatrixAt(planted++, this.proxy.matrix)
    }
    this.tufts.count = planted
    this.tufts.instanceMatrix.needsUpdate = true
    this.sky.scale.set(VIEW_WIDTH * 1.05, top, 1)
    this.sky.position.set(camLeft + VIEW_WIDTH / 2, top / 2, -60)

    for (const layer of this.layers) {
      // A layer drifting at `parallax` sits at camLeft * (1 - parallax).
      const base = camLeft * (1 - layer.parallax)
      const start = base + Math.floor((camLeft - base) / RIDGE_SPAN) * RIDGE_SPAN
      layer.near.position.x = start
      layer.far.position.x = start + RIDGE_SPAN
    }
  }
}
