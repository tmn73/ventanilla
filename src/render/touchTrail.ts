import type { Stroke } from '../input'
import { SURFACE_COLOR } from './palette'

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

      if (fade > 0) {
        ctx.strokeStyle = SURFACE_COLOR.ledge ?? '#e2603c'
        ctx.globalAlpha = fade * 0.75
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()

        // The dot marks where the finger landed, so the direction reads.
        ctx.globalAlpha = fade * 0.9
        ctx.beginPath()
        ctx.arc(x0, y0, 7, 0, Math.PI * 2)
        ctx.fill()
      }

      if (!stroke.label) continue
      ctx.globalAlpha = Math.max(0, 1 - age / LABEL_LINGER)
      ctx.fillStyle = SURFACE_COLOR.ledge ?? '#e2603c'
      ctx.font = '600 13px ui-monospace, monospace'
      ctx.textAlign = x1 < x0 ? 'right' : 'left'
      ctx.fillText(stroke.label, x1 + (x1 < x0 ? -12 : 12), y1 + 4)
    }

    ctx.globalAlpha = 1
  }
}
