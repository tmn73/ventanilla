import type { Skater } from '../game/skater'

/**
 * Speed, which way round you are riding, and the name of the last thing you
 * landed. Nothing else, because nothing else has to be told.
 */
export class Hud {
  private speed: HTMLElement
  private trick: HTMLElement
  private switchMark: HTMLElement
  private stance = ''
  private shown = -1

  constructor() {
    const speed = document.getElementById('speed')
    const trick = document.getElementById('trick')
    const mark = document.getElementById('switch')
    if (!speed || !trick || !mark) throw new Error('missing readout')
    this.speed = speed
    this.trick = trick
    this.switchMark = mark
  }

  /** Which way round the rider is. Everything else they can see for themselves. */
  setStance(word: string): void {
    if (word === this.stance) return
    this.stance = word
    this.switchMark.textContent = word
    this.switchMark.hidden = word === ''
  }

  update(skater: Skater): void {
    // Rounded before it is compared, so the DOM is touched a few times a second
    // rather than every frame.
    const kmh = Math.round(skater.vx * 3.6)
    if (kmh !== this.shown) {
      this.shown = kmh
      this.speed.textContent = String(kmh)
    }

    const age = skater.trickAge
    if (age < 1.5 && skater.trick) {
      this.trick.textContent = skater.trick
      this.trick.style.opacity = Math.min(1, (1.5 - age) / 0.5).toFixed(2)
    } else {
      this.trick.style.opacity = '0'
    }
  }
}
