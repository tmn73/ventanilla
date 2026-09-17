/** Kickflip and heelflip turn the deck opposite ways around the same axis. */
export const KICKFLIP = 1
export const HEELFLIP = -1
/** A shove-it turns the board under him. Unqualified it means the backside one. */
export const BACKSIDE_SHOVE = -1
export const FRONTSIDE_SHOVE = 1

/** Under this, a touch is a tap and not a flick. */
const FLICK_PIXELS = 34
/**
 * Which half of the screen a finger is on. The board is drawn from the side,
 * so the left half is always the end trailing behind him and the right half
 * the end leading. Turn the board round and the tail changes sides with it.
 */
const TRAILING = -1
const LEADING = 1

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
  private pressedAt = 0
  private pushPulse = false
  private pushPending = false
  private brakeUntil = 0
  private releasePending = false
  private leadingPending = false
  private flipPending = false
  private pendingSign = KICKFLIP
  private shovePending = false
  private pendingShove: number = BACKSIDE_SHOVE
  private held = new Set<string>()
  /** A flick latches a grind until the next ollie, since a finger cannot hold one. */
  private latched = 0
  private touchStart: { x: number; y: number; side: number } | null = null
  /** True once a drag has spent itself, so the release does not also fire. */
  private swiped = false
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
    return this.touchStart?.side ?? 0
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

  /** Held down on the ground, or half a second after a flick down. */
  get braking(): boolean {
    return this.held.has('ArrowDown') || performance.now() < this.brakeUntil
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
    // so a half is a foot. Pressing a half loads that end. The swipe off it is
    // what fires, the way a foot flicks, and holding longer loads it harder.
    const half = (x: number): number => {
      const box = surface.getBoundingClientRect()
      return x < box.left + box.width / 2 ? TRAILING : LEADING
    }

    const pointerDown = (e: PointerEvent) => {
      e.preventDefault()
      this.touchStart = { x: e.clientX, y: e.clientY, side: half(e.clientX) }
      this.pressedAt = performance.now()
      this.dragRotate = 0
      this.swiped = false
      this.crouchDown(this.touchStart.side === LEADING)
    }

    const pointerMove = (e: PointerEvent) => {
      const start = this.touchStart
      if (!start || this.swiped) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.hypot(dx, dy) < FLICK_PIXELS) return

      const angle = (Math.atan2(-dy, dx) * 180) / Math.PI
      const forward = Math.abs(angle) < 30
      const backward = Math.abs(angle) > 150

      // A finger held out to the side turns him, and it keeps turning. It is
      // the one gesture that is not a flick, so it waits to be sure.
      if ((forward || backward) && start.side === LEADING) {
        if (performance.now() - this.pressedAt < 110) return
        this.dragRotate = forward ? 1 : -1
        this.jumpHeld = false
        return
      }

      this.swiped = true
      this.readSwipe(angle, start.side)
    }

    const pointerUp = () => {
      const start = this.touchStart
      this.touchStart = null
      this.dragRotate = 0
      this.swiped = false
      // Pressing a half and letting go loads the board and unloads it again.
      // Nothing leaves the ground without the flick that sends it.
      if (start) this.jumpHeld = false
    }

    const blur = () => {
      this.held.clear()
      this.jumpHeld = false
      this.touchStart = null
      this.dragRotate = 0
      this.swiped = false
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
  private readSwipe(angle: number, side: number): void {
    const up = angle >= 25 && angle < 155
    const down = angle <= -25 && angle >= -155

    if (side === TRAILING) {
      // The back foot pops the board and nothing else. A flip is the front
      // foot's job and a second motion, the way it is on a board.
      if (up) {
        this.pop()
        this.latched = 2
        return
      }
      // Except the scoop. A shove-it needs no ollie under it, so this one
      // gesture is the whole trick.
      if (down) {
        this.shove(angle < -90 ? FRONTSIDE_SHOVE : BACKSIDE_SHOVE)
        this.pop()
        this.latched = -2
        return
      }
      // Sweeping it backwards is a push, and it is the only way to push, so
      // there is no way to push mongo.
      if (Math.abs(angle) > 150) this.pushPending = true
      this.jumpHeld = false
      return
    }

    // The front foot flicks off the nose, and which way it goes off decides
    // whether the deck rolls toe side or heel side.
    if (angle >= 25 && angle < 65) {
      this.flick(KICKFLIP)
      this.latched = 1
    } else if (angle >= 115 && angle < 155) {
      this.flick(HEELFLIP)
      this.latched = -1
    } else if (up) {
      // Straight up off the nose loads and pops that end instead.
      this.pop()
      this.latched = 2
      return
    } else if (down) {
      this.brakeUntil = performance.now() + 420
      this.latched = 0
    }
    this.jumpHeld = false
  }




  private crouchDown(leading: boolean): void {
    this.jumpHeld = true
    this.crouchLeading = leading
    this.latched = 0
  }

  private pop(): void {
    if (!this.jumpHeld) return
    this.jumpHeld = false
    this.releasePending = true
    this.leadingPending = this.crouchLeading
  }

  /** True while a finger is down, which is what makes a tap a short pop. */
  get pressing(): boolean {
    return this.touchStart !== null
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
