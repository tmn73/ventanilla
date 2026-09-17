import {
  BufferAttribute,
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from 'three'
import { VIEW_WIDTH, WORLD_FLOOR } from '../game/constants'
import { GROUND, WATER, skyAt } from './palette'

/**
 * Three planes and a sky. Everything that used to stand here, the town, the
 * palms, the benches, the hills, is gone: none of it was ever looked at, and
 * all of it could be got wrong.
 *
 * `y` is a fixed world height. Anchoring any of this to the pavement made the
 * whole world slide down a stair set with the player.
 */
const BANDS: Array<{ color: string; y: number; from: number; to: number }> = [
  { color: WATER, y: WORLD_FLOOR, from: 16, to: 120 },
  { color: GROUND, y: WORLD_FLOOR + 0.16, from: -60, to: 16 },
]

/** Where the flat ground stops and the sky takes over. */
const HORIZON_LATERAL = -60

export class Backdrop {
  private sky: Mesh
  private bands: Array<{ mesh: Mesh; y: number; from: number; to: number }>

  constructor(scene: Object3D) {
    const geometry = new PlaneGeometry(1, 1, 1, 12)
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
    this.sky.frustumCulled = false
    scene.add(this.sky)

    this.bands = BANDS.map((spec) => {
      const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: spec.color }))
      // Flat on the ground rather than standing up facing the camera.
      mesh.rotation.x = -Math.PI / 2
      mesh.frustumCulled = false
      scene.add(mesh)
      return { mesh, y: spec.y, from: spec.from, to: spec.to }
    })
  }

  update(camLeft: number, viewHeight: number): void {
    const centre = camLeft + VIEW_WIDTH / 2
    const top = viewHeight * 0.76

    this.sky.scale.set(VIEW_WIDTH * 9, top + 40, 1)
    this.sky.position.set(centre, WORLD_FLOOR + (top + 40) / 2, HORIZON_LATERAL - 2)

    for (const item of this.bands) {
      item.mesh.scale.set(VIEW_WIDTH * 9, item.to - item.from, 1)
      item.mesh.position.set(centre, item.y, (item.from + item.to) / 2)
    }
  }
}
