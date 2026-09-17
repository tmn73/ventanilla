/** Frames per second, averaged over a short window so the number holds still. */
export class Hud {
  private readout: HTMLElement
  private switchMark: HTMLElement
  private wasSwitched = false
  private frames = 0
  private since = performance.now()

  constructor() {
    const found = document.getElementById('fps')
    const mark = document.getElementById('switch')
    if (!found || !mark) throw new Error('missing readout')
    this.readout = found
    this.switchMark = mark
  }

  /** Which way round the rider is. Everything else they can see for themselves. */
  setSwitched(switched: boolean): void {
    if (switched === this.wasSwitched) return
    this.wasSwitched = switched
    this.switchMark.hidden = !switched
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
