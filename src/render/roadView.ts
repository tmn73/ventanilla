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
import type { Path } from './path'
import type { PropName, Props } from './props'
import {
  BENCH,
  BENCH_LEG,
  KERB,
  PAVING,
  POST_COLOR,
  WALL,
  SURFACE_COLOR,
  UMBRELLA,
  UMBRELLA_POLE,
} from './palette'

const MAX_BOXES = 2600
const MAX_RODS = 700
const MAX_CONES = 120

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

export class RoadView {
  private boxes: Pool
  private rods: Pool
  private cones: Pool
  private proxy = new Object3D()
  private point = { x: 0, z: 0 }

  constructor(
    scene: Scene,
    private path: Path,
    private props: Props,
  ) {
    this.boxes = new Pool(scene, new BoxGeometry(1, 1, 1), MAX_BOXES)
    // A rod lies along its own length once the proxy turns it a quarter turn.
    this.rods = new Pool(scene, new CylinderGeometry(1, 1, 1, 10), MAX_RODS)
    this.cones = new Pool(scene, new CylinderGeometry(0.04, 1, 1, 10), MAX_CONES)
  }

  update(segments: Segment[], camLeft: number): void {
    const right = camLeft + VIEW_WIDTH
    this.boxes.reset()
    this.rods.reset()
    this.cones.reset()
    this.props.reset()

    for (const segment of segments) {
      if (segment.x1 < camLeft - 16 || segment.x0 > right + 16) continue

      if (segment.kind === 'rail') {
        this.railAlong(segment, RAIL_RADIUS, SURFACE_COLOR.rail)
        this.railPosts(segment, segments, camLeft, right)
        continue
      }

      this.slab(segment, THICKNESS[segment.kind], BREADTH[segment.kind], SURFACE_COLOR[segment.kind])
      if (segment.kind === 'flat') {
        this.paving(segment, camLeft, right)
        // The lip along each edge, and the wall it stands on. A slab with no
        // edge and nothing under it reads as floating.
        const edge = BREADTH.flat / 2 - 0.2
        this.strip(segment, -edge, 0.16, 0.42, KERB)
        this.strip(segment, edge, 0.16, 0.42, KERB)
        this.strip(segment, -edge - 0.14, -0.85, 0.5, WALL, 1.5)
        this.strip(segment, edge + 0.14, -0.85, 0.5, WALL, 1.5)
      }
    }

    this.decorate(segments, camLeft, right)
    this.beach(segments, camLeft, right)
    this.boxes.finish()
    this.rods.finish()
    this.cones.finish()
    this.props.finish()
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
      // actually needs, and nudge every other piece so the overlap cannot
      // fight for the same depth.
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

  /** Uprights holding the handrail up, following its pitch. */
  private railPosts(segment: Segment, all: Segment[], camLeft: number, right: number): void {
    const stops: number[] = [segment.x0 + 0.18, segment.x1 - 0.18]
    const first = Math.ceil((segment.x0 + 0.5) / RAIL_POST_SPACING) * RAIL_POST_SPACING
    for (let x = first; x < segment.x1 - 0.5; x += RAIL_POST_SPACING) stops.push(x)

    for (const x of stops) {
      if (x < camLeft - 16 || x > right + 16) continue
      const top = surfaceYAt(segment, x)
      // A post reaches the ground under it. A fixed length leaves rails hanging
      // in the air wherever the pavement drops away, such as over a stair set.
      const foot = this.floorUnder(all, x, top)
      const drop = Math.max(0.2, top - foot)
      this.rod(x, top - drop / 2, 0, drop, 0.045, Math.PI / 2, POST_COLOR.rail)
    }
  }

  /** Slab joints across the plaza. They also give the eye something to clock. */
  private paving(segment: Segment, camLeft: number, right: number): void {
    const spacing = 3.6
    const first = Math.ceil(segment.x0 / spacing) * spacing
    for (let x = first; x < segment.x1; x += spacing) {
      if (x < camLeft - 16 || x > right + 16) continue
      this.place(this.boxes, x, surfaceYAt(segment, x) + 0.005, 0, 0.07, 0.02, BREADTH.flat, PAVING)
    }
  }

  /**
   * Palms, benches and parasols along the back of the plaza. None of it is in
   * the skate plane, so none of it can be hit. It is here because a promenade
   * made only of concrete and sand is one colour.
   */
  private decorate(all: Segment[], camLeft: number, right: number): void {
    const spacing = 8.2
    const first = Math.ceil((camLeft - 14) / spacing) * spacing
    for (let x = first; x < right + 14; x += spacing) {
      const shape = Math.abs(Math.sin(x * 7.311) * 21374.9) % 1
      if (shape < 0.22) continue
      const jitter = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1
      const ground = this.floorHeight(all, x)
      if (ground === null) continue

      const s = x + jitter * 2.4
      const lateral = -5.2 - jitter * 1.6

      if (shape < 0.58) {
        // A planter ring, so the trunk grows out of something.
        this.place(this.boxes, s, ground + 0.11, lateral, 1.5, 0.22, 1.5, KERB)
        const kind: PropName = jitter < 0.36 ? 'palmTall' : jitter < 0.72 ? 'palmShort' : 'palmBend'
        this.prop(kind, s, ground + 0.2, lateral, jitter * 6.3)
      } else if (shape < 0.82) {
        this.place(this.boxes, s, ground + 0.04, lateral, 2.1, 0.08, 0.78, BENCH_LEG)
        this.place(this.boxes, s, ground + 0.46, lateral, 1.9, 0.12, 0.55, BENCH)
        this.place(this.boxes, s, ground + 0.72, lateral - 0.22, 1.9, 0.42, 0.1, BENCH)
        this.place(this.boxes, s - 0.75, ground + 0.25, lateral, 0.11, 0.46, 0.5, BENCH_LEG)
        this.place(this.boxes, s + 0.75, ground + 0.25, lateral, 0.11, 0.46, 0.5, BENCH_LEG)
        // Rocks and grass out on the sand, where the promenade stops.
        this.prop('rockSmall', s + 2.4, ground - 1.3, -9 - jitter * 3.5, jitter * 6.3)
      } else {
        const height = 2.5
        const shade = UMBRELLA[Math.floor(jitter * UMBRELLA.length) % UMBRELLA.length]
        this.place(this.boxes, s, ground + 0.05, lateral, 0.6, 0.1, 0.6, WALL)
        this.rod(s, ground + height / 2, lateral, height, 0.045, Math.PI / 2, UMBRELLA_POLE)
        this.cone(s, ground + height + 0.22, lateral, 0.62, 2.1, shade)
      }
    }
  }

  /** Places a loaded model at a point on the road, turned with it. */
  private prop(name: PropName, s: number, y: number, lateral: number, spin = 0): void {
    this.path.place(s, lateral, this.point)
    this.props.place(name, this.point.x, y, this.point.z, this.path.headingAt(s), spin)
  }

  /** Loose ground cover on the sand, so the beach is not a flat expanse. */
  private beach(all: Segment[], camLeft: number, right: number): void {
    const spacing = 5.6
    const first = Math.ceil((camLeft - 10) / spacing) * spacing
    for (let x = first; x < right + 10; x += spacing) {
      const pick = Math.abs(Math.sin(x * 4.117) * 12983.4) % 1
      if (pick < 0.4) continue
      const jitter = Math.abs(Math.sin(x * 9.731) * 33471.2) % 1
      const ground = this.floorHeight(all, x)
      if (ground === null) continue
      const name: PropName = pick < 0.62 ? 'grass' : pick < 0.84 ? 'rockSmall' : 'rockLarge'
      const side = jitter < 0.55 ? -8.5 - jitter * 5 : 8 + jitter * 9
      this.prop(name, x + jitter * 3, ground - 1.3, side, jitter * 6.3)
    }
  }

  /** Height of the pavement at a point, or null where there is none. */
  private floorHeight(all: Segment[], x: number): number | null {
    let best: number | null = null
    for (const segment of all) {
      if (!segment.floor) continue
      if (x < segment.x0 || x > segment.x1) continue
      const top = surfaceYAt(segment, x)
      if (best === null || top > best) best = top
    }
    return best
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

  /** A canopy: wide at the bottom, closed at the top. */
  private cone(s: number, y: number, lateral: number, height: number, width: number, color: string): void {
    this.path.place(s, lateral, this.point)
    this.proxy.position.set(this.point.x, y, this.point.z)
    this.proxy.scale.set(width / 2, height, width / 2)
    this.proxy.rotation.set(Math.PI, -this.path.headingAt(s), 0)
    this.cones.add(this.proxy, color)
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
