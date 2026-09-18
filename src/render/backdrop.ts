import {
  BufferAttribute,
  type Camera,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'
import { SKY_HIGH, SKY_TOP } from './palette'

/**
 * The background, and it is a single wash of colour.
 *
 * Every drawn or photographed version of this fought the rest of the picture.
 * A photograph sits behind flat shaded boxes as a second style, and anything
 * with an edge crawls when it slides along. A gradient has neither problem: it
 * is one quad, it never moves, and it has no edge to catch the pixel grid. It
 * hands the whole image to the road and the accent, which is what a grey box
 * wants anyway.
 */
export class Backdrop {
  private field: Mesh

  constructor(camera: Camera) {
    const geometry = new PlaneGeometry(1, 1, 1, 8)
    const position = geometry.getAttribute('position')
    const colours = new Float32Array(position.count * 3)
    const low = new Color(SKY_TOP)
    const high = new Color(SKY_HIGH)
    const shade = new Color()

    for (let i = 0; i < position.count; i++) {
      // Deeper toward the top, the way a sky is, and it takes the flatness off
      // without putting anything in it that has to be looked at.
      shade.copy(low).lerp(high, position.getY(i) + 0.5)
      colours[i * 3] = shade.r
      colours[i * 3 + 1] = shade.g
      colours[i * 3 + 2] = shade.b
    }
    geometry.setAttribute('color', new BufferAttribute(colours, 3))

    this.field = new Mesh(
      geometry,
      new MeshBasicMaterial({ vertexColors: true, depthWrite: false, toneMapped: false }),
    )
    this.field.frustumCulled = false
    this.field.renderOrder = -2
    this.field.position.z = -150
    camera.add(this.field)
  }

  update(viewWidth: number, viewHeight: number): void {
    // Covers the frame whole, since it is what everything else sits on.
    this.field.scale.set(viewWidth * 1.05, viewHeight * 1.05, 1)
    this.field.position.y = viewHeight * 0.2
  }
}
