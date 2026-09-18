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
  private task: HTMLElement
  private hint: HTMLElement
  private state: HTMLElement
  private how: HTMLElement
  private shownTask = ''
  private shown = -1

  constructor() {
    const speed = document.getElementById('speed')
    const trick = document.getElementById('trick')
    const mark = document.getElementById('switch')
    const task = document.getElementById('task')
    const hint = document.getElementById('task-hint')
    const state = document.getElementById('task-state')
    const how = document.getElementById('task-how')
    if (!speed || !trick || !mark || !task || !hint || !state || !how) {
      throw new Error('missing readout')
    }
    this.task = task
    this.hint = hint
    this.state = state
    this.how = how
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

  /** What has to be done, and how it is going. Hidden when there is no task. */
  setTask(hint: string, how: string, shout: string): void {
    const line = `${hint}|${how}|${shout}`
    if (line === this.shownTask) return
    this.shownTask = line
    this.task.hidden = hint === '' && shout === ''
    this.hint.textContent = hint
    this.how.textContent = how
    // A mark rather than a word: it is read at a glance and it is the same
    // glance that is watching the road.
    this.state.textContent = shout === 'landed' ? '\u2713' : shout === 'missed' ? '\u2715' : ''
    this.state.dataset.shout = shout
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
