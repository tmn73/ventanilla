/** Frames per second, averaged over a short window so the number holds still. */
export class Hud {
  private readout: HTMLElement
  private frames = 0
  private since = performance.now()

  constructor() {
    const found = document.getElementById('fps')
    if (!found) throw new Error('missing element #fps')
    this.readout = found
  }

  update(): void {
    this.frames++
    const now = performance.now()
    const elapsed = now - this.since
    if (elapsed < 400) return
    this.readout.textContent = Math.round((this.frames * 1000) / elapsed).toString()
    this.frames = 0
    this.since = now
  }
}
