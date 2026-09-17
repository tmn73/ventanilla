/**
 * The controls, behind a button. The game itself carries no text beyond the
 * distance, so the reference has to be somewhere the player can ask for it.
 */
export function mountHelp(): void {
  const toggle = document.getElementById('help-toggle')
  const panel = document.getElementById('help')
  if (!toggle || !panel) return

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
