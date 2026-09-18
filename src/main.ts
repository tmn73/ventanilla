import { Group } from 'three'
import { startLoop } from './core/loop'
import { ANCHOR, FIXED_DT, JUMP_SPEED, LANE_Y, PUSH_STROKE, SPARK_RATE } from './game/constants'
import { Game } from './game/game'
import { mountHelp } from './help'
import { GRINDABLE, slopeOf } from './game/road'
import { Input } from './input'
import { Hud } from './render/hud'
import { SPARK_COLOR } from './render/palette'
import { Particles } from './render/particles'
import { Path } from './render/path'
import { RoadView } from './render/roadView'
import { SkaterView } from './render/skaterView'
import { Backdrop } from './render/backdrop'
import { Stage } from './render/stage'
import { TouchTrail } from './render/touchTrail'

/** Three skies from Poly Haven, public domain. See assets/README.md. */

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

// The sparks work on one axis, so they hang off a frame that
// carries the bend for them. Only the road and the skater are placed by hand.
const frame = new Group()
stage.scene.add(frame)

const particles = new Particles(frame)
const roadView = new RoadView(stage.scene, path)
const backdrop = new Backdrop(stage.camera)
// Children of a camera only render when the camera is itself in the scene.
stage.scene.add(stage.camera)
const skaterView = new SkaterView(stage.scene)
const hud = new Hud()
const trail = new TouchTrail(trailCanvas)

// The sky is a fixed daylight now, so it is set once and never touched again.
stage.setSky('assets/kloofendal_48d_partly_cloudy_puresky.hdr')

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
  (zoom) => stage.setZoom(zoom),
  (pitch) => stage.setPitch(pitch),
  (held) => {
    game.rewinding = held
  },
)

// Free, or being called tricks. The buttons sit on the screen because which
// one you are in is the thing you are doing, not a preference.
const modeButtons = {
  free: document.getElementById('mode-free'),
  learn: document.getElementById('mode-learn'),
  skip: document.getElementById('skip'),
}
const applyMode = (learning: boolean) => {
  modeButtons.free?.setAttribute('aria-pressed', String(!learning))
  modeButtons.learn?.setAttribute('aria-pressed', String(learning))
  game.setLearning(learning)
}
modeButtons.free?.addEventListener('click', () => applyMode(false))
modeButtons.learn?.addEventListener('click', () => applyMode(true))
// Stuck is not a state worth sitting in. The next one is along in a moment.
modeButtons.skip?.addEventListener('click', () => game.coach?.skip())
for (const button of Object.values(modeButtons)) {
  button?.addEventListener('pointerdown', (event) => event.stopPropagation())
}

// Lines is what the game is now, so it is what it opens on.
applyMode(true)

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
const overhead = { x: 0, y: 0 }
const mix = (from: number, to: number, alpha: number) => from + (to - from) * alpha

const advance = (dt: number) => {
    // Edges are still consumed while paused, so nothing fires on resume.
    // Touch reads the same drag differently on the ground and in the air, and
    // the same flick pops a different end depending on which way round he is.
    input.reversed = game.skater.reversed
    input.airborne = game.skater.support === null
    input.balancing = game.skater.balancing
    input.beginStep()
    if (!paused) game.step(dt, input)
}

const draw = (alpha: number) => {
    const now = performance.now() / 1000
    const frameDt = Math.min(now - lastFrame, 0.05)
    lastFrame = now

    const { skater, road } = game
    const x = mix(skater.prevX, skater.x, alpha)
    const y = mix(skater.prevY, skater.y, alpha)
    const camLeft = x - stage.visibleWidth * ANCHOR
    // The camera looks a little ahead of him, which is what keeps him on the
    // anchor instead of dead centre.
    const camS = x + stage.visibleWidth * (0.5 - ANCHOR)

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

    roadView.update(road.segments, camLeft, stage.visibleWidth)
    backdrop.update(stage.visibleWidth, stage.viewHeight)
    skaterView.update({
      x: feet.x,
      y,
      z: feet.z,
      heading: path.headingAt(x),
      lean,
      yaw: skater.yaw,
      grounded,
      pump: Math.sin(x * 1.7),
      grind: skater.grind,
      flip: skater.flipAngle * skater.flipSign,
      rise,
      absorb: Math.max(skater.absorb, skater.crouch * 0.72),
      // How far through the kick he is, from nought to one. The rig makes the
      // bell out of it and also sweeps the foot along, which it cannot do from
      // a number that rises and falls.
      push: Math.max(0, 1 - skater.pushTime / PUSH_STROKE),
      switched: skater.reversed,
      stance: skater.stance,
      shove: skater.shoveAngle * skater.shoveSign,
      nose: skater.poppedNose,
      sideways: skater.sideways,
    })
    hud.setStance(skater.stanceWord)
    const coach = game.coach
    hud.setTask(
      coach?.current?.hint ?? '',
      coach?.current?.ask.how ?? '',
      coach?.shout ?? '',
      coach?.shoutLabel ?? '',
    )
    hud.update(skater)
    trail.update(input.strokes, now * 1000)
    // Drawn after the trail so the arc sits over it, and after the scene so it
    // is placed with the camera the frame was actually rendered with.
    stage.project(feet.x, y + 2.3, feet.z, overhead)
    trail.balance(overhead, skater.balance, skater.balancing)
    stage.render(eye.x, camY, eye.z, camHeading)
}

startLoop(advance, draw, FIXED_DT)

/**
 * Runs the game on demand, for checking it without a visible window.
 *
 * requestAnimationFrame does not fire in a hidden tab, so a screenshot of one
 * is always the first frame: the rider never leaves the start, no module ever
 * arrives, and the whole thing looks broken when nothing is wrong with it.
 * This cost most of a day to work out, so the way round it stays.
 */
;(window as unknown as Record<string, unknown>).__shot = () => {
  draw(0)
  return stage.renderer.domElement.toDataURL('image/png')
}

;(window as unknown as Record<string, unknown>).__run = (seconds: number) => {
  const ticks = Math.round(seconds / FIXED_DT)
  for (let i = 0; i < ticks; i++) advance(FIXED_DT)
  draw(0)
  return {
    x: Number(game.skater.x.toFixed(1)),
    trick: game.skater.trick,
    landed: game.coach?.landed,
    push: Number((1 - game.skater.pushTime / PUSH_STROKE).toFixed(2)),
  }
}
