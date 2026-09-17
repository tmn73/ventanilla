import { Box3, Group, Object3D, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import palmBendUrl from '../models/tree_palmBend.glb'
import palmShortUrl from '../models/tree_palmDetailedShort.glb'
import palmTallUrl from '../models/tree_palmDetailedTall.glb'
import rockLargeUrl from '../models/rock_largeB.glb'
import rockSmallUrl from '../models/rock_smallC.glb'
import grassUrl from '../models/grass_large.glb'

/** How tall each model should stand once it is in the world, in metres. */
const CATALOGUE = {
  palmTall: { url: palmTallUrl, height: 6.2, copies: 10 },
  palmShort: { url: palmShortUrl, height: 4.6, copies: 10 },
  palmBend: { url: palmBendUrl, height: 5.2, copies: 8 },
  rockLarge: { url: rockLargeUrl, height: 1.1, copies: 8 },
  rockSmall: { url: rockSmallUrl, height: 0.45, copies: 12 },
  grass: { url: grassUrl, height: 0.7, copies: 24 },
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
        const scale = size.y > 0 ? spec.height / size.y : 1
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
