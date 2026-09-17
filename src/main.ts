import { startLoop } from './core/loop'
import { ANCHOR, FIXED_DT, LANE_Y, SPARK_RATE, VIEW_WIDTH } from './game/constants'
import { Game } from './game/game'
import { GRINDABLE, slopeOf } from './game/road'
import { Input } from './input'
import { Backdrop } from './render/backdrop'
import { Hud } from './render/hud'
import { SPARK_COLOR } from './render/palette'
import { Particles } from './render/particles'
import { RoadView } from './render/roadView'
import { SkaterView } from './render/skaterView'
import { Stage } from './render/stage'

const canvas = document.getElementById('view') as HTMLCanvasElement
const surface = document.getElementById('stage') as HTMLElement

const stage = new Stage(canvas)
const backdrop = new Backdrop(stage.scene)
const roadView = new RoadView(stage.scene)
const particles = new Particles(stage.scene)
const skaterView = new SkaterView(stage.scene)
const hud = new Hud()

// A fresh road every run. ?seed=anything pins one road so it can be replayed.
const game = new Game(new URLSearchParams(location.search).get('seed'))
const input = new Input()
input.attach(surface)
game.start()

window.addEventListener('resize', () => stage.resize())

let grounded = 1
let lastFrame = performance.now() / 1000
/** The pavement height the camera rests on. It eases so jumps do not move it. */
let camY = 0
let groundRef = LANE_Y[0]!

const mix = (from: number, to: number, alpha: number) => from + (to - from) * alpha

startLoop(
  (dt) => {
    input.beginStep()
    game.step(dt, input)
  },
  (alpha) => {
    const now = performance.now() / 1000
    const frameDt = Math.min(now - lastFrame, 0.05)
    lastFrame = now

    const { car, skater, road } = game
    const camLeft = mix(car.prevX, car.x, alpha) - VIEW_WIDTH * ANCHOR
    const x = mix(skater.prevX, skater.x, alpha)
    const y = mix(skater.prevY, skater.y, alpha)

    grounded += ((skater.support ? 1 : 0) - grounded) * 0.25

    // Sparks only on metal. Concrete rolls in silence, which is the whole tell.
    if (skater.support && GRINDABLE[skater.support.kind]) {
      const truck = skater.grind < 0 ? -0.35 : skater.grind > 0 ? 0.35 : -0.45
      particles.emit(frameDt, x + truck, y, SPARK_RATE, false, SPARK_COLOR)
    }
    particles.update(frameDt)

    // The camera follows the pavement, never the jump.
    if (skater.support) groundRef = skater.y
    camY += (groundRef - LANE_Y[0]! - camY) * 0.06

    // He rides straight, and leans with whatever ramp he is on.
    const lean = skater.support ? Math.atan(slopeOf(skater.support)) : 0

    backdrop.update(camLeft, stage.viewHeight, groundRef)
    roadView.update(road.segments, camLeft)
    skaterView.update(x, y, lean, grounded, Math.sin(x * 1.7), skater.grind, skater.flipAngle * skater.flipSign)
    hud.update(game)
    stage.render(camLeft, camY)
  },
  FIXED_DT,
)
