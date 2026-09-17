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
import { VIEW_WIDTH, WORLD_FLOOR } from '../game/constants'
import { surfaceYAt, type Segment, type SurfaceKind } from '../game/road'
import type { Path } from './path'
import { CONTACT, EDGE_COLOR, KERB, PAVING, POST_COLOR, SURFACE_COLOR, WALL } from './palette'

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

const BREADTH: Record<SurfaceKind, number> = {
  flat: 11,
  step: 11,
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
    this.boxes = new Pool(scene, new BoxGeometry(1, 1, 1), MAX_BOXES)
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

      this.slab(segment, THICKNESS[segment.kind], BREADTH[segment.kind], SURFACE_COLOR[segment.kind])

      if (segment.kind === 'ledge' || segment.kind === 'hubba') {
        // A lit cap on the edge you are aiming at, and a contact line at the
        // foot so the block reads as standing on the pavement.
        const half = BREADTH[segment.kind] / 2
        this.strip(segment, 0, 0.02, BREADTH[segment.kind] + 0.26, EDGE_COLOR[segment.kind]!, 0.12)
        this.strip(segment, -half - 0.1, -THICKNESS[segment.kind] + 0.03, 0.26, CONTACT, 0.06)
        this.strip(segment, half + 0.1, -THICKNESS[segment.kind] + 0.03, 0.26, CONTACT, 0.06)
      } else if (segment.kind === 'flat') {
        this.paving(segment, camLeft, right)
        // The lip along each edge, and the wall it stands on. A slab with no
        // edge and nothing under it reads as floating.
        const edge = BREADTH.flat / 2 - 0.2
        this.strip(segment, -edge, 0.16, 0.42, KERB)
        this.strip(segment, edge, 0.16, 0.42, KERB)
        const wall = Math.max(1, surfaceYAt(segment, segment.x0) - WORLD_FLOOR)
        this.strip(segment, -edge - 0.14, -wall / 2, 0.5, WALL, wall)
        this.strip(segment, edge + 0.14, -wall / 2, 0.5, WALL, wall)
      } else if (segment.kind === 'step') {
        this.strip(segment, 0, 0.015, BREADTH.step, EDGE_COLOR.step!, 0.05)
      }
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
        0,
        length,
        depth,
        breadth,
        color,
        slope,
      )
    }
  }

  /** A run of something narrow along one edge of a surface, piece by piece. */
  private strip(
    segment: Segment,
    lateral: number,
    lift: number,
    breadth: number,
    color: string,
    height = 0.3,
  ): void {
    const span = segment.x1 - segment.x0
    const pieces = Math.max(1, Math.ceil(span / PIECE))
    const step = span / pieces
    const slope = Math.atan2(segment.y1 - segment.y0, span)

    for (let i = 0; i < pieces; i++) {
      const s = segment.x0 + step * (i + 0.5)
      const spread = 1 + Math.abs(this.path.curvatureAt(s)) * Math.abs(lateral)
      const length = (step / Math.cos(slope)) * OVERLAP * spread
      this.place(
        this.boxes,
        s,
        surfaceYAt(segment, s) + lift,
        lateral,
        length,
        height,
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
      this.rod(s, surfaceYAt(segment, s) - radius, 0, length, radius, slope, color)
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
      const foot = this.floorUnder(all, x, top)
      const drop = Math.max(0.2, top - foot)
      this.rod(x, top - drop / 2, 0, drop, 0.045, Math.PI / 2, POST_COLOR.rail)
    }
  }

  /** Slab joints across the pavement. They give the eye something to clock. */
  private paving(segment: Segment, camLeft: number, right: number): void {
    const spacing = 3.6
    const first = Math.ceil(segment.x0 / spacing) * spacing
    for (let x = first; x < segment.x1; x += spacing) {
      if (x < camLeft - 16 || x > right + 16) continue
      this.place(this.boxes, x, surfaceYAt(segment, x) + 0.005, 0, 0.07, 0.02, BREADTH.flat, PAVING)
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
