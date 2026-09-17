import { Color, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, Scene } from 'three'
import { VIEW_WIDTH } from '../game/constants'
import { surfaceYAt, type Obstacle, type Segment, type SurfaceKind } from '../game/road'
import {
  BIN,
  BIN_LID,
  EDGE_COLOR,
  FROND,
  HYDRANT,
  HYDRANT_CAP,
  JOINT,
  LAMP_GLOW,
  POST_COLOR,
  PROP_BODY,
  SIGN_FACE,
  SURFACE_COLOR,
} from './palette'

const MAX_SLABS = 500
const MAX_POSTS = 700
const MAX_PROPS = 220
const EDGE_HEIGHT = 0.24

/** How far each surface hangs below its ridable top edge. */
const THICKNESS: Record<SurfaceKind, number> = {
  flat: 6,
  step: 0.34,
  ledge: 0.58,
  hubba: 0.62,
  rail: 0.11,
}

const DEPTH: Record<SurfaceKind, number> = {
  flat: -1.4,
  step: -1.2,
  ledge: -0.6,
  hubba: -0.55,
  rail: 0.4,
}

/** Uprights that hold a handrail up off the ground. */
const RAIL_POST_SPACING = 2.4
const RAIL_POST_WIDTH = 0.09
const RAIL_POST_DROP = 0.95

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
  private props: InstancedMesh
  private proxy = new Object3D()
  private tint = new Color()

  constructor(scene: Scene) {
    this.bodies = slabMesh(scene, MAX_SLABS)
    this.edges = slabMesh(scene, MAX_SLABS)
    this.posts = slabMesh(scene, MAX_POSTS)
    this.props = slabMesh(scene, MAX_PROPS)
  }

  update(segments: Segment[], obstacles: Obstacle[], camLeft: number): void {
    const right = camLeft + VIEW_WIDTH
    let slabs = 0
    let posts = 0

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

      if (segment.kind === 'ledge' || segment.kind === 'hubba') {
        // A lip that overhangs, the way a real block does.
        along(0.11, length + 0.36, 0.22, SURFACE_COLOR[segment.kind], 0.02)
        lit(0, length + 0.36, EDGE_HEIGHT, EDGE_COLOR[segment.kind], 0.06)
        slabs++
        posts = this.addJoints(segment, camLeft, right, posts, angle, nx, ny)
      } else if (segment.kind === 'step') {
        // The riser under each tread, so a set reads as stairs and not a slope.
        along(0.6, length, 1.0, SURFACE_COLOR.step, -0.03)
        slabs++
      } else if (segment.kind === 'rail') {
        posts = this.addRailPosts(segment, camLeft, right, posts)
      }
    }

    this.finish(this.props, this.drawObstacles(obstacles, camLeft, right))
    this.finish(this.bodies, slabs)
    this.finish(this.edges, slabs)
    this.finish(this.posts, posts)
  }

  /** Uprights holding the handrail up, following its pitch. */
  private addRailPosts(segment: Segment, camLeft: number, right: number, cursor: number): number {
    const first = Math.ceil((segment.x0 + 0.5) / RAIL_POST_SPACING) * RAIL_POST_SPACING
    for (let x = first; x < segment.x1 - 0.5; x += RAIL_POST_SPACING) {
      if (cursor >= MAX_POSTS) break
      if (x < camLeft - 2 || x > right + 2) continue
      const top = surfaceYAt(segment, x)
      this.place(
        this.posts,
        cursor++,
        x,
        top - RAIL_POST_DROP / 2,
        0.3,
        RAIL_POST_WIDTH,
        RAIL_POST_DROP,
        POST_COLOR.rail,
      )
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
      } else if (item.kind === 'hydrant') {
        // Squat body, domed cap, two side outlets. Nobody mistakes one.
        this.place(this.props, cursor++, item.x, item.base + item.height * 0.45, 0.5, 0.42, item.height * 0.9, HYDRANT)
        this.place(this.props, cursor++, item.x, top - 0.06, 0.55, 0.3, 0.2, HYDRANT_CAP)
        this.place(this.props, cursor++, item.x - 0.28, item.base + item.height * 0.5, 0.52, 0.2, 0.22, HYDRANT_CAP)
        this.place(this.props, cursor++, item.x + 0.28, item.base + item.height * 0.5, 0.52, 0.2, 0.22, HYDRANT_CAP)
      } else if (item.kind === 'bin') {
        this.place(this.props, cursor++, item.x, item.base + item.height / 2, 0.5, 0.78, item.height, BIN)
        this.place(this.props, cursor++, item.x, top + 0.06, 0.55, 0.92, 0.16, BIN_LID)
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
