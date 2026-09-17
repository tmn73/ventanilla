import type { Stroke } from '../input'
import { SKATER_CAP, TRAIL_COLOR } from './palette'

/** How long a finished path stays on screen, in ms. */
const LINGER = 1100
/** And how long the word it was read as stays, which is a little longer. */
const LABEL_LINGER = 1400

/**
 * Draws back what the hand actually did: where each finger landed, where it
 * went, and what the swipe was read as. A gesture that did nothing leaves a
 * path with no word beside it, which is the whole point of showing it.
 */
export class TouchTrail {
  private ctx: CanvasRenderingContext2D | null

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')
    this.resize()
  }

  resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(this.canvas.clientWidth * ratio)
    this.canvas.height = Math.round(this.canvas.clientHeight * ratio)
    this.ctx?.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  /**
   * The balance meter, drawn as an arc over his head rather than parked in a
   * corner. What you are correcting and what you are looking at are the same
   * thing, so they belong in the same place.
   */
  balance(at: { x: number; y: number }, value: number, active: boolean): void {
    const ctx = this.ctx
    if (!ctx || !active) return

    const radius = 26
    const spread = Math.PI * 0.62
    const middle = -Math.PI / 2
    const edge = Math.min(1, Math.abs(value))

    ctx.save()
    ctx.lineCap = 'round'

    ctx.strokeStyle = SKATER_CAP
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(at.x, at.y, radius, middle - spread, middle + spread)
    ctx.stroke()

    // The needle warms as it runs out of board, so the trouble is visible
    // before it is over rather than only once it is.
    ctx.strokeStyle = TRAIL_COLOR.took
    ctx.globalAlpha = 0.45 + edge * 0.55
    ctx.lineWidth = 3 + edge * 2
    const angle = middle + spread * Math.max(-1, Math.min(1, value))
    ctx.beginPath()
    ctx.arc(at.x, at.y, radius, angle - 0.06, angle + 0.06)
    ctx.stroke()
    ctx.restore()
  }

  update(strokes: Stroke[], now: number): void {
    const ctx = this.ctx
    if (!ctx) return
    ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight)

    for (const stroke of strokes) {
      const age = stroke.live ? 0 : now - stroke.at
      if (age > LABEL_LINGER) continue

      const box = this.canvas.getBoundingClientRect()
      const x0 = stroke.x0 - box.left
      const y0 = stroke.y0 - box.top
      const x1 = stroke.x1 - box.left
      const y1 = stroke.y1 - box.top
      const fade = stroke.live ? 1 : Math.max(0, 1 - age / LINGER)

      const color = stroke.failed ? TRAIL_COLOR.missed : TRAIL_COLOR.took

      if (fade > 0) {
        ctx.strokeStyle = color
        ctx.fillStyle = color
        ctx.globalAlpha = fade * 0.75
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        // Dashed for a miss, so it reads without telling two colours apart.
        ctx.setLineDash(stroke.failed ? [5, 6] : [])
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
        ctx.setLineDash([])

        // The dot marks where the finger landed, so the direction reads.
        ctx.globalAlpha = fade * 0.9
        ctx.beginPath()
        ctx.arc(x0, y0, 7, 0, Math.PI * 2)
        ctx.fill()
      }

      if (!stroke.label) continue
      ctx.globalAlpha = Math.max(0, 1 - age / LABEL_LINGER)
      ctx.fillStyle = color
      ctx.font = '600 13px ui-monospace, monospace'
      ctx.textAlign = x1 < x0 ? 'right' : 'left'
      ctx.fillText(stroke.label, x1 + (x1 < x0 ? -12 : 12), y1 + 4)
    }

    ctx.globalAlpha = 1
  }
}
