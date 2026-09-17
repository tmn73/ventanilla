/** Kickflip and heelflip turn the deck opposite ways around the same axis. */
export const KICKFLIP = 1
export const HEELFLIP = -1
/** A shove-it turns the board under him. Unqualified it means the backside one. */
export const BACKSIDE_SHOVE = -1
export const FRONTSIDE_SHOVE = 1

/** Under this, a touch is a tap and not a flick. */
const FLICK_PIXELS = 34
/** How long a foot still counts as on the board after it lifts, in ms. */
const LOAD_GRACE = 400
/** How far the foot still on the board slides before he starts turning. */
const SPIN_PIXELS = 24
/**
 * Which half of the screen a finger is on. The board is drawn from the side,
 * so the left half is always the end trailing behind him and the right half
 * the end leading. Turn the board round and the tail changes sides with it.
 */
const TRAILING = -1
const LEADING = 1

import { stanceOf } from './game/skater'

/** One finger's path, kept so it can be drawn back at the player. */
export interface Stroke {
  x0: number
  y0: number
  x1: number
  y1: number
  /** What the swipe was read as, or empty when it was read as nothing. */
  label: string
  at: number
  /** True while the finger is still down and the path is still growing. */
  live: boolean
  /** True when the finger swiped and the game did nothing with it. */
  failed: boolean
}

/**
 * What a swipe was understood to be, in the words the game would use. A pop
 * carries the stance it goes out in, because which end left the ground is the
 * whole difference between an ollie, a nollie and a fakie.
 */
export function swipeLabel(move: Swipe, reversed: boolean): string {
  if (move.flip !== undefined) return move.flip === KICKFLIP ? 'kickflip' : 'heelflip'
  if (move.shove !== undefined) return move.shove === FRONTSIDE_SHOVE ? 'fs shove' : 'shove-it'
  if (move.popEnd !== undefined) {
    const word = stanceOf(reversed, (move.popEnd === LEADING) !== reversed)
    return word === 'nollie' ? 'nollie' : `${word} ollie`.trim()
  }
  if (move.push) return 'push'
  return ''
}

/** What one flick off one foot asks for. Nothing here touches the game. */
export interface Swipe {
  /** Which end of the board the pop comes off, if it pops at all. */
  popEnd?: number
  flip?: number
  shove?: number
  push?: boolean
  /** Which grind the same flick picks, when he is on something to grind. */
  latch?: number
}

/**
 * The whole gesture grammar, kept apart from the pointers so it can be read
 * and tested on its own.
 *
 * An ollie takes both feet: one stays on the board and loads an end, the other
 * runs up it. So an upward flick only pops when the other half is held, and
 * the end that was held is the end it pops off. Out to one side rolls the deck
 * with it. A scoop and a push are the back foot alone, and a shove-it needs no
 * ollie under it, so the scoop is the whole trick.
 */
export function swipeAction(angle: number, side: number, loadedOther: boolean): Swipe {
  const up = angle >= 20 && angle < 160
  const down = angle <= -20 && angle >= -160

  if (up) {
    if (!loadedOther) return {}
    const popEnd = -side
    if (angle < 65) return { popEnd, flip: KICKFLIP, latch: 1 }
    if (angle >= 115) return { popEnd, flip: HEELFLIP, latch: -1 }
    return { popEnd, latch: 2 }
  }

  if (down) {
    // The foot that scoops is the foot the board pops off, so scooping the
    // nose is a nollie shove-it and scooping it while turned round is a fakie
    // one. Leaning the scoop back is the plain shove-it, forward the other.
    return {
      popEnd: side,
      shove: angle < -90 ? BACKSIDE_SHOVE : FRONTSIDE_SHOVE,
      latch: side === TRAILING ? -2 : 2,
    }
  }

  // Sweeping the back foot backwards is a push, and it is the only way to
  // push, so there is no way to push mongo.
  if (side === TRAILING && Math.abs(angle) > 150) return { push: true }
  return {}
}

