import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Material,
  MeshLambertMaterial,
  Object3D,
  Scene,
} from 'three'
import { VIEW_WIDTH } from '../game/constants'
import { surfaceYAt, type Segment, type SurfaceKind } from '../game/road'
import { POST_COLOR, SURFACE_COLOR } from './palette'

const MAX_BOXES = 900
const MAX_RODS = 500

/** How far each surface hangs below its ridable top edge, and how deep it runs. */
const THICKNESS: Record<SurfaceKind, number> = {
  flat: 1.5,
  step: 1.0,
  ledge: 0.58,
  hubba: 0.62,
  rail: 0.11,
}

const BREADTH: Record<SurfaceKind, number> = {
  flat: 7,
  step: 7,
  ledge: 1.7,
  hubba: 1.7,
  rail: 0.11,
}

const RAIL_RADIUS = 0.055
const RAIL_POST_SPACING = 2.4
const RAIL_POST_DROP = 0.95

/** A pool of one shape, drawn many times with its own colour each. */
class Pool {
  readonly mesh: InstancedMesh
  private cursor = 0
  private tint = new Color()

  constructor(scene: Scene, geometry: BufferGeometry, max: number) {
    // No vertexColors here. instanceColor alone defines USE_INSTANCING_COLOR;
    // adding USE_COLOR makes the shader read a colour attribute the geometry
    // does not have, and every instance comes out black.
    const material: Material = new MeshLambertMaterial({ flatShading: true })
    this.mesh = new InstancedMesh(geometry, material, max)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    scene.add(this.mesh)
  }

  reset(): void {
    this.cursor = 0
  }

  add(proxy: Object3D, color: string | undefined): void {
    if (this.cursor >= this.mesh.instanceMatrix.count) return
    proxy.updateMatrix()
    this.mesh.setMatrixAt(this.cursor, proxy.matrix)
    this.mesh.setColorAt(this.cursor, this.tint.set(color ?? '#ffffff'))
    this.cursor++
  }

  finish(): void {
    this.mesh.count = this.cursor
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}

export class RoadView {
  private boxes: Pool
  private rods: Pool
  private proxy = new Object3D()

  constructor(scene: Scene) {
    this.boxes = new Pool(scene, new BoxGeometry(1, 1, 1), MAX_BOXES)
    // A rod lies along its own length once the proxy turns it a quarter turn.
    this.rods = new Pool(scene, new CylinderGeometry(1, 1, 1, 10), MAX_RODS)
  }

  update(segments: Segment[], camLeft: number): void {
    const right = camLeft + VIEW_WIDTH
    this.boxes.reset()
    this.rods.reset()

    for (const segment of segments) {
      if (segment.x1 < camLeft - 14 || segment.x0 > right + 14) continue

      const run = segment.x1 - segment.x0
      const rise = segment.y1 - segment.y0
      const length = Math.hypot(run, rise)
      const angle = Math.atan2(rise, run)
      const cx = (segment.x0 + segment.x1) / 2
      const cy = (segment.y0 + segment.y1) / 2
      // Perpendicular pointing into the surface, so offsets follow the slope.
      const nx = Math.sin(angle)
      const ny = -Math.cos(angle)

      if (segment.kind === 'rail') {
        this.rod(cx + nx * RAIL_RADIUS, cy + ny * RAIL_RADIUS, 0, length, RAIL_RADIUS, angle, SURFACE_COLOR.rail)
        this.railPosts(segment, segments, camLeft, right)
        continue
      }

      const depth = THICKNESS[segment.kind]
      this.box(
        cx + nx * (depth / 2),
        cy + ny * (depth / 2),
        0,
        length,
        depth,
        BREADTH[segment.kind],
        SURFACE_COLOR[segment.kind],
        angle,
      )
    }

    this.boxes.finish()
    this.rods.finish()
  }

  /** Uprights holding the handrail up, following its pitch. */
  private railPosts(segment: Segment, all: Segment[], camLeft: number, right: number): void {
    const first = Math.ceil((segment.x0 + 0.5) / RAIL_POST_SPACING) * RAIL_POST_SPACING
    for (let x = first; x < segment.x1 - 0.5; x += RAIL_POST_SPACING) {
      if (x < camLeft - 14 || x > right + 14) continue
      const top = surfaceYAt(segment, x)
      // A post reaches the ground under it. A fixed length leaves rails hanging
      // in the air wherever the pavement drops away, such as over a stair set.
      const foot = this.floorUnder(all, x, top)
      const drop = Math.max(0.2, top - foot)
      this.rod(x, top - drop / 2, 0, drop, 0.045, Math.PI / 2, POST_COLOR.rail)
    }
  }

  private floorUnder(all: Segment[], x: number, below: number): number {
    let best = below - RAIL_POST_DROP
    for (const segment of all) {
      if (!segment.floor) continue
      if (x < segment.x0 || x > segment.x1) continue
      const top = surfaceYAt(segment, x)
      if (top <= below && top > best) best = top
    }
    return best
  }

  private box(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    breadth: number,
    color: string | undefined,
    rotation = 0,
  ): void {
    this.proxy.position.set(x, y, z)
    this.proxy.scale.set(width, height, breadth)
    this.proxy.rotation.set(0, 0, rotation)
    this.boxes.add(this.proxy, color)
  }

  /** A round bar. `rotation` is the angle its length makes with the x axis. */
  private rod(
    x: number,
    y: number,
    z: number,
    length: number,
    radius: number,
    rotation: number,
    color: string | undefined,
  ): void {
    this.proxy.position.set(x, y, z)
    this.proxy.scale.set(radius, length, radius)
    this.proxy.rotation.set(0, 0, rotation - Math.PI / 2)
    this.rods.add(this.proxy, color)
  }
}
