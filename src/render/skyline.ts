import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
} from 'three'
import type { Camera } from 'three'

/**
 * How tall each layer stands on the screen, as a share of the window, and how
 * much of the camera's travel it takes. The far one is paler and slower.
 */
const LAYERS = [
  { share: 0.46, drift: 0.05, shade: '#141d2c', windows: 0.1, sink: -0.05 },
  { share: 0.32, drift: 0.13, shade: '#080d16', windows: 0.17, sink: -0.03 },
]

/**
 * A city on the horizon, drawn into a canvas rather than built out of boxes.
 * It is two flat layers that slide at different speeds, which is the whole of
 * the depth: at this distance a skyline is a shape and some lit windows, and
 * anything more would be geometry nobody looks at.
 */
export class Skyline {
  private layers: Array<{ mesh: Mesh; drift: number; share: number; sink: number }> = []

  /**
   * Hung off the camera rather than placed in the world. This camera is
   * orthographic and tilted, so depth turns into height on the screen: a plane
   * put seventy metres back sat far above the top of the frame. As a child of
   * the camera it is simply where it is put, whatever the angle.
   */
  constructor(camera: Camera) {
    let seed = 20260917
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }

    for (const spec of LAYERS) {
      const mesh = new Mesh(
        new PlaneGeometry(1, 1),
        new MeshBasicMaterial({
          map: this.draw(spec.shade, spec.windows, next),
          transparent: true,
          depthWrite: false,
        }),
      )
      mesh.frustumCulled = false
      mesh.renderOrder = -1
      mesh.visible = false
      mesh.position.z = -150
      camera.add(mesh)
      this.layers.push({ mesh, drift: spec.drift, share: spec.share, sink: spec.sink })
    }
  }

  /** One strip of city: blocks of different heights, with windows lit in some. */
  private draw(shade: string, windowOdds: number, next: () => number): CanvasTexture {
    const width = 1024
    const height = 256
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!

    let x = 0
    while (x < width) {
      const w = 18 + next() * 54
      const h = 40 + next() * (height - 70)
      const top = height - h

      ctx.fillStyle = shade
      ctx.fillRect(x, top, w, h)

      // A mast on the tall ones, which is what makes a skyline a skyline.
      if (h > height * 0.62 && next() < 0.4) {
        ctx.fillRect(x + w / 2 - 1.5, top - 16 - next() * 20, 3, 20)
      }

      // Windows. Lit at random, in rows, and never right at the edges.
      for (let wy = top + 7; wy < height - 5; wy += 9) {
        for (let wx = x + 5; wx < x + w - 6; wx += 8) {
          if (next() > windowOdds) continue
          ctx.fillStyle = next() < 0.18 ? '#fff0c4' : '#ffd88a'
          ctx.fillRect(wx, wy, 3, 4)
        }
      }
      x += w + 1 + next() * 5
    }

    const texture = new CanvasTexture(canvas)
    texture.wrapS = RepeatWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.repeat.set(3, 1)
    return texture
  }

  /** 0 hides it, 1 shows it whole. It belongs to the dark, so the night sets it. */
  setNight(amount: number): void {
    for (const layer of this.layers) {
      const material = layer.mesh.material as MeshBasicMaterial
      layer.mesh.visible = amount > 0.2
      material.opacity = Math.min(1, Math.max(0, (amount - 0.2) / 0.5))
    }
  }

  update(travelled: number, viewWidth: number, viewHeight: number): void {
    for (const layer of this.layers) {
      const height = viewHeight * layer.share
      layer.mesh.scale.set(viewWidth * 1.05, height, 1)
      // Its feet rest on the horizon line, which is where the camera looks.
      layer.mesh.position.set(0, height / 2 - viewHeight * layer.sink, -150)
      const map = (layer.mesh.material as MeshBasicMaterial).map
      // A fraction of the travel each, which is the only depth cue there is.
      if (map) map.offset.x = (travelled * layer.drift * 0.02) % 1
    }
  }
}