export class Input {
  jumpHeld = false
  /** Edge, on the way up. The pop is the release, so this is what fires it. */
  jumpReleased = false
  /**
   * Which end of the board the release popped off, in screen terms: false is
   * the end trailing behind him, true is the one leading. Which of those is
   * the tail depends on whether the board is turned round, and that is what
   * makes the same gesture an ollie one way and a fakie the other.
   */
  popLeading = false
  /** Edge. Fires one flip. */
  flipPressed = false
  flipSign = KICKFLIP
  /** Edge. Starts one shove-it. */
  shovePressed = false
  shoveSign = BACKSIDE_SHOVE

  /** Held rotation: -1 backside, 1 frontside, 0 straight. */
  private dragRotate = 0
  private pushPulse = false
  private pushPending = false
  private releasePending = false
  private leadingPending = false
  private flipPending = false
  private pendingSign = KICKFLIP
  private shovePending = false
  private pendingShove: number = BACKSIDE_SHOVE
  private held = new Set<string>()
  /** A flick latches a grind until the next ollie, since a finger cannot hold one. */
  private latched = 0
  private touches = new Map<
    number,
    {
      x: number
      y: number
      side: number
      at: number
      spent: boolean
      /** True once this finger has taken over the turning. */
      steering?: boolean
      stroke: Stroke
    }
  >()
  /** When each half last had a foot on it, so a lift is not instantly gone. */
  private leftAt = new Map<number, number>()
  /** The last few finger paths, for drawing back what the hand actually did. */
  readonly strokes: Stroke[] = []
  /**
   * What the skater is doing, set every step. Touch needs it: the same drag is
   * a push on the ground and a spin in the air, and the same flick pops a
   * different end depending on which way round the board is.
   */
  reversed = false
  airborne = false
  /** Which end the current crouch is loading, kept until the pop spends it. */
  private crouchLeading = false
  private detach: Array<() => void> = []

  /**
   * On a rail the arrows choose the grind. Down and up give the two that need
   * depth to read: a feeble hangs the nose over the far side, a smith the near.
   */
  /**
   * Rotation is held, never tapped. You spin for as long as you hold it and
   * you land on whatever angle you stopped at, which is where the skill is.
   */
  get rotate(): number {
    if (this.held.has('KeyA')) return -1
    if (this.held.has('KeyD')) return 1
    return this.dragRotate
  }

  /**
   * Which half a finger is resting on, or zero. On a slide this is the end he
   * is weighting, and that is what makes it a noseslide or a tailslide.
   */
  get pressedEnd(): number {
    return this.resting(TRAILING) ? TRAILING : this.resting(LEADING) ? LEADING : 0
  }

  /** A finger on this half that has not swiped: the foot still on the board. */
  private resting(side: number): boolean {
    for (const touch of this.touches.values()) {
      if (touch.side === side && !touch.spent) return true
    }
    return false
  }

  /**
   * A foot counts as on the board for a moment after it lifts. Pressing one
   * half and flicking the other is two motions, not one chord, and asking for
   * them at the same instant is not what a pair of feet does.
   */
  private loaded(side: number): boolean {
    if (this.resting(side)) return true
    return performance.now() - (this.leftAt.get(side) ?? -Infinity) < LOAD_GRACE
  }

  /** Held, the deck keeps rolling, which is how a double and a triple come out. */
  get flipHeld(): boolean {
    return this.held.has('ArrowLeft') || this.held.has('ArrowRight')
  }

  /** Held, the board keeps turning under him, a half turn at a time. */
  get shoveHeld(): boolean {
    return this.held.has('KeyQ') || this.held.has('KeyE')
  }

  /** Held up on the ground, or one flick up. A push is a kick, not a throttle. */
  get pushing(): boolean {
    return this.held.has('ArrowUp') || this.pushPulse
  }

