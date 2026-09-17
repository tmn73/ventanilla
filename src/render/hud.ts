import type { Game } from '../game/game'

function element(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing element #${id}`)
  return found
}

/** The distance, and nothing else. The player works the rest out by playing. */
export class Hud {
  private distance = element('distance')
  private overlay = element('overlay')
  private final = element('final')

  update(game: Game): void {
    this.distance.textContent = Math.floor(game.distance).toString()
  }

  showDead(distance: number): void {
    this.final.textContent = Math.floor(distance).toString()
    this.overlay.dataset.visible = 'true'
  }

  hideOverlay(): void {
    this.overlay.dataset.visible = 'false'
  }
}
