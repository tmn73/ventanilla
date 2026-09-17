import {
  CircleGeometry,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
} from 'three'
import { VIEW_WIDTH } from '../game/constants'
import { surfaceYAt, type Obstacle, type Segment, type SurfaceKind } from '../game/road'
import {
  EDGE_COLOR,
  FROND,
  JOINT,
  LAMP_GLOW,
  POST_COLOR,
  PROP_BODY,
  SIGN_FACE,
  SURFACE_COLOR,
  WHEEL_COLOR,
} from './palette'

const MAX_SLABS = 500
const MAX_POSTS = 700
const MAX_WHEELS = 40
const MAX_PROPS = 220
const EDGE_HEIGHT = 0.24

/** How far each surface hangs below its ridable top edge. */
const THICKNESS: Record<SurfaceKind, number> = {
  rail: 0.3,
  wall: 1.8,
  wire: 0.1,
  vehicle: 1.5,
}

const DEPTH: Record<SurfaceKind, number> = {
  wall: -1,
  rail: 0,
  vehicle: 0.3,
  wire: 0.6,
}

interface PostSpec {
  spacing: number
  width: number
  color: string
  foot: number
  crossarm: number
}

const POSTS: Partial<Record<SurfaceKind, PostSpec>> = {
  rail: { spacing: 3.2, width: 0.2, color: POST_COLOR.rail!, foot: 0, crossarm: 0 },
  wire: { spacing: 21, width: 0.26, color: POST_COLOR.wire!, foot: 0, crossarm: 2.2 },
}

function slabMesh(scene: Scene, max: number): InstancedMesh {
  const mesh = new InstancedMesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({ vertexColors: true }),
    max,
  )
  mesh.frustumCulled = false
  scene.add(mesh)
  return mesh
}

export class RoadView {
  private bodies: InstancedMesh
  private edges: InstancedMesh
  private posts: InstancedMesh
  private wheels: InstancedMesh
  private props: InstancedMesh
  private proxy = new Object3D()
  private tint = new Color()

  constructor(scene: Scene) {
    this.bodies = slabMesh(scene, MAX_SLABS)
    this.edges = slabMesh(scene, MAX_SLABS)
    this.posts = slabMesh(scene, MAX_POSTS)
    this.props = slabMesh(scene, MAX_PROPS)
    this.wheels = new InstancedMesh(
      new CircleGeometry(0.5, 12),
      new MeshBasicMaterial({ color: WHEEL_COLOR }),
      MAX_WHEELS,
    )
    this.wheels.frustumCulled = false
    scene.add(this.wheels)
  }

  update(segments: Segment[], obstacles: Obstacle[], camLeft: number): void {
    const right = camLeft + VIEW_WIDTH
    let slabs = 0
    let posts = 0
    let wheels = 0

    for (const segment of segments) {
      if (segment.x1 < camLeft - 4 || segment.x0 > right + 4) continue
      if (slabs + 2 > MAX_SLABS) break

      const run = segment.x1 - segment.x0
      const rise = segment.y1 - segment.y0
      const length = Math.hypot(run, rise)
      const angle = Math.atan2(rise, run)
      const cx = (segment.x0 + segment.x1) / 2
      const cy = (segment.y0 + segment.y1) / 2
      // Perpendicular pointing into the surface, so offsets follow the slope.
      const nx = Math.sin(angle)
      const ny = -Math.cos(angle)
      const depth = THICKNESS[segment.kind]
      const z = DEPTH[segment.kind]

      const along = (offset: number, w: number, h: number, color: string | undefined, dz = 0) => {
        this.place(this.bodies, slabs, cx + nx * offset, cy + ny * offset, z + dz, w, h, color, angle)
      }
      const lit = (offset: number, w: number, h: number, color: string | undefined, dz = 0) => {
        this.place(this.edges, slabs, cx + nx * offset, cy + ny * offset, z + dz, w, h, color, angle)
      }

      along(depth / 2, length, depth, SURFACE_COLOR[segment.kind])
      lit(EDGE_HEIGHT / 2, length, EDGE_HEIGHT, EDGE_COLOR[segment.kind], 0.05)
      slabs++

      if (segment.kind === 'rail') {
        // The lower rib of a W beam, which is what makes a guardrail a guardrail.
        along(0.62, length, 0.2, SURFACE_COLOR.rail, -0.05)
        lit(0.62, length, 0.07, EDGE_COLOR.rail)
        slabs++
      } else if (segment.kind === 'wall') {
        // A coping that overhangs, the way a real parapet does.
        along(0.13, length + 0.5, 0.26, SURFACE_COLOR.wall, 0.02)
        lit(0, length + 0.5, EDGE_HEIGHT, EDGE_COLOR.wall, 0.06)
        slabs++
        posts = this.addJoints(segment, camLeft, right, posts, angle, nx, ny)
      } else if (segment.kind === 'wire') {
        // A second cable running below the first.
        along(0.55, length, 0.08, EDGE_COLOR.wire)
        lit(0.55, length, 0.05, EDGE_COLOR.wire)
        slabs++
      }

      const spec = POSTS[segment.kind]
      if (spec) posts = this.addPosts(segment, spec, camLeft, right, posts)
      if (segment.kind === 'vehicle') wheels = this.addWheels(segment, wheels)
    }

    this.finish(this.props, this.drawObstacles(obstacles, camLeft, right))
    this.finish(this.bodies, slabs)
    this.finish(this.edges, slabs)
    this.finish(this.posts, posts)
    this.wheels.count = wheels
    this.wheels.instanceMatrix.needsUpdate = true
  }

