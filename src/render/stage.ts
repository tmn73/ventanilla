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
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { Vector2 } from 'three'
import { Color } from 'three'
import { VIEW_WIDTH } from '../game/constants'
import { SKY_TOP } from './palette'

/** Where the pavement sits in the window, measured from the bottom. */
const HORIZON = 0.34

/**
 * A small three quarter offset. Enough to show the top of a ledge and which
 * side of a rail the board hangs over, not enough to stop reading as a
 * side-scroller.
 */
const EYE = new Vector3(6, 9.5, 32)
/** What is left of the one big light once the day has gone. */
const MOON = 0.34
const SUN_COLOUR = 0xfffaf2
const MOON_COLOUR = 0x8fa6c8
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
  private environmentMap: Texture | null = null
  private night = 0
  private skyTint = new Color()
  private moonTint = new Color(MOON_COLOUR)
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private sun: DirectionalLight
  private fill: AmbientLight

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    // The sky. There is no plane for it any more: a plane in front of a clear
    // colour is two colours with a seam between them, and that seam was the
    // pale band across the middle of the screen.
    this.renderer.setClearColor(SKY_TOP, 1)
    // A real sky has more range than a screen does, so it has to be mapped
    // down rather than clipped, or every cloud comes out as flat white.
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap

    this.camera = new OrthographicCamera(0, VIEW_WIDTH, 1, -1, -200, 400)

    // One soft sun and a wide fill. Enough to tell two faces of a box apart,
    // not enough for a badly judged shape to announce itself.
    this.sun = new DirectionalLight(SUN_COLOUR, 1.15)
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
    this.fill = new AmbientLight(0xdfe4e6, 0.12)
    this.scene.add(this.fill)
    // A lamp only reads as a light when it spills past its own edges, and
    // that is what this does. It is the difference between a bright box and a
    // bulb, and at night it is most of the look.
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0, 0.5, 0.92)
    this.composer.addPass(this.bloom)
    // The last pass, and not optional. A composer renders into its own target
    // and applies neither the tone mapping nor the colour space on the way
    // out, so without this everything bright comes back blown.
    this.composer.addPass(new OutputPass())

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
      // Released by hand: swapping skies otherwise leaves every previous one
      // sitting on the graphics card.
      this.scene.environment?.dispose()
      this.environmentMap = environment
      this.applyEnvironment()
      pmrem.dispose()

      // Only the light is taken from it. Two things stopped the image itself
      // being usable: an equirectangular background is unrolled with the
      // camera's projection and this camera is orthographic, and cropping it
      // onto a plane put the horizon glow, which carries enormous values, along
      // one edge of that plane as a blown white strip.
      if (this.sky) this.sky.dispose()
      this.sky = texture
    })
  }

  /**
   * The sky lights the scene by day and not at all by night. Turning it down
   * was not enough: environmentIntensity left the pavement lit to white under
   * a black sky, so at night it comes off entirely and the lamps are the only
   * light there is. Which is the point of a night.
   */
  private applyEnvironment(): void {
    this.scene.environment = this.night > 0.75 ? null : this.environmentMap
    this.scene.environmentIntensity = 1 - this.night
  }

  resize(): void {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth || 1
    const height = canvas.clientHeight || 1
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)
    this.composer?.setSize(width, height)
    this.bloom?.resolution.set(width, height)

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

    this.composer.render()
  }

  /**
   * How dark the day is. The sun goes out, the fill goes with it, and the
   * glow comes up, because a bulb only looks bright against something dark.
   */
  /** The colour behind everything, given rather than mixed. */
  setSkyColour(hex: string): void {
    this.renderer.setClearColor(this.skyTint.set(hex), 1)
  }

  setNight(amount: number): void {
    this.night = amount

    // Never nothing. A street with no light at all between the lamps is not
    // dark, it is blank: you cannot see the road you are riding on. This is
    // the moon, cool and weak, and it only has to separate ground from void.
    this.sun.intensity = 1.15 * (1 - amount) ** 2 + amount * MOON
    this.sun.color.set(SUN_COLOUR).lerp(this.moonTint, amount)
    this.applyEnvironment()
    this.fill.intensity = 0.12 * (1 - amount) + amount * 0.135
    // Only the lamp heads should bleed, so the threshold sits above anything
    // the lamps put on the ground.
    this.bloom.strength = amount * 0.55
    this.bloom.threshold = 0.85
    this.renderer.toneMappingExposure = 1 - amount * 0.18
  }
}
