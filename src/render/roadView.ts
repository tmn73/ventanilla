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
import type { Obstacle, Segment, SurfaceKind } from '../game/road'
import { EDGE_COLOR, FROND, LAMP_GLOW, POST_COLOR, PROP_BODY, SIGN_FACE, SURFACE_COLOR, WHEEL_COLOR } from './palette'

const MAX_SLABS = 400
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
  private props: InstancedMesh
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
    this.props = slabMesh(scene, MAX_PROPS)
  }

  update(segments: Segment[], obstacles: Obstacle[], camLeft: number, pulse: number): void {
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

      if (segment.kind === 'rail' && slabs < MAX_SLABS) {
        // The lower rib of a W beam, which is what makes a guardrail a guardrail.
        this.place(this.bodies, slabs, centre, segment.y - 0.62, z - 0.05, width, 0.2, SURFACE_COLOR.rail)
        this.place(this.edges, slabs, centre, segment.y - 0.62, z, width, 0.07, EDGE_COLOR.rail)
        slabs++
      }
      if (segment.kind === 'wall' && slabs < MAX_SLABS) {
        // A coping that overhangs, the way a real parapet does.
        this.place(this.bodies, slabs, centre, segment.y - 0.13, z + 0.02, width + 0.5, 0.26, SURFACE_COLOR.wall)
        this.place(this.edges, slabs, centre, segment.y, z + 0.06, width + 0.5, EDGE_HEIGHT, EDGE_COLOR.wall)
        slabs++
      }
      if (segment.kind === 'wire' && slabs < MAX_SLABS) {
        // A second cable running below the first.
        this.place(this.bodies, slabs, centre, segment.y - 0.55, z, width, 0.08, EDGE_COLOR.wire)
        this.place(this.edges, slabs, centre, segment.y - 0.55, z, width, 0.05, EDGE_COLOR.wire)
        slabs++
      }

      const spec = POSTS[segment.kind]
      if (spec) posts = this.addPosts(segment, spec, camLeft, right, posts)
      if (segment.kind === 'vehicle') wheels = this.addWheels(segment, wheels)
    }

    this.finish(this.props, this.drawObstacles(obstacles, camLeft, right, pulse))
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

  /**
   * Each hazard gets a real silhouette. A lit lamp head, a reflective sign
   * face, a crown of fronds. The shape says "you will hit this", not the hue.
   */
  private drawObstacles(obstacles: Obstacle[], camLeft: number, right: number, pulse: number): number {
    let cursor = 0
    for (const item of obstacles) {
      if (item.x < camLeft - 4 || item.x > right + 4) continue
      if (cursor + 8 > MAX_PROPS) break
      const top = item.base + item.height

      if (item.kind === 'post') {
        // Street lamp: a pole, an arm curving over the road, and a lit head.
        this.place(this.props, cursor++, item.x, item.base + item.height / 2, 0.5, 0.16, item.height, PROP_BODY)
        this.place(this.props, cursor++, item.x - 0.22, top + 0.12, 0.5, 0.62, 0.13, PROP_BODY, -0.5)
        this.place(this.props, cursor++, item.x - 0.55, top + 0.3, 0.5, 0.42, 0.12, PROP_BODY, -0.12)
        this.place(this.props, cursor++, item.x - 0.72, top + 0.24, 0.55, 0.36, 0.17, LAMP_GLOW)
      } else if (item.kind === 'sign') {
        // Road sign: a thin pole and a retroreflective face that catches light.
        this.place(this.props, cursor++, item.x, item.base + item.height / 2, 0.5, 0.11, item.height, PROP_BODY)
        this.place(this.props, cursor++, item.x, top - 0.52, 0.55, 1.12, 0.92, SIGN_FACE)
        this.place(this.props, cursor++, item.x, top - 0.52, 0.58, 0.88, 0.68, PROP_BODY)
      } else {
        // Palm: a leaning trunk under a crown of drooping fronds.
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
    void pulse
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
