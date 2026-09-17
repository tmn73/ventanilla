import { AnimationMixer, Group, Mesh, MeshLambertMaterial, type Object3D, Scene } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { SKATER } from './palette'

/**
 * The bought-in rider, stood next to the built one so the two can be judged
 * against each other at the size they actually appear.
 *
 * It is posed by hand into a stance and it does not animate. The model has no
 * skate animation in it, which is the finding: it ships a walk, a run, an
 * idle, a jump, a punch and a death, and nothing that belongs on a board.
 */
const STANCE: Array<[string, [number, number, number]]> = [
  // Feet apart along the board, knees bent, arms a little out. Kept shallow:
  // large angles on a real skeleton fold it into itself.
  ['LeftUpLeg', [0, 0, 0.32]],
  ['LeftLeg', [0, 0, -0.5]],
  ['RightUpLeg', [0, 0, -0.32]],
  ['RightLeg', [0, 0, 0.5]],
  ['Spine', [0, 0, 0.06]],
  ['LeftArm', [0, 0, 0.5]],
  ['RightArm', [0, 0, -0.5]],
]

export class ModelView {
  readonly root = new Group()
  private mixer: AnimationMixer | null = null
  private ready = false

  constructor(scene: Scene, url: string) {
    this.root.visible = false
    scene.add(this.root)

    new GLTFLoader().load(url, (gltf) => {
      const model = gltf.scene
      // One flat colour, so the comparison is about the shape and not about a
      // texture the built rider was never given.
      model.traverse((node: Object3D) => {
        if (!(node as Mesh).isMesh) return
        const mesh = node as Mesh
        mesh.material = new MeshLambertMaterial({ color: Number(SKATER.replace('#', '0x')) })
        mesh.castShadow = true
      })

      for (const [name, angles] of STANCE) {
        const bone = model.getObjectByName(name)
        if (bone) bone.rotation.set(angles[0], angles[1], angles[2])
      }

      // Measured, not guessed. The mesh is 0.08 units tall and its armature
      // carries a scale of 69, so it renders at about 5.5 and has to come down
      // to a person's height. Guessing at it put him three times over.
      const MODEL_HEIGHT = 5.53
      model.scale.setScalar(1.75 / MODEL_HEIGHT)
      this.root.add(model)
      this.ready = true
    })
  }

  setVisible(on: boolean): void {
    this.root.visible = on && this.ready
  }

  update(x: number, y: number, z: number, heading: number, dt: number): void {
    this.root.position.set(x, y, z)
    // He stands across the board, not along it.
    this.root.rotation.y = -heading + Math.PI / 2
    this.mixer?.update(dt)
  }
}
