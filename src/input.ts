/** Kickflip and heelflip turn the deck opposite ways around the same axis. */
export const KICKFLIP = 1
export const HEELFLIP = -1
/** A shove-it turns the board under him. Unqualified it means the backside one. */
export const BACKSIDE_SHOVE = -1
export const FRONTSIDE_SHOVE = 1

/** Under this, a touch is a tap and not a flick. */
const FLICK_PIXELS = 34

export class Input {
  jumpHeld = false
  /** Edge, on the way up. The pop is the release, so this is what fires it. */
  jumpReleased = false
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
  private brakeUntil = 0
  private releasePending = false
  private flipPending = false
  private pendingSign = KICKFLIP
  private shovePending = false
  private pendingShove: number = BACKSIDE_SHOVE
  private held = new Set<string>()
  /** A flick latches a grind until the next ollie, since a finger cannot hold one. */
  private latched = 0
  private touchStart: { x: number; y: number } | null = null
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
        this.jumpHeld = true
        this.latched = 0
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
      if (e.code === 'Space' && this.jumpHeld) {
        this.jumpHeld = false
        this.releasePending = true
      }
      this.held.delete(e.code)
    }

    // The ollie fires on the press and the flick on the release, so a trick
    // is two motions: you pop, then you flick. Holding longer pops higher.
    const pointerDown = (e: PointerEvent) => {
      e.preventDefault()
      this.touchStart = { x: e.clientX, y: e.clientY }
      this.pressedAt = performance.now()
      this.dragRotate = 0
      this.crouchDown()
    }

    // A quick flick is a flip. A finger that moves and then stays put is a
    // spin, and it keeps spinning until it lifts.
    const pointerMove = (e: PointerEvent) => {
      const start = this.touchStart
      if (!start) return
      const dx = e.clientX - start.x
      if (Math.abs(dx) < 46 || performance.now() - this.pressedAt < 130) return
      this.dragRotate = dx > 0 ? 1 : -1
    }
    const pointerUp = (e: PointerEvent) => {
      const start = this.touchStart
      this.touchStart = null
      this.pop()
      const spun = this.dragRotate !== 0
      this.dragRotate = 0
      if (!start || spun) return
      this.readFlick(e.clientX - start.x, e.clientY - start.y)
    }
    const blur = () => {
      this.held.clear()
      this.jumpHeld = false
      this.touchStart = null
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
  private readFlick(dx: number, dy: number): void {
    if (Math.hypot(dx, dy) < FLICK_PIXELS) return

    const angle = (Math.atan2(-dy, dx) * 180) / Math.PI
    if (angle >= 22 && angle < 68) {
      this.flick(KICKFLIP)
      this.latched = 1
    } else if (angle >= 112 && angle < 158) {
      this.flick(HEELFLIP)
      this.latched = -1
    } else if (angle >= 68 && angle < 112) {
      this.shove(BACKSIDE_SHOVE)
      this.latched = 2
    }
    else if (angle >= -112 && angle < -68) this.latched = -2
    else if (angle >= -22 && angle < 22) this.latched = 1
    else this.latched = -1
  }

  private crouchDown(): void {
    this.jumpHeld = true
    this.latched = 0
  }

  private pop(): void {
    if (!this.jumpHeld) return
    this.jumpHeld = false
    this.releasePending = true
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
    this.releasePending = false
    this.flipPressed = this.flipPending
    this.flipSign = this.pendingSign
    this.flipPending = false
    this.shovePressed = this.shovePending
    this.shoveSign = this.pendingShove
    this.shovePending = false
    this.pushPulse = false
  }

  release(): void {
    for (const off of this.detach) off()
    this.detach = []
  }
}
