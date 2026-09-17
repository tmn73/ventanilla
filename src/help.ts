/**
 * The controls, behind a button, and the pause screen. They are the same
 * panel: the game has one interruption, so it has one screen for it.
 */
export function mountHelp(
  onPause: (paused: boolean) => void,
  onStance: (stance: 1 | -1) => void,
  onCourse: (course: string) => void,
  onZoom: (zoom: number) => void,
  onPitch: (pitch: number) => void,
  onRewind: (held: boolean) => void,
  onSky: (sky: string) => void,
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

  // Which road to ride is a preference too, and picking one starts it fresh.
  const courses = ['street', 'flat', 'rails']
  const buttons = courses.map((name) => document.getElementById(`course-${name}`))
  if (buttons.every(Boolean)) {
    const applyCourse = (value: string, remember: boolean) => {
      buttons.forEach((button, i) => button!.setAttribute('aria-pressed', String(courses[i] === value)))
      onCourse(value)
      if (!remember) return
      try {
        localStorage.setItem('ventanilla.course', value)
      } catch {
        // A private window refuses this. The choice still applies for now.
      }
    }

    let saved: string | null = null
    try {
      saved = localStorage.getItem('ventanilla.course')
    } catch {
      saved = null
    }
    applyCourse(saved && courses.includes(saved) ? saved : 'street', false)

    buttons.forEach((button, i) => {
      button!.addEventListener('pointerdown', (event) => event.stopPropagation())
      button!.addEventListener('click', (event) => {
        event.stopPropagation()
        applyCourse(courses[i]!, true)
      })
    })
  }

  // How much road the window shows. It applies as the slider moves, so the
  // choice is made by looking at it rather than by reading a number.
  const zoom = document.getElementById('zoom') as HTMLInputElement | null
  if (zoom) {
    const applyZoom = (value: number, remember: boolean) => {
      zoom.value = String(value)
      onZoom(value)
      if (!remember) return
      try {
        localStorage.setItem('ventanilla.zoom', String(value))
      } catch {
        // A private window refuses this. The choice still applies for now.
      }
    }

    let saved: string | null = null
    try {
      saved = localStorage.getItem('ventanilla.zoom')
    } catch {
      saved = null
    }
    const start = Number(saved)
    applyZoom(Number.isFinite(start) && start > 0 ? start : 1, false)

    zoom.addEventListener('pointerdown', (event) => event.stopPropagation())
    zoom.addEventListener('input', () => applyZoom(Number(zoom.value), true))
  }

  const pitch = document.getElementById('pitch') as HTMLInputElement | null
  if (pitch) {
    const applyPitch = (value: number, remember: boolean) => {
      pitch.value = String(value)
      onPitch(value)
      if (!remember) return
      try {
        localStorage.setItem('ventanilla.pitch', String(value))
      } catch {
        // A private window refuses this. The choice still applies for now.
      }
    }

    let saved: string | null = null
    try {
      saved = localStorage.getItem('ventanilla.pitch')
    } catch {
      saved = null
    }
    const start = Number(saved)
    applyPitch(Number.isFinite(start) && saved !== null ? start : 0.3, false)

    pitch.addEventListener('pointerdown', (event) => event.stopPropagation())
    pitch.addEventListener('input', () => applyPitch(Number(pitch.value), true))
  }

  // Held, not tapped: winding back is something you watch and stop when you
  // see the moment you wanted.
  const rewind = document.getElementById('rewind')
  if (rewind) {
    const set = (held: boolean) => {
      rewind.setAttribute('aria-pressed', String(held))
      onRewind(held)
    }
    rewind.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      event.preventDefault()
      set(true)
    })
    for (const end of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      rewind.addEventListener(end, () => set(false))
    }
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyR' && !event.repeat) set(true)
    })
    window.addEventListener('keyup', (event) => {
      if (event.code === 'KeyR') set(false)
    })
  }

  // Which sky, which is also which light. Remembered per browser.
  const skies = ['day', 'sunset', 'dusk']
  const skyButtons = skies.map((name) => document.getElementById(`sky-${name}`))
  if (skyButtons.every(Boolean)) {
    const applySky = (value: string, remember: boolean) => {
      skyButtons.forEach((b, i) => b!.setAttribute('aria-pressed', String(skies[i] === value)))
      onSky(value)
      if (!remember) return
      try {
        localStorage.setItem('ventanilla.sky', value)
      } catch {
        // A private window refuses this. The choice still applies for now.
      }
    }

    let saved: string | null = null
    try {
      saved = localStorage.getItem('ventanilla.sky')
    } catch {
      saved = null
    }
    applySky(saved && skies.includes(saved) ? saved : 'day', false)

    skyButtons.forEach((button, i) => {
      button!.addEventListener('pointerdown', (event) => event.stopPropagation())
      button!.addEventListener('click', (event) => {
        event.stopPropagation()
        applySky(skies[i]!, true)
      })
    })
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