  private addPosts(
    segment: Segment,
    spec: PostSpec,
    camLeft: number,
    right: number,
    cursor: number,
  ): number {
    const first = Math.ceil((segment.x0 + 0.6) / spec.spacing) * spec.spacing
    for (let x = first; x < segment.x1 - 0.6; x += spec.spacing) {
      if (cursor >= MAX_POSTS) break
      if (x < camLeft - 2 || x > right + 2) continue
      const top = surfaceYAt(segment, x)
      const height = top - spec.foot
      if (height <= 0.1) continue
      this.place(this.posts, cursor++, x, spec.foot + height / 2, -1.5, spec.width, height, spec.color)
      if (spec.crossarm > 0 && cursor < MAX_POSTS) {
        this.place(this.posts, cursor++, x, top + 0.5, -1.5, spec.crossarm, spec.width, spec.color)
      }
    }
    return cursor
  }

  /** Seams down the face of a parapet. Masonry, not a rectangle. */
  private addJoints(
    segment: Segment,
    camLeft: number,
    right: number,
    cursor: number,
    angle: number,
    nx: number,
    ny: number,
  ): number {
    const spacing = 2.4
    const first = Math.ceil((segment.x0 + 0.8) / spacing) * spacing
    for (let x = first; x < segment.x1 - 0.8; x += spacing) {
      if (cursor >= MAX_POSTS) break
      if (x < camLeft - 2 || x > right + 2) continue
      const top = surfaceYAt(segment, x)
      this.place(this.posts, cursor++, x + nx * 0.95, top + ny * 0.95, -0.5, 0.06, 1.4, JOINT, angle)
    }
    return cursor
  }

  /**
   * Each hazard gets a real silhouette. A lamp head on a curved arm, a
   * reflective sign face, a crown of fronds. The shape says "you will hit
   * this", not the hue.
   */
  private drawObstacles(obstacles: Obstacle[], camLeft: number, right: number): number {
    let cursor = 0
    for (const item of obstacles) {
      if (item.x < camLeft - 4 || item.x > right + 4) continue
      if (cursor + 8 > MAX_PROPS) break
      const top = item.base + item.height

      if (item.kind === 'post') {
        this.place(this.props, cursor++, item.x, item.base + item.height / 2, 0.5, 0.16, item.height, PROP_BODY)
        this.place(this.props, cursor++, item.x - 0.22, top + 0.12, 0.5, 0.62, 0.13, PROP_BODY, -0.5)
        this.place(this.props, cursor++, item.x - 0.55, top + 0.3, 0.5, 0.42, 0.12, PROP_BODY, -0.12)
        this.place(this.props, cursor++, item.x - 0.72, top + 0.24, 0.55, 0.36, 0.17, LAMP_GLOW)
      } else if (item.kind === 'sign') {
        this.place(this.props, cursor++, item.x, item.base + item.height / 2, 0.5, 0.11, item.height, PROP_BODY)
        this.place(this.props, cursor++, item.x, top - 0.52, 0.55, 1.12, 0.92, SIGN_FACE)
        this.place(this.props, cursor++, item.x, top - 0.52, 0.58, 0.88, 0.68, PROP_BODY)
      } else {
        this.place(this.props, cursor++, item.x, item.base + item.height / 2, 0.5, 0.2, item.height, PROP_BODY, 0.05)
        for (const angle of [2.5, 2.0, 1.571, 1.15, 0.65]) {
          if (cursor >= MAX_PROPS) break
          const reach = 0.72
          this.place(
            this.props,
            cursor++,
            item.x + Math.cos(angle) * reach * 0.5,
            top + Math.sin(angle) * reach * 0.34,
            0.55,
            reach * 1.5,
            0.12,
            FROND,
            angle - Math.PI / 2 + (angle > 1.571 ? 0.5 : -0.5),
          )
        }
      }
    }
    return cursor
  }

  private addWheels(segment: Segment, cursor: number): number {
    const width = segment.x1 - segment.x0
    const bottom = segment.y0 - THICKNESS.vehicle
    for (const fraction of [0.18, 0.8]) {
      if (cursor >= MAX_WHEELS) break
      this.proxy.position.set(segment.x0 + width * fraction, bottom + 0.16, 0.4)
      this.proxy.scale.set(0.9, 0.9, 1)
      this.proxy.rotation.z = 0
      this.proxy.updateMatrix()
      this.wheels.setMatrixAt(cursor++, this.proxy.matrix)
    }
    return cursor
  }

  private place(
    mesh: InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    color: string | undefined,
    rotation = 0,
  ): void {
    this.proxy.position.set(x, y, z)
    this.proxy.scale.set(width, height, 1)
    this.proxy.rotation.z = rotation
    this.proxy.updateMatrix()
    this.proxy.rotation.z = 0
    mesh.setMatrixAt(index, this.proxy.matrix)
    mesh.setColorAt(index, this.tint.set(color ?? '#000000'))
  }

  private finish(mesh: InstancedMesh, count: number): void {
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
}
