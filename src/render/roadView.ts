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
import type { Segment, SurfaceKind } from '../game/road'
import { EDGE_COLOR, POST_COLOR, SURFACE_COLOR, WHEEL_COLOR } from './palette'

const MAX_SLABS = 400
const MAX_POSTS = 700
const MAX_WHEELS = 40
const EDGE_HEIGHT = 0.16

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

/** Uprights that turn a floating slab into a thing standing beside a road. */
interface PostSpec {
  spacing: number
  width: number
  color: string
  /** Drawn from the surface down to this height. */
  foot: number
  /** A bar across the top, as power pylons have. */
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
  private proxy = new Object3D()
  private tint = new Color()

  constructor(scene: Scene) {
    this.bodies = slabMesh(scene, MAX_SLABS)
    this.edges = slabMesh(scene, MAX_SLABS)
    this.posts = slabMesh(scene, MAX_POSTS)
    this.wheels = new InstancedMesh(
      new CircleGeometry(0.5, 12),
      new MeshBasicMaterial({ color: WHEEL_COLOR }),
      MAX_WHEELS,
    )
    this.wheels.frustumCulled = false
    scene.add(this.wheels)
  }

  update(segments: Segment[], camLeft: number): void {
    const right = camLeft + VIEW_WIDTH
    let slabs = 0
    let posts = 0
    let wheels = 0

    for (const segment of segments) {
      if (segment.x1 < camLeft - 4 || segment.x0 > right + 4) continue
      if (slabs >= MAX_SLABS) break

      const width = segment.x1 - segment.x0
      const centre = (segment.x0 + segment.x1) / 2
      const depth = THICKNESS[segment.kind]
      const z = DEPTH[segment.kind]

      this.place(this.bodies, slabs, centre, segment.y - depth / 2, z, width, depth, SURFACE_COLOR[segment.kind])
      this.place(this.edges, slabs, centre, segment.y - EDGE_HEIGHT / 2, z + 0.05, width, EDGE_HEIGHT, EDGE_COLOR[segment.kind])
      slabs++

      const spec = POSTS[segment.kind]
      if (spec) posts = this.addPosts(segment, spec, camLeft, right, posts)
      if (segment.kind === 'vehicle') wheels = this.addWheels(segment, wheels)
    }

    this.finish(this.bodies, slabs)
    this.finish(this.edges, slabs)
    this.finish(this.posts, posts)
    this.wheels.count = wheels
    this.wheels.instanceMatrix.needsUpdate = true
  }

  private addPosts(segment: Segment, spec: PostSpec, camLeft: number, right: number, cursor: number): number {
    const first = Math.ceil((segment.x0 + 0.6) / spec.spacing) * spec.spacing
    for (let x = first; x < segment.x1 - 0.6; x += spec.spacing) {
      if (cursor >= MAX_POSTS) break
      if (x < camLeft - 2 || x > right + 2) continue
      const height = segment.y - spec.foot
      this.place(this.posts, cursor++, x, spec.foot + height / 2, -1.5, spec.width, height, spec.color)
      if (spec.crossarm > 0 && cursor < MAX_POSTS) {
        this.place(this.posts, cursor++, x, segment.y + 0.5, -1.5, spec.crossarm, spec.width, spec.color)
      }
    }
    return cursor
  }

  private addWheels(segment: Segment, cursor: number): number {
    const width = segment.x1 - segment.x0
    const bottom = segment.y - THICKNESS.vehicle
    for (const fraction of [0.18, 0.8]) {
      if (cursor >= MAX_WHEELS) break
      this.proxy.position.set(segment.x0 + width * fraction, bottom + 0.16, 0.4)
      this.proxy.scale.set(0.9, 0.9, 1)
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
  ): void {
    this.proxy.position.set(x, y, z)
    this.proxy.scale.set(width, height, 1)
    this.proxy.updateMatrix()
    mesh.setMatrixAt(index, this.proxy.matrix)
    mesh.setColorAt(index, this.tint.set(color ?? '#000000'))
  }

  private finish(mesh: InstancedMesh, count: number): void {
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
}
