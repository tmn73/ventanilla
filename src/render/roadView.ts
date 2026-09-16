import { Color, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, Scene } from 'three'
import { VIEW_WIDTH } from '../game/constants'
import type { Segment, SurfaceKind } from '../game/road'
import { SURFACE_COLOR } from './palette'

const MAX_INSTANCES = 600

/** How far each surface hangs below its ridable top edge. */
const THICKNESS: Record<SurfaceKind, number> = {
  ground: 14,
  rail: 0.34,
  wall: 2.4,
  wire: 0.14,
  vehicle: 1.6,
}

const DEPTH: Record<SurfaceKind, number> = {
  ground: -2,
  wall: -1,
  rail: 0,
  vehicle: 0.3,
  wire: 0.6,
}

export class RoadView {
  private mesh: InstancedMesh
  private proxy = new Object3D()
  private tint = new Color()

  constructor(scene: Scene) {
    const geometry = new PlaneGeometry(1, 1)
    const material = new MeshBasicMaterial({ vertexColors: true })
    this.mesh = new InstancedMesh(geometry, material, MAX_INSTANCES)
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  update(segments: Segment[], camLeft: number): void {
    const right = camLeft + VIEW_WIDTH
    let drawn = 0

    for (const segment of segments) {
      if (segment.x1 < camLeft - 2 || segment.x0 > right + 2) continue
      if (drawn >= MAX_INSTANCES) break

      const depth = THICKNESS[segment.kind]
      this.proxy.position.set(
        (segment.x0 + segment.x1) / 2,
        segment.y - depth / 2,
        DEPTH[segment.kind],
      )
      this.proxy.scale.set(segment.x1 - segment.x0, depth, 1)
      this.proxy.updateMatrix()
      this.mesh.setMatrixAt(drawn, this.proxy.matrix)
      this.mesh.setColorAt(drawn, this.tint.set(SURFACE_COLOR[segment.kind] ?? '#000000'))
      drawn++
    }

    this.mesh.count = drawn
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}
