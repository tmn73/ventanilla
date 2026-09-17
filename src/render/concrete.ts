import { CanvasTexture, RepeatWrapping, type Texture } from 'three'

/**
 * A concrete grain, generated rather than loaded. It is fine enough that the
 * per face stretch of a box never shows, and it is the one thing separating a
 * flat grey box from something that reads as a poured surface.
 */
export function makeConcrete(size = 256): Texture | null {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const image = ctx.createImageData(size, size)
  const data = image.data
  let seed = 1

  // A small deterministic generator, so the grain is the same every load.
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  for (let i = 0; i < size * size; i++) {
    // Mostly a fine speckle, with a rare darker fleck for aggregate.
    const grain = 236 + noise() * 19
    const fleck = noise() < 0.012 ? -34 - noise() * 26 : 0
    const value = Math.max(0, Math.min(255, grain + fleck))
    data[i * 4] = value
    data[i * 4 + 1] = value
    data[i * 4 + 2] = value
    data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(3, 3)
  texture.anisotropy = 4
  return texture
}
