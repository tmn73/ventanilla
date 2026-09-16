import type { Game } from '../game/game'

function element(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing element #${id}`)
  return found
}

export class Hud {
  private distance = element('distance')
  private speedFill = element('speed-fill')
  private trick = element('trick')
  private overlay = element('overlay')
  private title = element('overlay-title')
  private body = element('overlay-body')

  update(game: Game): void {
    this.distance.textContent = Math.floor(game.distance).toString()

    const pace = game.skater.vx / Math.max(1, game.car.speed)
    const fill = Math.max(0, Math.min(1, pace / 1.4))
    this.speedFill.style.transform = `scaleX(${fill.toFixed(3)})`
    this.speedFill.dataset.losing = pace < 1 ? 'true' : 'false'

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
    this.body.textContent = 'La voiture avance sans toi. Grind pour tenir le rythme.'
    this.overlay.dataset.visible = 'true'
  }

  showDead(distance: number, best: number): void {
    this.title.textContent = `${Math.floor(distance)} m`
    this.body.textContent =
      best > distance
        ? `La voiture t'a seme. Ton record tient a ${Math.floor(best)} m.`
        : 'La voiture t a seme. Nouveau record.'
    this.overlay.dataset.visible = 'true'
  }

  hideOverlay(): void {
    this.overlay.dataset.visible = 'false'
  }
}
