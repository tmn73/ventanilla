import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  SpotLight,
} from 'three'
import type { Road } from '../game/road'
import type { Path } from './path'
import { LAMP_GLOW, LAMP_LIGHT, POST_COLOR } from './palette'

/** How far apart they stand, and how many exist at once. */
const SPACING = 17
const COUNT = 8
const HEIGHT = 5.2
/** How far to the side of the road they stand. */
const LATERAL = 5.4

/**
 * Street lamps, recycled rather than built. Six of them are made once and
 * moved to wherever the camera is, which is why a run of any length costs the
 * same six.
 *
 * They are the whole reason to have a night: flat concrete with nothing on it
 * is dull in daylight and good under a row of lights, because the light is
 * what puts something on it.
 */
export class Lamps {
  private units: Array<{ group: Group; light: SpotLight; target: Object3D }> = []
  private point = { x: 0, z: 0 }

  constructor(
    scene: Object3D,
    private path: Path,
  ) {
    const postSkin = new MeshLambertMaterial({
      color: Number(POST_COLOR.rail.replace('#', '0x')),
      flatShading: true,
    })
    const glow = new MeshBasicMaterial({ color: LAMP_GLOW })

    for (let i = 0; i < COUNT; i++) {
      const group = new Group()

      const post = new Mesh(new CylinderGeometry(0.07, 0.09, HEIGHT, 6), postSkin)
      post.position.y = HEIGHT / 2
      post.castShadow = true
      group.add(post)

      const head = new Mesh(new BoxGeometry(0.5, 0.16, 0.3), glow)
      head.position.set(0, HEIGHT, 0)
      group.add(head)

      // Falls off with the square of the distance, the way light does. The
      // old one barely fell off at all, so the pool was a floodlit field.
      const light = new SpotLight(LAMP_LIGHT, 0, 24, Math.PI / 3.6, 0.75, 2)
      light.position.set(0, HEIGHT - 0.1, 0)
      light.castShadow = true
      light.shadow.mapSize.set(512, 512)
      light.shadow.camera.near = 0.5
      light.shadow.camera.far = 24
      group.add(light)

      // Aimed at the ground at its own foot. It used to aim a whole lamp
      // height below that, which put the bright part of the cone at the base
      // of the post and made the light look like it came out of the floor.
      const target = new Object3D()
      target.position.set(0, 0, 0)
      group.add(target)
      light.target = target

      group.visible = false
      scene.add(group)
      this.units.push({ group, light, target })
    }
  }

  /** 0 is off and 1 is full, so a sky can bring them up as it goes dark. */
  setNight(amount: number): void {
    for (const unit of this.units) {
      unit.group.visible = amount > 0.01
      unit.light.intensity = amount * 42
    }
  }

  update(camLeft: number, road: Road): void {
    // Only the ones near the camera exist, and they stand on whatever the
    // pavement is doing under them rather than at a fixed height.
    const first = Math.ceil((camLeft - SPACING) / SPACING) * SPACING
    this.units.forEach((unit, i) => {
      const x = first + i * SPACING
      const side = (Math.round(x / SPACING) % 2 === 0 ? 1 : -1) * LATERAL
      this.path.place(x, side, this.point)
      unit.group.position.set(this.point.x, road.floorAt(x), this.point.z)
      unit.group.rotation.y = -this.path.headingAt(x)
    })
  }
}
