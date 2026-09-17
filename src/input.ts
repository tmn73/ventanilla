/** Kickflip and heelflip turn the deck opposite ways around the same axis. */
export const KICKFLIP = 1
export const HEELFLIP = -1

/** Under this, a touch is a tap and not a flick. */
const FLICK_PIXELS = 34

export class Input {
  jumpHeld = false
  jumpPressed = false
  /** Edge. Fires one flip. */
  flipPressed = false
  flipSign = KICKFLIP

  private jumpPending = false
  private flipPending = false
  private pendingSign = KICKFLIP
  private held = new Set<string>()
  /** A flick latches a grind until the next ollie, since a finger cannot hold one. */
  private latched = 0
  private touchStart: { x: number; y: number } | null = null
  private detach: Array<() => void> = []

  /**
   * On a rail the arrows choose the grind. Down and up give the two that need
   * depth to read: a feeble hangs the nose over the far side, a smith the near.
   */
  get grind(): number {
    if (this.held.has('ArrowDown')) return -2
    if (this.held.has('ArrowUp')) return 2
    if (this.held.has('ArrowLeft')) return -1
    if (this.held.has('ArrowRight')) return 1
    return this.latched
  }

  attach(surface: HTMLElement): void {
    const arrows = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'Space') {
        e.preventDefault()
        this.ollie()
        return
      }
      if (!arrows.has(e.code)) return
      e.preventDefault()
      this.held.add(e.code)
      if (e.code === 'ArrowLeft') this.flick(KICKFLIP)
      if (e.code === 'ArrowRight') this.flick(HEELFLIP)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') this.jumpHeld = false
      this.held.delete(e.code)
    }

    // The ollie fires on the press and the flick on the release, so a trick
    // is two motions: you pop, then you flick. Holding longer pops higher.
    const pointerDown = (e: PointerEvent) => {
      e.preventDefault()
      this.touchStart = { x: e.clientX, y: e.clientY }
      this.ollie()
    }
    const pointerUp = (e: PointerEvent) => {
      const start = this.touchStart
      this.touchStart = null
      this.jumpHeld = false
      if (!start) return
      this.readFlick(e.clientX - start.x, e.clientY - start.y)
    }
    const blur = () => {
      this.held.clear()
      this.jumpHeld = false
      this.touchStart = null
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    surface.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', blur)

    this.detach = [
      () => window.removeEventListener('keydown', down),
      () => window.removeEventListener('keyup', up),
      () => window.removeEventListener('blur', blur),
      () => surface.removeEventListener('pointerdown', pointerDown),
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
    } else if (angle >= 68 && angle < 112) this.latched = 2
    else if (angle >= -112 && angle < -68) this.latched = -2
    else if (angle >= -22 && angle < 22) this.latched = 1
    else this.latched = -1
  }

  private ollie(): void {
    this.jumpHeld = true
    this.jumpPending = true
    this.latched = 0
  }

  /** True while a finger is down, which is what makes a tap a short pop. */
  get pressing(): boolean {
    return this.touchStart !== null
  }

  private flick(sign: number): void {
    this.flipPending = true
    this.pendingSign = sign
  }

  /** Call once at the top of every fixed step so one press fires one trick. */
  beginStep(): void {
    this.jumpPressed = this.jumpPending
    this.jumpPending = false
    this.flipPressed = this.flipPending
    this.flipSign = this.pendingSign
    this.flipPending = false
  }

  release(): void {
    for (const off of this.detach) off()
    this.detach = []
  }
}
