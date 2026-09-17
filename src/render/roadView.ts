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
  type Texture,
} from 'three'
import { VIEW_WIDTH, WORLD_FLOOR } from '../game/constants'
import { coversZ, ROAD_HALF, surfaceYAt, type Segment, type SurfaceKind } from '../game/road'
import type { Path } from './path'
import { makeConcrete } from './concrete'
import { POST_COLOR, SURFACE_COLOR } from './palette'

const MAX_BOXES = 1400
const MAX_RODS = 500

/** No piece of a surface is longer than this, so a corner never gets chorded. */
const PIECE = 3
/** Pieces overlap a little, which hides the wedge a bend leaves between them. */
const OVERLAP = 1.06

/** How far each surface hangs below its ridable top edge, and how wide it runs. */
const THICKNESS: Record<SurfaceKind, number> = {
  flat: 1.5,
  step: 1.0,
  ledge: 0.58,
  hubba: 0.62,
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

  constructor(scene: Scene, geometry: BufferGeometry, max: number, grain: Texture | null = null) {
    // No vertexColors here. instanceColor alone defines USE_INSTANCING_COLOR;
    // adding USE_COLOR makes the shader read a colour attribute the geometry
    // does not have, and every instance comes out black.
    const material: Material = new MeshLambertMaterial({ flatShading: true, map: grain })
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

/**
 * Only what the player rides. There is no decoration here on purpose: nothing
 * that is not part of the line can be got wrong, and the accent colour is
 * spent entirely on telling you what you can get on.
 */
export class RoadView {
  private boxes: Pool
  private rods: Pool
  private proxy = new Object3D()
  private point = { x: 0, z: 0 }

  constructor(
    scene: Scene,
    private path: Path,
  ) {
    this.boxes = new Pool(scene, new BoxGeometry(1, 1, 1), MAX_BOXES, makeConcrete())
    // A rod lies along its own length once the proxy turns it a quarter turn.
    this.rods = new Pool(scene, new CylinderGeometry(1, 1, 1, 10), MAX_RODS)
  }

  update(segments: Segment[], camLeft: number): void {
    const right = camLeft + VIEW_WIDTH
    this.boxes.reset()
    this.rods.reset()

    for (const segment of segments) {
      if (segment.x1 < camLeft - 16 || segment.x0 > right + 16) continue

      if (segment.kind === 'rail') {
        this.railAlong(segment, RAIL_RADIUS, SURFACE_COLOR.rail)
        this.railPosts(segment, segments, camLeft, right)
        continue
      }

      // The pavement is one solid mass from the surface down to the ground,
      // rather than a slab on legs. Nothing sits under it and nothing edges it.
      // The road itself is one solid mass down to the ground. A platform set
      // on top of it is a slab, not a second cliff, so it keeps a thickness.
      const narrow = segment.halfWidth < ROAD_HALF * 0.9
      const depth =
        segment.kind === 'flat' && !narrow
          ? Math.min(9, Math.max(1.2, surfaceYAt(segment, segment.x0) - WORLD_FLOOR))
          : segment.kind === 'flat'
            ? 1.1
            : THICKNESS[segment.kind]

      // Drawn exactly as wide as it carries. What you see is what holds you.
      this.slab(segment, depth, segment.halfWidth * 2, SURFACE_COLOR[segment.kind])
    }

    this.boxes.finish()
    this.rods.finish()
  }

  /** A surface, cut into pieces short enough to follow the bend under it. */
  private slab(segment: Segment, depth: number, breadth: number, color: string | undefined): void {
    const span = segment.x1 - segment.x0
    const pieces = Math.max(1, Math.ceil(span / PIECE))
    const step = span / pieces
    const slope = Math.atan2(segment.y1 - segment.y0, span)
    const nx = Math.sin(slope)
    const ny = -Math.cos(slope)

    for (let i = 0; i < pieces; i++) {
      const s = segment.x0 + step * (i + 0.5)
      const top = surfaceYAt(segment, s)
      // Round a corner the outer edge travels further than the centre, so a
      // plain rectangle leaves a wedge open. Stretch it by what the far edge
      // needs, and nudge every other piece so the overlap cannot fight for the
      // same depth.
      const spread = 1 + Math.abs(this.path.curvatureAt(s)) * (breadth / 2)
      const length = (step / Math.cos(slope)) * OVERLAP * spread
      this.place(
        this.boxes,
        s + nx * (depth / 2),
        top + ny * (depth / 2) + (i % 2) * 0.0015,
        segment.z,
        length,
        depth,
        breadth,
        color,
        slope,
      )
    }
  }

  private railAlong(segment: Segment, radius: number, color: string | undefined): void {
    const span = segment.x1 - segment.x0
    const pieces = Math.max(1, Math.ceil(span / PIECE))
    const step = span / pieces
    const slope = Math.atan2(segment.y1 - segment.y0, span)

    for (let i = 0; i < pieces; i++) {
      const s = segment.x0 + step * (i + 0.5)
      const length = (step / Math.cos(slope)) * OVERLAP
      this.rod(s, surfaceYAt(segment, s) - radius, segment.z, length, radius, slope, color)
    }
  }

  /** Uprights holding the handrail up, reaching whatever is under them. */
  private railPosts(segment: Segment, all: Segment[], camLeft: number, right: number): void {
    const stops: number[] = [segment.x0 + 0.18, segment.x1 - 0.18]
    const first = Math.ceil((segment.x0 + 0.5) / RAIL_POST_SPACING) * RAIL_POST_SPACING
    for (let x = first; x < segment.x1 - 0.5; x += RAIL_POST_SPACING) stops.push(x)

    for (const x of stops) {
      if (x < camLeft - 16 || x > right + 16) continue
      const top = surfaceYAt(segment, x)
      const foot = this.floorUnder(all, x, segment.z, top)
      const drop = Math.max(0.2, top - foot)
      this.rod(x, top - drop / 2, segment.z, drop, 0.045, Math.PI / 2, POST_COLOR.rail)
    }
  }

  private floorUnder(all: Segment[], x: number, z: number, below: number): number {
    let best = below - RAIL_POST_DROP
    for (const segment of all) {
      if (!segment.floor || !coversZ(segment, z)) continue
      if (x < segment.x0 || x > segment.x1) continue
      const top = surfaceYAt(segment, x)
      if (top <= below && top > best) best = top
    }
    return best
  }

  /** A round bar. `rotation` is the angle its length makes with the road. */
  private rod(
    s: number,
    y: number,
    lateral: number,
    length: number,
    radius: number,
    rotation: number,
    color: string | undefined,
  ): void {
    this.path.place(s, lateral, this.point)
    this.proxy.position.set(this.point.x, y, this.point.z)
    this.proxy.scale.set(radius, length, radius)
    this.proxy.rotation.set(0, -this.path.headingAt(s), rotation - Math.PI / 2)
    this.rods.add(this.proxy, color)
  }

  /**
   * Everything lands here. `s` is a distance along the road and `lateral` is
   * how far to the side of it, so a bend is applied in exactly one place.
   */
  private place(
    pool: Pool,
    s: number,
    y: number,
    lateral: number,
    width: number,
    height: number,
    breadth: number,
    color: string | undefined,
    slope = 0,
  ): void {
    this.path.place(s, lateral, this.point)
    this.proxy.position.set(this.point.x, y, this.point.z)
    this.proxy.scale.set(width, height, breadth)
    this.proxy.rotation.set(0, -this.path.headingAt(s), slope)
    pool.add(this.proxy, color)
  }
}
