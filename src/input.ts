/** Keyboard and touch, reduced to the two things the skater understands. */
export class Input {
  jumpHeld = false
  jumpPressed = false
  dive = false
  /** -1 leans back for a 5-0, +1 leans forward for a nosegrind. */
  lean = 0

  private pending = false
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
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault()
        this.dive = true
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.lean = -1
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.lean = 1
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') this.jumpHeld = false
      if (e.code === 'ArrowDown' || e.code === 'KeyS') this.dive = false
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.lean = this.lean === -1 ? 0 : this.lean
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.lean = this.lean === 1 ? 0 : this.lean
    }

    const pointerDown = (e: PointerEvent) => {
      e.preventDefault()
      // The bottom strip of the screen is the dive pad.
      if (e.clientY > window.innerHeight * 0.75) {
        this.dive = true
      } else {
        this.jumpHeld = true
        this.pending = true
      }
    }
    const pointerUp = () => {
      this.jumpHeld = false
      this.dive = false
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
  }

  release(): void {
    for (const off of this.detach) off()
    this.detach = []
  }
}