  /**
   * Both feet planted and nothing flicking. On a board that is what slowing
   * down looks like, and it is the one posture no trick starts from.
   */
  get braking(): boolean {
    return this.held.has('ArrowDown') || (this.resting(TRAILING) && this.resting(LEADING))
  }

  get grind(): number {
    if (this.held.has('ArrowDown')) return -2
    if (this.held.has('ArrowUp')) return 2
    if (this.held.has('ArrowLeft')) return -1
    if (this.held.has('ArrowRight')) return 1
    return this.latched
  }

  attach(surface: HTMLElement): void {
    const arrows = new Set([
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'KeyA',
      'KeyD',
      'KeyQ',
      'KeyE',
    ])

    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'Space') {
        e.preventDefault()
        this.crouchDown(this.held.has('ShiftLeft') || this.held.has('ShiftRight'))
        return
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.held.add(e.code)
        return
      }
      if (!arrows.has(e.code)) return
      e.preventDefault()
      this.held.add(e.code)
      if (e.code === 'ArrowLeft') this.flick(KICKFLIP)
      if (e.code === 'ArrowRight') this.flick(HEELFLIP)
      if (e.code === 'KeyQ') this.shove(BACKSIDE_SHOVE)
      if (e.code === 'KeyE') this.shove(FRONTSIDE_SHOVE)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') this.pop()
      this.held.delete(e.code)
    }

    // Seen from the side, the board's ends are left and right on the screen,
    // so a half is a foot. An ollie takes both: one foot stays and loads its
    // end, the other runs up the board. So every finger is tracked, not one.
    const half = (x: number): number => {
      const box = surface.getBoundingClientRect()
      return x < box.left + box.width / 2 ? TRAILING : LEADING
    }

    const pointerDown = (e: PointerEvent) => {
      e.preventDefault()
      const touch = {
        x: e.clientX,
        y: e.clientY,
        side: half(e.clientX),
        at: performance.now(),
        spent: false,
        stroke: this.openStroke(e.clientX, e.clientY),
      }
      this.touches.set(e.pointerId, touch)
      this.jumpHeld = true
    }

    const pointerMove = (e: PointerEvent) => {
      const touch = this.touches.get(e.pointerId)
      if (!touch) return
      touch.stroke.x1 = e.clientX
      touch.stroke.y1 = e.clientY

      // In the air, the foot that stayed on the board is the one that turns
      // him. The foot that flicked has done its job, so a flip and a spin are
      // never the same finger and can never be confused for one another.
      if (this.airborne && !touch.spent) {
        const across = e.clientX - touch.x
        if (touch.steering || Math.abs(across) >= SPIN_PIXELS) {
          touch.steering = true
          this.dragRotate = across > 0 ? 1 : -1
          touch.stroke.label = 'spin'
          return
        }
      }
      if (touch.spent) return

      const dx = e.clientX - touch.x
      const dy = e.clientY - touch.y
      if (Math.hypot(dx, dy) < FLICK_PIXELS) return

      const angle = (Math.atan2(-dy, dx) * 180) / Math.PI
      const sideways = Math.abs(angle) < 30 || Math.abs(angle) > 150

      // On the ground a held sideways drag off the front foot turns him too.
      if (sideways && touch.side === LEADING) {
        if (performance.now() - touch.at < 110) return
        this.dragRotate = Math.abs(angle) < 30 ? 1 : -1
        touch.stroke.label = 'spin'
        return
      }

      touch.spent = true
      const read = this.readSwipe(angle, touch.side)
      touch.stroke.label = read.label
      touch.stroke.failed = read.failed
      touch.stroke.at = performance.now()
    }

    const pointerUp = (e: PointerEvent) => {
      const touch = this.touches.get(e.pointerId)
      if (touch) {
        if (!touch.spent) this.leftAt.set(touch.side, performance.now())
        touch.stroke.live = false
        touch.stroke.at = performance.now()
      }
      this.touches.delete(e.pointerId)
      if (this.touches.size === 0) {
        this.jumpHeld = false
        this.dragRotate = 0
      }
    }

    const blur = () => {
      this.held.clear()
      this.jumpHeld = false
      for (const touch of this.touches.values()) touch.stroke.live = false
      this.touches.clear()
      this.leftAt.clear()
      this.dragRotate = 0
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    surface.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', blur)

    this.detach = [
      () => window.removeEventListener('keydown', down),
      () => window.removeEventListener('keyup', up),
      () => window.removeEventListener('blur', blur),
      () => surface.removeEventListener('pointerdown', pointerDown),
      () => window.removeEventListener('pointermove', pointerMove),
      () => window.removeEventListener('pointerup', pointerUp),
      () => window.removeEventListener('pointercancel', blur),
    ]
  }

  /**
   * A tap is an ollie. A diagonal flick up and right is a kickflip, up and
   * left a heelflip, and the four straight directions pick the grind.
   */
  /**
   * A flick sets both a flip and a grind, and the context picks which one
   * lands: in the air the flip fires, on a rail the grind changes. Diagonals
   * read as flips, the four straight directions as grinds.
   */
  /**
   * One flick off one foot. Straight up pops, and a diagonal pops and flips in
   * the same motion, which is what the foot is doing anyway. The trailing foot
   * also scoops and pushes; the leading one drags the board to a stop.
   */
  /** Opens a path for a finger and retires the oldest when there are too many. */
  private openStroke(x: number, y: number): Stroke {
    const stroke: Stroke = {
      x0: x,
      y0: y,
      x1: x,
      y1: y,
      label: 'pop',
      at: performance.now(),
      live: true,
      failed: false,
    }
    this.strokes.push(stroke)
    while (this.strokes.length > 8) this.strokes.shift()
    return stroke
  }

  private readSwipe(angle: number, side: number): { label: string; failed: boolean } {
    const loaded = this.loaded(-side)
    const move = swipeAction(angle, side, loaded)
    if (move.popEnd !== undefined) {
      this.crouchLeading = move.popEnd === LEADING
      this.pop()
    }
    if (move.flip !== undefined) this.flick(move.flip)
    if (move.shove !== undefined) this.shove(move.shove)
    if (move.push) this.pushPending = true
    if (move.latch !== undefined) this.latched = move.latch

    // An upward flick with nothing holding the other end is the one refusal
    // worth explaining, because it looks exactly like the gesture that works.
    const label = swipeLabel(move, this.reversed)
    if (label) return { label, failed: false }
    // The finger moved far enough to mean something and nothing came of it.
    // That is a miss, and it is drawn as one.
    const missedPop = !loaded && angle >= 20 && angle < 160
    return { label: missedPop ? 'hold other side' : '', failed: true }
  }






  private crouchDown(leading: boolean): void {
    this.jumpHeld = true
    this.crouchLeading = leading
    this.latched = 0
  }

  private pop(): void {
    this.jumpHeld = false
    this.releasePending = true
    this.leadingPending = this.crouchLeading
  }

  /** True while a finger is down, which is what makes a tap a short pop. */
  get pressing(): boolean {
    return this.touches.size > 0
  }

  private flick(sign: number): void {
    this.flipPending = true
    this.pendingSign = sign
  }

  private shove(sign: number): void {
    this.shovePending = true
    this.pendingShove = sign
  }

  /** Call once at the top of every fixed step so one press fires one trick. */
  beginStep(): void {
    this.jumpReleased = this.releasePending
    this.popLeading = this.leadingPending
    this.releasePending = false
    this.flipPressed = this.flipPending
    this.flipSign = this.pendingSign
    this.flipPending = false
    this.shovePressed = this.shovePending
    this.shoveSign = this.pendingShove
    this.shovePending = false
    // Carried over one step rather than cleared, or a push that arrived
    // between two steps would be wiped before the skater ever read it.
    this.pushPulse = this.pushPending
    this.pushPending = false
  }

  release(): void {
    for (const off of this.detach) off()
    this.detach = []
  }
}
