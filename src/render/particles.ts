import { Color, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, Scene } from 'three'

const POOL = 260

interface Grain {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  span: number
  size: number
  color: Color
}

/**
 * Sparks and dust. This is the only thing that tells the player which surface
 * pays and which one drags, so it carries the rule instead of a caption.
 */
export class Particles {
  private mesh: InstancedMesh
  private grains: Grain[] = []
  private proxy = new Object3D()
  private cursor = 0
  private debt = 0

  constructor(scene: Scene) {
    this.mesh = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ transparent: true, opacity: 0.95 }),
      POOL,
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 8
    scene.add(this.mesh)

    for (let i = 0; i < POOL; i++) {
      this.grains.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, span: 1, size: 0.1, color: new Color() })
    }
  }

  clear(): void {
    for (const grain of this.grains) grain.life = 0
    this.debt = 0
  }

  /**
   * @param rate grains per second, which is how hard the surface is working
   * @param drag true for the dirt verge, which throws slow dust instead of sparks
   */
  emit(dt: number, x: number, y: number, rate: number, drag: boolean, tint: string): void {
    this.debt += rate * dt
    while (this.debt >= 1) {
      this.debt -= 1
      const grain = this.grains[this.cursor]!
      this.cursor = (this.cursor + 1) % POOL

      grain.x = x + (Math.random() - 0.5) * 0.4
      grain.y = y + 0.04
      grain.color.set(tint)

      if (drag) {
        grain.vx = -1.6 - Math.random() * 2.2
        grain.vy = 0.5 + Math.random() * 1.4
        grain.span = 0.75 + Math.random() * 0.5
        grain.size = 0.22 + Math.random() * 0.3
      } else {
        grain.vx = -5 - Math.random() * 9
        grain.vy = 0.6 + Math.random() * 4.5
        grain.span = 0.22 + Math.random() * 0.26
        grain.size = 0.07 + Math.random() * 0.1
      }
      grain.life = grain.span
    }
  }

  update(dt: number): void {
    let drawn = 0
    for (const grain of this.grains) {
      if (grain.life <= 0) continue
      grain.life -= dt
      if (grain.life <= 0) continue

      grain.x += grain.vx * dt
      grain.y += grain.vy * dt
      grain.vy -= 14 * dt
      grain.vx *= 1 - 1.4 * dt

      const fade = grain.life / grain.span
      const size = grain.size * (0.4 + fade * 0.6)
      this.proxy.position.set(grain.x, grain.y, 0.9)
      this.proxy.scale.set(size, size, 1)
      this.proxy.updateMatrix()
      this.mesh.setMatrixAt(drawn, this.proxy.matrix)
      this.mesh.setColorAt(drawn, grain.color.clone().multiplyScalar(0.35 + fade * 0.65))
      drawn++
    }

    this.mesh.count = drawn
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}
