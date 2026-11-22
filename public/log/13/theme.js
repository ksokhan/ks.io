// Light/dark toggle. The page follows the OS by default; a click stores an
// explicit choice, and choosing the OS's own theme again clears it so the page
// goes back to following the OS. The stored choice is applied in <head>
// before first paint (see the inline script in each page).
;(() => {
  const root = document.documentElement
  const osLight = matchMedia('(prefers-color-scheme: light)')

  // Feather icons (MIT): sun, moon.
  const SUN =
    '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
  const MOON =
    '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'theme'
  button.innerHTML = SUN + MOON
  document.body.append(button)

  const current = () => root.dataset.theme || (osLight.matches ? 'light' : 'dark')

  function render() {
    const dark = current() === 'dark'
    root.classList.toggle('is-dark', dark)
    button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme')
    button.title = button.getAttribute('aria-label')
    // Keep the mobile browser chrome in step with an explicit choice.
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (root.dataset.theme) m.content = bg
    })
  }

  button.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark'
    const os = osLight.matches ? 'light' : 'dark'
    try {
      if (next === os) {
        delete root.dataset.theme
        localStorage.removeItem('theme')
      } else {
        root.dataset.theme = next
        localStorage.setItem('theme', next)
      }
    } catch (e) {
      // Storage can be blocked (private mode); the toggle still works per page.
      if (next === os) delete root.dataset.theme
      else root.dataset.theme = next
    }
    render()
  })

  osLight.addEventListener('change', render)
  render()
})()
