import { Mesh, MeshLambertMaterial, type Object3D, PlaneGeometry } from 'three'
import { GROUND } from './palette'

/** How far under the pavement it lies. */
const DROP = 1.1
/**
 * How far it reaches behind the road and in front of it. Behind is short on
 * purpose: an orthographic camera has no horizon, so a ground plane running
 * away from you simply climbs the screen forever and swallows the sky. The far
 * edge is the horizon here, and it is put where one should be.
 */
const BEHIND = 15
const TOWARD = 60

/**
 * The ground the promenade is built on.
 *
 * Without it the road was a slab floating in a white field, which reads as
 * broken rather than as designed. It follows the pavement's height rather than
 * sitting at a fixed one, because the road wanders twenty metres up and down
 * and a fixed plane would surface through it. Nothing on it moves or repeats,
 * so following along costs nothing to look at.
 */
export class Ground {
  private mesh: Mesh

  constructor(scene: Object3D) {
    this.mesh = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshLambertMaterial({ color: GROUND }),
    )
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.frustumCulled = false
    this.mesh.receiveShadow = true
    scene.add(this.mesh)
  }

  update(centre: number, roadY: number): void {
    this.mesh.scale.set(1200, BEHIND + TOWARD, 1)
    this.mesh.position.set(centre, roadY - DROP, (TOWARD - BEHIND) / 2)
  }
}
