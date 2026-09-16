import { startLoop } from './core/loop'
import { ANCHOR, FIXED_DT, VIEW_WIDTH } from './game/constants'
import { Game } from './game/game'
import { Input } from './input'
import { Backdrop } from './render/backdrop'
import { Hud } from './render/hud'
import { RoadView } from './render/roadView'
import { SkaterView } from './render/skaterView'
import { Stage } from './render/stage'

const canvas = document.getElementById('view') as HTMLCanvasElement
const surface = document.getElementById('stage') as HTMLElement

const stage = new Stage(canvas)
const backdrop = new Backdrop(stage.scene)
const roadView = new RoadView(stage.scene)
const skaterView = new SkaterView(stage.scene)
const hud = new Hud()

const game = new Game('mvp')
const input = new Input()
input.attach(surface)

hud.showReady()

const launch = () => {
  if (game.phase === 'running') return
  game.start()
  hud.hideOverlay()
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'Enter') launch()
})
surface.addEventListener('pointerdown', () => launch())
window.addEventListener('resize', () => stage.resize())

let announced: string = game.phase
/** Eases the pose between tucked and crouched so landings do not snap. */
let grounded = 1

const mix = (from: number, to: number, alpha: number) => from + (to - from) * alpha

startLoop(
  (dt) => {
    input.beginStep()
    game.step(dt, input)
  },
  (alpha) => {
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

    backdrop.update(camLeft, stage.viewHeight)
    roadView.update(road.segments, camLeft)
    skaterView.update(x, y, skater.support ? 0 : skater.spin, grounded)
    hud.update(game)
    stage.render(camLeft)
  },
  FIXED_DT,
)
