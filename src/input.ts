/** Keyboard and touch, reduced to what the skater understands. */
export class Input {
  jumpHeld = false
  jumpPressed = false
  /** Edge. In the air, left starts a kickflip. */
  leftPressed = false

  private pending = false
  private leftPending = false
  private held = new Set<string>()
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
    return 0
  }

  attach(surface: HTMLElement): void {
    const arrows = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'Space') {
        e.preventDefault()
        this.jumpHeld = true
        this.pending = true
        return
      }
      if (arrows.has(e.code)) {
        e.preventDefault()
        this.held.add(e.code)
        if (e.code === 'ArrowLeft') this.leftPending = true
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') this.jumpHeld = false
      this.held.delete(e.code)
    }

    const pointerDown = (e: PointerEvent) => {
      e.preventDefault()
      this.jumpHeld = true
      this.pending = true
    }
    const pointerUp = () => {
      this.jumpHeld = false
    }
    const blur = () => {
      this.held.clear()
      this.jumpHeld = false
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    surface.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', pointerUp)

    this.detach = [
      () => window.removeEventListener('keydown', down),
      () => window.removeEventListener('keyup', up),
      () => window.removeEventListener('blur', blur),
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
