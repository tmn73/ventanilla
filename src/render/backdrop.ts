import {
  BufferAttribute,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
} from 'three'
import { VIEW_WIDTH, WORLD_FLOOR } from '../game/constants'
import { SKY_NIGHT, SKY_TOP, skyAt } from './palette'

/**
 * Three planes and a sky. Everything that used to stand here, the town, the
 * palms, the benches, the hills, is gone: none of it was ever looked at, and
 * all of it could be got wrong.
 *
 * `y` is a fixed world height. Anchoring any of this to the pavement made the
 * whole world slide down a stair set with the player.
 */
/**
 * The beach and the sea are gone. They were two huge flat planes that filled
 * most of the frame with nothing, and the one at the front was the pale strip
 * that sat across the middle of the screen at night.
 */
const BANDS: Array<{ color: string; y: number; from: number; to: number }> = []

/** Where the flat ground stops and the sky takes over. */
const HORIZON_LATERAL = -60

export class Backdrop {
  private sky: Mesh
  private bands: Array<{ mesh: Mesh; color: string; y: number; from: number; to: number }>

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
      // Lit, not painted. These were unlit, so night had no effect on them at
      // all and the ground stayed daylight-bright under a black sky.
      const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshLambertMaterial({ color: spec.color }))
      // Flat on the ground rather than standing up facing the camera.
      mesh.rotation.x = -Math.PI / 2
      mesh.frustumCulled = false
      scene.add(mesh)
      return { mesh, color: spec.color, y: spec.y, from: spec.from, to: spec.to }
    })
  }

  /**
   * How dark the day is. The sky and the ground are tinted by hand rather
   * than left to the lighting: they are enormous flat things far from any
   * lamp, and the scene's own light never reached them.
   */
  setNight(amount: number): void {
    const sky = this.sky.material as MeshBasicMaterial
    sky.vertexColors = false
    sky.color.set(SKY_TOP).lerp(new Color(SKY_NIGHT), amount)
    sky.needsUpdate = true
    for (const item of this.bands) {
      const material = item.mesh.material as MeshLambertMaterial
      material.color.set(item.color).multiplyScalar(1 - amount * 0.93)
    }
  }

  update(camLeft: number, viewHeight: number): void {
    const centre = camLeft + VIEW_WIDTH / 2
    const top = viewHeight * 0.76

    this.sky.scale.set(VIEW_WIDTH * 9, top + 40, 1)
    this.sky.position.set(centre, WORLD_FLOOR + (top + 40) / 2, HORIZON_LATERAL - 2)
    // They follow the camera outright. Stars do not shift as you walk, and
    // offsetting them by a fraction of the travel simply carried them off the
    // side of the screen.

    for (const item of this.bands) {
      item.mesh.scale.set(VIEW_WIDTH * 9, item.to - item.from, 1)
      item.mesh.position.set(centre, item.y, (item.from + item.to) / 2)
    }
  }
}
