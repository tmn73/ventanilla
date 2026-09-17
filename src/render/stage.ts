import { OrthographicCamera, Scene, WebGLRenderer } from 'three'
import { VIEW_WIDTH } from '../game/constants'

/** Where the verge sits in the window, measured from the bottom. */
const HORIZON = 0.14

export class Stage {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera: OrthographicCamera
  viewHeight = 20.25

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.setClearColor(0x05040c, 1)
    this.camera = new OrthographicCamera(0, VIEW_WIDTH, 1, -1, -100, 100)
    this.resize()
  }

  resize(): void {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth || 1
    const height = canvas.clientHeight || 1
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)

    this.viewHeight = VIEW_WIDTH * (height / width)
    this.camera.left = 0
    this.camera.right = VIEW_WIDTH
    this.camera.bottom = -this.viewHeight * HORIZON
    this.camera.top = this.viewHeight * (1 - HORIZON)
    this.camera.updateProjectionMatrix()
  }

  render(camLeft: number, camY: number, shakeX = 0, shakeY = 0): void {
    this.camera.position.x = camLeft + shakeX
    this.camera.position.y = camY + shakeY
    this.renderer.render(this.scene, this.camera)
  }
}
