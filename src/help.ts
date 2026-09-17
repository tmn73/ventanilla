/**
 * The controls, behind a button, and the pause screen. They are the same
 * panel: the game has one interruption, so it has one screen for it.
 */
export function mountHelp(
  onPause: (paused: boolean) => void,
  onStance: (stance: 1 | -1) => void,
): void {
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

  // Stance is a preference, so it is remembered per browser and never shared.
  const regular = document.getElementById('stance-regular')
  const goofy = document.getElementById('stance-goofy')
  if (regular && goofy) {
    const applyStance = (value: 1 | -1, remember: boolean) => {
      regular.setAttribute('aria-pressed', String(value === 1))
      goofy.setAttribute('aria-pressed', String(value === -1))
      onStance(value)
      if (!remember) return
      try {
        localStorage.setItem('ventanilla.stance', value === 1 ? 'regular' : 'goofy')
      } catch {
        // A private window refuses this. The choice still applies for now.
      }
    }

    let saved: string | null = null
    try {
      saved = localStorage.getItem('ventanilla.stance')
    } catch {
      saved = null
    }
    applyStance(saved === 'goofy' ? -1 : 1, false)

    for (const [button, value] of [
      [regular, 1],
      [goofy, -1],
    ] as Array<[HTMLElement, 1 | -1]>) {
      button.addEventListener('pointerdown', (event) => event.stopPropagation())
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        applyStance(value, true)
      })
    }
  }

  const setOpen = (open: boolean) => {
    panel.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
    onPause(open)
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
    if (event.key !== 'Escape') return
    event.preventDefault()
    setOpen(panel.hidden)
  })
}
