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
import {
  BENCH,
  BENCH_LEG,
  PALM_CROWN_NEAR,
  PALM_TRUNK_NEAR,
  PAVING,
  POST_COLOR,
  SURFACE_COLOR,
  UMBRELLA,
  UMBRELLA_POLE,
} from './palette'

const MAX_BOXES = 900
const MAX_RODS = 500

/** How far each surface hangs below its ridable top edge, and how deep it runs. */
const THICKNESS: Record<SurfaceKind, number> = {
  flat: 2.4,
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

  constructor(scene: Scene) {
    this.boxes = new Pool(scene, new BoxGeometry(1, 1, 1), MAX_BOXES)
    // A rod lies along its own length once the proxy turns it a quarter turn.
    this.rods = new Pool(scene, new CylinderGeometry(1, 1, 1, 10), MAX_RODS)
    this.cones = new Pool(scene, new CylinderGeometry(0.04, 1, 1, 10), 120)
  }

  update(segments: Segment[], camLeft: number): void {
    const right = camLeft + VIEW_WIDTH
    this.boxes.reset()
    this.rods.reset()
    this.cones.reset()

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

      if (segment.kind === 'flat') this.paving(segment, camLeft, right, angle)
    }

    this.decorate(segments, camLeft, right)
    this.boxes.finish()
    this.rods.finish()
    this.cones.finish()
  }

  /** Uprights holding the handrail up, following its pitch. */
  /** Slab joints across the plaza. They also give the eye something to clock. */
  private paving(segment: Segment, camLeft: number, right: number, angle: number): void {
    const spacing = 3.6
    const first = Math.ceil(segment.x0 / spacing) * spacing
    for (let x = first; x < segment.x1; x += spacing) {
      if (x < camLeft - 14 || x > right + 14) continue
      this.box(x, surfaceYAt(segment, x) + 0.005, 0, 0.07, 0.02, BREADTH.flat, PAVING, angle)
    }
  }

  private railPosts(segment: Segment, all: Segment[], camLeft: number, right: number): void {
    const stops: number[] = [segment.x0 + 0.18, segment.x1 - 0.18]
    const first = Math.ceil((segment.x0 + 0.5) / RAIL_POST_SPACING) * RAIL_POST_SPACING
    for (let x = first; x < segment.x1 - 0.5; x += RAIL_POST_SPACING) stops.push(x)

    for (const x of stops) {
      if (x < camLeft - 14 || x > right + 14) continue
      const top = surfaceYAt(segment, x)
      // A post reaches the ground under it. A fixed length leaves rails hanging
      // in the air wherever the pavement drops away, such as over a stair set.
      const foot = this.floorUnder(all, x, top)
      const drop = Math.max(0.2, top - foot)
      this.rod(x, top - drop / 2, 0, drop, 0.045, Math.PI / 2, POST_COLOR.rail)
    }
  }

  /**
   * Palms, benches and parasols along the back of the plaza. None of it is in
   * the skate plane, so none of it can be hit. It is here because a promenade
   * made only of concrete and sand is one colour.
   */
  private decorate(all: Segment[], camLeft: number, right: number): void {
    const spacing = 8.2
    const first = Math.ceil((camLeft - 12) / spacing) * spacing
    for (let x = first; x < right + 12; x += spacing) {
      const shape = Math.abs(Math.sin(x * 7.311) * 21374.9) % 1
      if (shape < 0.22) continue
      const jitter = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1
      const ground = this.floorHeight(all, x)
      if (ground === null) continue

      const wx = x + jitter * 2.4
      const z = -5.4 - jitter * 1.8

      if (shape < 0.58) {
        const height = 4.2 + jitter * 2.6
        this.rod(wx, ground + height / 2, z, height, 0.13, Math.PI / 2 + (jitter - 0.5) * 0.12, PALM_TRUNK_NEAR)
        // Fronds radiate from the crown and droop, which is what makes the
        // shape a palm rather than a handful of sticks.
        for (const angle of [2.79, 2.36, 1.92, 1.571, 1.22, 0.79, 0.35]) {
          const reach = 1.55 + jitter * 0.4
          const dx = Math.cos(angle)
          const dy = Math.sin(angle) * 0.42 - 0.12
          const len = Math.hypot(dx, dy)
          this.box(
            wx + (dx / len) * reach * 0.5,
            ground + height + (dy / len) * reach * 0.5,
            z + dx * 0.55,
            reach,
            0.11,
            0.42,
            PALM_CROWN_NEAR,
            Math.atan2(dy, dx),
          )
        }
      } else if (shape < 0.82) {
        this.box(wx, ground + 0.46, z, 1.9, 0.12, 0.55, BENCH)
        this.box(wx, ground + 0.72, z - 0.22, 1.9, 0.42, 0.1, BENCH)
        this.box(wx - 0.75, ground + 0.23, z, 0.09, 0.46, 0.5, BENCH_LEG)
        this.box(wx + 0.75, ground + 0.23, z, 0.09, 0.46, 0.5, BENCH_LEG)
      } else {
        const height = 2.5
        const shade = UMBRELLA[Math.floor(jitter * UMBRELLA.length) % UMBRELLA.length]
        this.rod(wx, ground + height / 2, z, height, 0.045, Math.PI / 2, UMBRELLA_POLE)
        this.cone(wx, ground + height + 0.22, z, 0.62, 2.1, shade)
      }
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

  /** A canopy: wide at the bottom, closed at the top. */
  private cone(x: number, y: number, z: number, height: number, width: number, color: string): void {
    this.proxy.position.set(x, y, z)
    this.proxy.scale.set(width / 2, height, width / 2)
    this.proxy.rotation.set(Math.PI, 0, 0)
    this.cones.add(this.proxy, color)
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
