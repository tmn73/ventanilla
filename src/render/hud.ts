import type { Game } from '../game/game'

function element(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing element #${id}`)
  return found
}

export class Hud {
  private distance = element('distance')
  private trick = element('trick')
  private overlay = element('overlay')
  private title = element('overlay-title')
  private body = element('overlay-body')

  update(game: Game): void {
    this.distance.textContent = Math.floor(game.distance).toString()

    const age = game.skater.trickAge
    if (age < 1.1 && game.skater.trick) {
      this.trick.textContent = game.skater.trick
      this.trick.style.opacity = (1 - age / 1.1).toFixed(2)
    } else {
      this.trick.style.opacity = '0'
    }
  }

  showReady(): void {
    this.title.textContent = 'Regarde par la fenetre'
    this.body.textContent = "La voiture ne t'attend pas."
    this.overlay.dataset.visible = 'true'
  }

  showDead(distance: number, best: number): void {
    this.title.textContent = `${Math.floor(distance)} m`
    this.body.textContent = best > distance ? `Record ${Math.floor(best)} m` : 'Nouveau record'
    this.overlay.dataset.visible = 'true'
  }

  hideOverlay(): void {
    this.overlay.dataset.visible = 'false'
  }
}
