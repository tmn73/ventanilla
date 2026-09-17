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
  // Knees bent, feet turned across the board, weight low.
  ['LeftUpLeg', [0.1, 0.5, 0.45]],
  ['LeftLeg', [0, 0, -0.75]],
  ['LeftFoot', [0, 0.5, 0.3]],
  ['RightUpLeg', [-0.1, -0.5, -0.45]],
  ['RightLeg', [0, 0, 0.75]],
  ['RightFoot', [0, -0.5, -0.3]],
  // Shoulders squared to the board and arms out for balance.
  ['Spine', [0.12, 0, 0]],
  ['Spine1', [0.1, 0, 0]],
  ['LeftShoulder', [0, 0, 0.3]],
  ['LeftArm', [0.5, -0.4, 1.1]],
  ['LeftForeArm', [0, -0.5, 0.3]],
  ['RightShoulder', [0, 0, -0.3]],
  ['RightArm', [-0.5, 0.4, -1.1]],
  ['RightForeArm', [0, 0.5, -0.3]],
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

      // Scaled to a person's height, the same as the rig beside it.
      const scale = 1.75 / 1.6
      model.scale.setScalar(scale)
      this.root.add(model)
      this.ready = true
    })
  }

  setVisible(on: boolean): void {
    this.root.visible = on && this.ready
  }

  update(x: number, y: number, z: number, heading: number, dt: number): void {
    this.root.position.set(x, y, z)
    this.root.rotation.y = -heading
    this.mixer?.update(dt)
  }
}
