import { startLoop } from './core/loop'
import { ANCHOR, FIXED_DT, SPARK_RATE, VIEW_WIDTH } from './game/constants'
import { Game } from './game/game'
import { Input } from './input'
import { Backdrop } from './render/backdrop'
import { Hud } from './render/hud'
import { DUST, SPARK_COLOR } from './render/palette'
import { Particles } from './render/particles'
import { RoadView } from './render/roadView'
import { SkaterView } from './render/skaterView'
import { Stage } from './render/stage'

const canvas = document.getElementById('view') as HTMLCanvasElement
const surface = document.getElementById('stage') as HTMLElement
const danger = document.getElementById('danger') as HTMLElement

const stage = new Stage(canvas)
const backdrop = new Backdrop(stage.scene)
const roadView = new RoadView(stage.scene)
const particles = new Particles(stage.scene)
const skaterView = new SkaterView(stage.scene)
const hud = new Hud()

// One road per day, the same for everyone. ?seed=anything overrides it for testing.
const seed = new URLSearchParams(location.search).get('seed') ?? new Date().toISOString().slice(0, 10)
const game = new Game(seed)
const input = new Input()
input.attach(surface)

hud.showReady()

const launch = () => {
  if (game.phase === 'running' || game.phase === 'falling') return
  particles.clear()
  game.start()
  hud.hideOverlay()
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'Enter') launch()
})
surface.addEventListener('pointerdown', () => launch())
window.addEventListener('resize', () => stage.resize())

let announced: string = game.phase
let grounded = 1
let lastFrame = performance.now() / 1000

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

    if (game.phase !== announced) {
      announced = game.phase
      if (game.phase === 'dead') hud.showDead(game.distance, game.best)
    }

    const { car, skater, road } = game
    const camLeft = mix(car.prevX, car.x, alpha) - VIEW_WIDTH * ANCHOR
    const x = mix(skater.prevX, skater.x, alpha)
    const y = mix(skater.prevY, skater.y, alpha)

    const target = skater.support ? 1 : 0
    grounded += (target - grounded) * 0.25

    // Sparks while grinding, brighter the higher the lane. Dust when he lands
    // in the dirt. Nothing else tells the player which surface is worth taking.
    if (skater.support && game.phase === 'running') {
      const lane = skater.support.lane
      const truck = skater.grind < 0 ? -0.35 : skater.grind > 0 ? 0.35 : -0.45
      particles.emit(frameDt, x + truck, y, SPARK_RATE[lane] ?? 40, false, SPARK_COLOR[lane] ?? '#ffd9a0')
    } else if (game.phase === 'falling' && skater.fallTime < 0.3) {
      particles.emit(frameDt, x, y, 180, true, DUST)
    }
    particles.update(frameDt)

    // The suspension. This is what says "you are in a moving car".
    const jolt = Math.min(1, car.speed / 26)
    const shakeY =
      (Math.sin(now * 27.3) * 0.5 + Math.sin(now * 41.7) * 0.3 + Math.sin(now * 13.1) * 0.2) * 0.1 * jolt
    const shakeX = Math.sin(now * 19.4) * 0.04 * jolt

    backdrop.update(camLeft, stage.viewHeight)
    roadView.update(road.segments, road.obstacles, camLeft, 0.5 + 0.5 * Math.sin(now * 5.2))
    // He jumps straight. Rotation is for the fall, and later for tricks.
    const spin = game.phase === 'falling' ? skater.spin : 0
    skaterView.update(x, y, spin, grounded, Math.sin(x * 1.7), skater.grind)
    hud.update(game)
    danger.style.opacity = game.phase === 'falling' ? '0.85' : '0'
    stage.render(camLeft, shakeX, shakeY)
  },
  FIXED_DT,
)
