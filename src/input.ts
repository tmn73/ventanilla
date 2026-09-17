/** Keyboard and touch, reduced to the two things the skater understands. */
export class Input {
  jumpHeld = false
  jumpPressed = false
  /** Held. On a rail, -1 is a 5-0 and +1 is a nosegrind. */
  lean = 0
  /** Edge. In the air, left starts a kickflip. */
  leftPressed = false

  private pending = false
  private leftPending = false
  private detach: Array<() => void> = []

  attach(surface: HTMLElement): void {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      // Space is the only jump. The arrows belong to the grinds.
      if (e.code === 'Space') {
        e.preventDefault()
        this.jumpHeld = true
        this.pending = true
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault()
        this.lean = -1
        this.leftPending = true
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault()
        this.lean = 1
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') this.jumpHeld = false
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.lean = this.lean === -1 ? 0 : this.lean
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.lean = this.lean === 1 ? 0 : this.lean
    }

    const pointerDown = (e: PointerEvent) => {
      e.preventDefault()
      this.jumpHeld = true
      this.pending = true
    }
    const pointerUp = () => {
      this.jumpHeld = false
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    surface.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', pointerUp)

    this.detach = [
      () => window.removeEventListener('keydown', down),
      () => window.removeEventListener('keyup', up),
      () => surface.removeEventListener('pointerdown', pointerDown),
      () => window.removeEventListener('pointerup', pointerUp),
      () => window.removeEventListener('pointercancel', pointerUp),
    ]
  }

  /** Call once at the top of every fixed step so one press fires one jump. */
  beginStep(): void {
    this.jumpPressed = this.pending
    this.pending = false
    this.leftPressed = this.leftPending
    this.leftPending = false
  }

  release(): void {
    for (const off of this.detach) off()
    this.detach = []
  }
}
