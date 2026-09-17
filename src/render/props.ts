import { Box3, Group, Object3D, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import palmTallUrl from '../models/tree_palmDetailedTall.glb'
import palmShortUrl from '../models/tree_palmDetailedShort.glb'
import palmBendUrl from '../models/tree_palmBend.glb'
import rockLargeUrl from '../models/rock_largeB.glb'
import rockSmallUrl from '../models/rock_smallC.glb'
import grassUrl from '../models/grass_large.glb'
import parasolUrl from '../models/detail-parasol-a.glb'
import blockAUrl from '../models/low-detail-building-a.glb'
import blockCUrl from '../models/low-detail-building-c.glb'
import blockEUrl from '../models/low-detail-building-e.glb'
import blockHUrl from '../models/low-detail-building-h.glb'
import blockJUrl from '../models/low-detail-building-j.glb'
import blockLUrl from '../models/low-detail-building-l.glb'
import blockWideAUrl from '../models/low-detail-building-wide-a.glb'
import blockWideBUrl from '../models/low-detail-building-wide-b.glb'

/**
 * How big each model should be once it is in the world, in metres. Most are
 * sized by height. The city tiles are sized by `width` instead, because they
 * are one-tile towers at a four to one ratio: fitting them to a height leaves
 * a two metre wide post, and fitting them to a footprint gives a building that
 * runs off the top of the frame, which is what a street does.
 */
const CATALOGUE = {
  palmTall: { url: palmTallUrl, height: 4.6, copies: 8 },
  palmShort: { url: palmShortUrl, height: 3.8, copies: 8 },
  palmBend: { url: palmBendUrl, height: 4.4, copies: 8 },
  rockLarge: { url: rockLargeUrl, height: 1.1, copies: 8 },
  rockSmall: { url: rockSmallUrl, height: 0.45, copies: 12 },
  grass: { url: grassUrl, height: 0.7, copies: 24 },
  parasol: { url: parasolUrl, height: 2.6, copies: 8 },
  blockA: { url: blockAUrl, width: 7.5, height: 7, copies: 7 },
  blockC: { url: blockCUrl, width: 7, height: 6, copies: 7 },
  blockE: { url: blockEUrl, width: 6.5, height: 5.5, copies: 7 },
  blockH: { url: blockHUrl, width: 8, height: 8.5, copies: 6 },
  blockJ: { url: blockJUrl, width: 7.5, height: 7.5, copies: 6 },
  blockL: { url: blockLUrl, width: 7, height: 6.5, copies: 7 },
  blockWideA: { url: blockWideAUrl, width: 12, height: 0, copies: 7 },
  blockWideB: { url: blockWideBUrl, width: 13, height: 0, copies: 7 },
} as const

export type PropName = keyof typeof CATALOGUE

/**
 * A fixed set of clones per model, repositioned every frame and hidden when
 * they are not needed. Loading is asynchronous, so anything asked for before
 * a model arrives is simply skipped and appears on a later frame.
 */
class Pool {
  private clones: Object3D[] = []
  private cursor = 0

  constructor(parent: Object3D, source: Object3D, copies: number, scale: number) {
    for (let i = 0; i < copies; i++) {
      const clone = source.clone(true)
      clone.scale.setScalar(scale)
      clone.visible = false
      clone.traverse((node) => {
        node.castShadow = true
        node.receiveShadow = true
      })
      parent.add(clone)
      this.clones.push(clone)
    }
  }

  reset(): void {
    this.cursor = 0
  }

  take(): Object3D | null {
    if (this.cursor >= this.clones.length) return null
    const clone = this.clones[this.cursor++]!
    clone.visible = true
    return clone
  }

  finish(): void {
    for (let i = this.cursor; i < this.clones.length; i++) this.clones[i]!.visible = false
  }
}

export class Props {
  private pools = new Map<PropName, Pool>()
  private root = new Group()

  constructor(parent: Object3D) {
    parent.add(this.root)

    const loader = new GLTFLoader()
    for (const [name, spec] of Object.entries(CATALOGUE) as Array<[PropName, (typeof CATALOGUE)[PropName]]>) {
      loader.load(spec.url, (gltf) => {
        const source = gltf.scene
        // Kenney kits are not all one scale, so each model is measured and
        // sized to the height it should stand at here.
        const size = new Box3().setFromObject(source).getSize(new Vector3())
        const wanted = 'width' in spec ? spec.width : 0
        const scale = wanted > 0 ? wanted / (size.x || 1) : spec.height / (size.y || 1)
        this.pools.set(name, new Pool(this.root, source, spec.copies, scale))
      })
    }
  }

  reset(): void {
    for (const pool of this.pools.values()) pool.reset()
  }

  /** Places one, if the model has arrived and the pool has one left. */
  place(name: PropName, x: number, y: number, z: number, heading: number, spin = 0): void {
    const clone = this.pools.get(name)?.take()
    if (!clone) return
    clone.position.set(x, y, z)
    clone.rotation.set(0, -heading + spin, 0)
  }

  finish(): void {
    for (const pool of this.pools.values()) pool.finish()
  }
}
