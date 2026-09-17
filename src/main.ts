import { Group } from 'three'
import { startLoop } from './core/loop'
import { ANCHOR, FIXED_DT, JUMP_SPEED, LANE_Y, SPARK_RATE, VIEW_WIDTH } from './game/constants'
import { Game } from './game/game'
import { mountHelp } from './help'
import { GRINDABLE, slopeOf } from './game/road'
import { Input } from './input'
import { Backdrop } from './render/backdrop'
import { Hud } from './render/hud'
import { SPARK_COLOR } from './render/palette'
import { Particles } from './render/particles'
import { Path } from './render/path'
import { RoadView } from './render/roadView'
import { SkaterView } from './render/skaterView'
import { Stage } from './render/stage'
import { TouchTrail } from './render/touchTrail'

const canvas = document.getElementById('view') as HTMLCanvasElement
const trailCanvas = document.getElementById('trail') as HTMLCanvasElement
const surface = document.getElementById('stage') as HTMLElement

// A fresh road every run. ?seed=anything pins one road so it can be replayed.
const seed = new URLSearchParams(location.search).get('seed')
const game = new Game(seed)
const input = new Input()
input.attach(surface)
game.start()

const path = new Path(game.seedLabel)
const stage = new Stage(canvas)

// The backdrop and the sparks work on one axis, so they hang off a frame that
// carries the bend for them. Only the road and the skater are placed by hand.
const frame = new Group()
stage.scene.add(frame)

const backdrop = new Backdrop(frame)
const particles = new Particles(frame)
const roadView = new RoadView(stage.scene, path)
const skaterView = new SkaterView(stage.scene)
const hud = new Hud()
const trail = new TouchTrail(trailCanvas)

// One interruption, one screen: the controls sheet is also the pause screen.
let paused = false
mountHelp(
  (open) => {
    paused = open
  },
  (stance) => {
    game.skater.stance = stance
  },
  (course) => {
    if (course === game.course) return
    game.course = course as typeof game.course
    game.start()
  },
)

window.addEventListener('resize', () => {
  stage.resize()
  trail.resize()
})

let grounded = 1
let lastFrame = performance.now() / 1000
/** The pavement height the camera rests on. It eases so jumps do not move it. */
let camY = 0
let groundRef = LANE_Y[0]!
/**
 * The camera's heading trails the road's by a little. Locked to it exactly,
 * the turn cancels itself and nothing appears to move; too far behind and it
 * points the wrong way through a whole corner.
 */
let camHeading = 0

const eye = { x: 0, z: 0 }
const feet = { x: 0, z: 0 }
const mix = (from: number, to: number, alpha: number) => from + (to - from) * alpha

startLoop(
  (dt) => {
    // Edges are still consumed while paused, so nothing fires on resume.
    input.beginStep()
    if (!paused) game.step(dt, input)
  },
  (alpha) => {
    const now = performance.now() / 1000
    const frameDt = Math.min(now - lastFrame, 0.05)
    lastFrame = now

    const { skater, road } = game
    const x = mix(skater.prevX, skater.x, alpha)
    const y = mix(skater.prevY, skater.y, alpha)
    const camLeft = x - VIEW_WIDTH * ANCHOR
    // The camera looks a little ahead of him, which is what keeps him on the
    // anchor instead of dead centre.
    const camS = x + VIEW_WIDTH * (0.5 - ANCHOR)

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

    path.forget(camS)
    const heading = path.headingAt(camS)
    camHeading += (heading - camHeading) * 0.09
    path.place(camS, 0, eye)
    // Park the frame so a local x of camS lands on the camera's point.
    // The frame carries the ground, so it takes the road's true heading. Only
    // the camera lags; letting the ground lag too swings sand over the road.
    frame.position.set(eye.x - camS * Math.cos(heading), 0, eye.z - camS * Math.sin(heading))
    frame.rotation.y = -heading

    path.place(x, 0, feet)
    const rise = skater.support ? 0 : Math.max(-1, Math.min(1, skater.vy / JUMP_SPEED))

    backdrop.update(camLeft, stage.viewHeight)
    roadView.update(road.segments, camLeft)
    skaterView.update(
      feet.x,
      y,
      feet.z,
      path.headingAt(x),
      lean,
      skater.yaw,
      grounded,
      Math.sin(x * 1.7),
      skater.grind,
      skater.flipAngle * skater.flipSign,
      rise,
      Math.max(skater.absorb, skater.crouch * 0.72),
      Math.min(1, skater.pushTime / 0.22),
      skater.reversed,
      skater.stance,
      skater.shoveAngle * skater.shoveSign,
    )
    hud.setStance(skater.stanceWord)
    hud.update(skater)
    trail.update(input.strokes, now * 1000)
    stage.render(eye.x, camY, eye.z, camHeading)
  },
  FIXED_DT,
)
