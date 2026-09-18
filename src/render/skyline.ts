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
 * much of the camera's travel it takes. Daylight, so the far ones are paler
 * and hazier: distance takes the contrast out of a city long before it takes
 * the shape, which is the only reason three flat layers read as depth at all.
 */
const LAYERS = [
  { share: 0.5, drift: 0.04, shade: '#9dabb6', windows: 0, sink: -0.07 },
  { share: 0.38, drift: 0.09, shade: '#7d8c99', windows: 0, sink: -0.05 },
  { share: 0.27, drift: 0.16, shade: '#63727e', windows: 0.05, sink: -0.02 },
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
      mesh.position.z = -150
      camera.add(mesh)
      this.layers.push({ mesh, drift: spec.drift, share: spec.share, sink: spec.sink })
    }
  }

  /** One strip of city: blocks of different heights, with windows lit in some. */
  private draw(shade: string, windowOdds: number, next: () => number): CanvasTexture {
    const width = 2048
    const height = 512
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!

    let x = 0
    while (x < width) {
      const w = 90 + next() * 190
      const h = 90 + next() * (height - 150)
      const top = height - h

      ctx.fillStyle = shade
      ctx.fillRect(x, top, w, h)

      // A mast on the tall ones, which is what makes a skyline a skyline.
      if (h > height * 0.62 && next() < 0.4) {
        ctx.fillRect(x + w / 2 - 4, top - 30 - next() * 40, 8, 40)
      }

      // Windows, as the darker grid on a pale face rather than lights in the
      // dark. Only the nearest layer gets them; further off they are a texture
      // nobody can resolve.
      for (let wy = top + 26; wy < height - 20; wy += 34) {
        for (let wx = x + 22; wx < x + w - 24; wx += 30) {
          if (next() > windowOdds) continue
          ctx.fillStyle = 'rgba(40, 48, 56, 0.35)'
          ctx.fillRect(wx, wy, 12, 16)
        }
      }
      x += w + 6 + next() * 26
    }

    // Softened before it is used. A hard edge sliding across the pixel grid is
    // what crawls, so the whole strip is blurred by a fraction of a pixel,
    // which costs nothing at this size and kills it.
    ctx.globalAlpha = 0.5
    ctx.filter = 'blur(1.2px)'
    ctx.drawImage(canvas, 0, 0)
    ctx.filter = 'none'
    ctx.globalAlpha = 1

    const texture = new CanvasTexture(canvas)
    texture.wrapS = RepeatWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.repeat.set(1.6, 1)
    texture.anisotropy = 8
    texture.generateMipmaps = true
    return texture
  }

  update(travelled: number, viewWidth: number, viewHeight: number): void {
    for (const layer of this.layers) {
      const height = viewHeight * layer.share
      layer.mesh.scale.set(viewWidth * 1.05, height, 1)
      // Its feet rest on the horizon line, which is where the camera looks.
      layer.mesh.position.set(0, height / 2 - viewHeight * layer.sink, -150)
      const map = (layer.mesh.material as MeshBasicMaterial).map
      // A fraction of the travel each, which is the only depth cue there is.
      if (map) map.offset.x = (travelled * layer.drift * 0.004) % 1
    }
  }
}
