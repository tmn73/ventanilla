import {
  AmbientLight,
  DirectionalLight,
  OrthographicCamera,
  PCFSoftShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { VIEW_WIDTH } from '../game/constants'

/** Where the pavement sits in the window, measured from the bottom. */
const HORIZON = 0.34

/**
 * A small three quarter offset. Enough to show the top of a ledge and which
 * side of a rail the board hangs over, not enough to stop reading as a
 * side-scroller.
 */
const EYE = new Vector3(6, 9.5, 32)
const SUN = new Vector3(-16, 26, 20)
const UP = new Vector3(0, 1, 0)

export class Stage {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera: OrthographicCamera
  viewHeight = 20.25

  private target = new Vector3()
  private eye = new Vector3()
  private sun: DirectionalLight

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.setClearColor(0x7cc9e8, 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap

    this.camera = new OrthographicCamera(0, VIEW_WIDTH, 1, -1, -200, 400)

    // Midday on the coast: one hard sun, a cool sky fill, a warm bounce.
    this.sun = new DirectionalLight(0xfff4dc, 1.15)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = -VIEW_WIDTH * 0.7
    this.sun.shadow.camera.right = VIEW_WIDTH * 0.7
    this.sun.shadow.camera.top = 22
    this.sun.shadow.camera.bottom = -22
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 90
    this.sun.shadow.bias = -0.0012
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.scene.add(new AmbientLight(0x9ec9dd, 0.66))
    const bounce = new DirectionalLight(0xffe3b0, 0.26)
    bounce.position.set(8, -6, 6)
    this.scene.add(bounce)

    this.resize()
    // A window resize is not the only thing that changes the canvas box.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.resize()).observe(canvas)
    }
  }

  resize(): void {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth || 1
    const height = canvas.clientHeight || 1
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)

    this.viewHeight = VIEW_WIDTH * (height / width)
    this.camera.left = -VIEW_WIDTH / 2
    this.camera.right = VIEW_WIDTH / 2
    this.camera.bottom = -this.viewHeight * HORIZON
    this.camera.top = this.viewHeight * (1 - HORIZON)
    this.camera.updateProjectionMatrix()
  }

  /**
   * `heading` is which way the road is pointing here. Turning the eye with it
   * is what keeps the skater running left to right while the world bends.
   */
  render(x: number, y: number, z: number, heading: number): void {
    this.target.set(x, y, z)

    this.eye.copy(EYE).applyAxisAngle(UP, -heading)
    this.camera.position.copy(this.target).add(this.eye)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(this.target)

    this.eye.copy(SUN).applyAxisAngle(UP, -heading)
    this.sun.position.copy(this.target).add(this.eye)
    this.sun.target.position.copy(this.target)
    this.sun.target.updateMatrixWorld()

    this.renderer.render(this.scene, this.camera)
  }
}
