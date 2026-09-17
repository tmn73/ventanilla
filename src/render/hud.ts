import type { Game } from '../game/game'

/** The distance, and nothing else. The player works the rest out by playing. */
export class Hud {
  private distance: HTMLElement

  constructor() {
    const found = document.getElementById('distance')
    if (!found) throw new Error('missing element #distance')
    this.distance = found
  }

  update(game: Game): void {
    this.distance.textContent = Math.floor(game.distance).toString()
  }
}
