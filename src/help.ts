/**
 * The controls, behind a button. The game itself carries no text beyond the
 * distance, so the reference has to be somewhere the player can ask for it.
 */
export function mountHelp(): void {
  const toggle = document.getElementById('help-toggle')
  const panel = document.getElementById('help')
  const tabs = [
    { button: document.getElementById('tab-keys'), table: document.getElementById('panel-keys') },
    { button: document.getElementById('tab-touch'), table: document.getElementById('panel-touch') },
  ]
  if (!toggle || !panel || tabs.some((tab) => !tab.button || !tab.table)) return

  const show = (index: number) => {
    tabs.forEach((tab, i) => {
      tab.button!.setAttribute('aria-selected', String(i === index))
      ;(tab.table as HTMLElement).hidden = i !== index
    })
  }

  // Open on the half that matches the device, rather than always the keyboard.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  show(coarse ? 1 : 0)

  tabs.forEach((tab, index) => {
    tab.button!.addEventListener('pointerdown', (event) => event.stopPropagation())
    tab.button!.addEventListener('click', (event) => {
      event.stopPropagation()
      show(index)
    })
  })

  const setOpen = (open: boolean) => {
    panel.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
  }

  toggle.addEventListener('pointerdown', (event) => event.stopPropagation())
  toggle.addEventListener('click', (event) => {
    event.stopPropagation()
    setOpen(panel.hidden)
  })

  // Anywhere outside the sheet closes it, including a tap on a phone.
  panel.addEventListener('pointerdown', (event) => {
    event.stopPropagation()
    if (!(event.target as HTMLElement).closest('.sheet')) setOpen(false)
  })

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false)
  })
}
