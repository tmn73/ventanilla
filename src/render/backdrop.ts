import {
  type Camera,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
} from 'three'

/** How much of the window the city fills, and how much of the photo is used. */
const SHARE = 0.52
const CROP = 0.58

/**
 * A photograph, hung off the camera and never moved.
 *
 * Everything before this was drawn and slid along to fake distance, and all of
 * it crawled: a hard edge moving a fraction of a pixel a frame is what
 * shimmering is. This cannot shimmer, because nothing about it moves.
 */
export class Backdrop {
  private mesh: Mesh

  constructor(camera: Camera, url: string) {
    const texture = new TextureLoader().load(url)
    // A photograph is sRGB. Left unsaid, three reads it as linear and the
    // whole thing comes out washed and too bright to sit next to the sky.
    texture.colorSpace = SRGBColorSpace
    // The lower part of the frame, which is where the buildings are.
    texture.repeat.set(1, CROP)
    texture.offset.set(0, 0)
    texture.minFilter = LinearFilter
    texture.generateMipmaps = false

    this.mesh = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: texture, depthWrite: false, toneMapped: false }),
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1
    this.mesh.position.z = -150
    camera.add(this.mesh)
  }

  update(viewWidth: number, viewHeight: number): void {
    const height = viewHeight * SHARE
    this.mesh.scale.set(viewWidth * 1.02, height, 1)
    // Its feet rest on the line the camera looks at, so the road hides the base.
    this.mesh.position.y = height / 2 - viewHeight * 0.04
  }
}
