import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  OrthographicCamera,
  PCFSoftShadowMap,
  Scene,
  Vector3,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  type Texture,
  WebGLRenderer,
} from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { VIEW_WIDTH } from '../game/constants'

/** Where the pavement sits in the window, measured from the bottom. */
const HORIZON = 0.34

/**
 * A small three quarter offset. Enough to show the top of a ledge and which
 * side of a rail the board hangs over, not enough to stop reading as a
 * side-scroller.
 */
const EYE = new Vector3(6, 9.5, 32)
/**
 * How high the eye sits, as an angle above the road. Low is the flattest side
 * view; high looks down enough to see the board lying across a rail, which is
 * the only way a noseslide and a tailslide tell themselves apart.
 */
const PITCH_LOW = 14
const PITCH_HIGH = 52
/** The eye keeps its distance as it rises, so the scale never changes with it. */
const EYE_REACH = Math.hypot(EYE.y, EYE.z)
const SUN = new Vector3(-16, 26, 20)
const UP = new Vector3(0, 1, 0)

export class Stage {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera: OrthographicCamera
  viewHeight = 20.25
  /** How much road the window shows, which the player sets. */
  visibleWidth = VIEW_WIDTH

  private zoom = 1
  private eyeBase = EYE.clone()

  private target = new Vector3()
  private eye = new Vector3()
  private point = new Vector3()
  private sky: Texture | null = null
  private sun: DirectionalLight

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.setClearColor(0xdfe3e4, 1)
    // A real sky has more range than a screen does, so it has to be mapped
    // down rather than clipped, or every cloud comes out as flat white.
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap

    this.camera = new OrthographicCamera(0, VIEW_WIDTH, 1, -1, -200, 400)

    // One soft sun and a wide fill. Enough to tell two faces of a box apart,
    // not enough for a badly judged shape to announce itself.
    this.sun = new DirectionalLight(0xfffaf2, 1.15)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = -VIEW_WIDTH * 1.4
    this.sun.shadow.camera.right = VIEW_WIDTH * 1.4
    this.sun.shadow.camera.top = 34
    this.sun.shadow.camera.bottom = -34
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 90
    this.sun.shadow.bias = -0.0012
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    // The sky does the filling now, so this is only a floor under the shadows.
    this.scene.add(new AmbientLight(0xdfe4e6, 0.12))
    this.resize()
    // A window resize is not the only thing that changes the canvas box.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.resize()).observe(canvas)
    }
  }

  /** 0 is the flattest side view and 1 looks the furthest down on him. */
  setPitch(value: number): void {
    const t = Math.max(0, Math.min(1, value))
    const angle = ((PITCH_LOW + (PITCH_HIGH - PITCH_LOW) * t) * Math.PI) / 180
    this.eyeBase.set(EYE.x, Math.sin(angle) * EYE_REACH, Math.cos(angle) * EYE_REACH)
  }

  /** 1 is the width the game is tuned around. Below it is closer, above wider. */
  setZoom(value: number): void {
    this.zoom = Math.max(0.6, Math.min(2, value))
    this.resize()
  }

  /** A world point in css pixels of the canvas, for drawing over the scene. */
  project(x: number, y: number, z: number, out: { x: number; y: number }): void {
    this.point.set(x, y, z).project(this.camera)
    const canvas = this.renderer.domElement
    out.x = ((this.point.x + 1) / 2) * canvas.clientWidth
    out.y = ((1 - this.point.y) / 2) * canvas.clientHeight
  }

  /**
   * The sky, used twice: as what you see behind everything and as the light
   * that falls on it. The second is the part that matters. A flat grey box lit
   * by one lamp and a fill looks like a flat grey box; lit by a whole sky it
   * picks up the colour of the day.
   */
  setSky(url: string): void {
    new RGBELoader().load(url, (texture) => {
      texture.mapping = EquirectangularReflectionMapping
      const pmrem = new PMREMGenerator(this.renderer)
      const environment = pmrem.fromEquirectangular(texture).texture
      // The old pair are released by hand: swapping skies otherwise leaves
      // every previous one on the graphics card.
      this.scene.environment?.dispose()
      if (this.sky) this.sky.dispose()
      this.sky = texture
      this.scene.environment = environment
      this.scene.background = texture
      this.scene.backgroundBlurriness = 0.06
      pmrem.dispose()
    })
  }

  resize(): void {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth || 1
    const height = canvas.clientHeight || 1
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)

    this.visibleWidth = VIEW_WIDTH * this.zoom
    this.viewHeight = this.visibleWidth * (height / width)
    this.camera.left = -this.visibleWidth / 2
    this.camera.right = this.visibleWidth / 2
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

    this.eye.copy(this.eyeBase).applyAxisAngle(UP, -heading)
    this.camera.position.copy(this.target).add(this.eye)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(this.target)

    // The sun stays where it is. Turning it with the road moved it across the
    // sky at every bend, and every shadow swung round with it.
    this.sun.position.copy(this.target).add(SUN)
    this.sun.target.position.copy(this.target)
    this.sun.target.updateMatrixWorld()

    this.renderer.render(this.scene, this.camera)
  }
}
