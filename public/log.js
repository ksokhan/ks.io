// Design log: a history icon top right opens a panel listing checkpoints of
// the site's design (built by scripts/build-log.mjs into /log/<n>/).
// Choosing one shows that version, running for real, in a frame behind the
// panel, until "Return to live site". The live page, edits included, is
// left as it was.
;(() => {
  const root = document.documentElement
  let entries = null // loaded on first open

  // Feather icons (MIT): clock, x.
  const CLOCK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
  const CLOSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'log-toggle'
  toggle.setAttribute('aria-label', 'Design log')
  toggle.setAttribute('aria-expanded', 'false')
  toggle.title = 'Design log'
  toggle.innerHTML = CLOCK

  const panel = document.createElement('aside')
  panel.className = 'log-panel'
  panel.setAttribute('aria-label', 'Design log')
  panel.hidden = true
  panel.innerHTML = `
    <header class="log-head">
      <h2 class="log-title">Design log</h2>
      <button type="button" class="log-close" aria-label="Close the design log">${CLOSE}</button>
    </header>
    <p class="log-blurb">A log of my design exploration as I built this site.</p>
    <ol class="log-list" aria-label="Checkpoints"></ol>`
  const list = panel.querySelector('.log-list')

  const frame = document.createElement('iframe')
  frame.className = 'log-frame'
  frame.title = 'An earlier version of this site'
  frame.hidden = true

  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'log-return'
  back.textContent = 'Return to live site'
  back.hidden = true

  document.body.append(frame, panel, back, toggle)
  document.body.classList.add('has-log')

  // --- Panel ---------------------------------------------------------------

  let current = null // id of the checkpoint being viewed; null = live

  async function open() {
    if (!entries) {
      try {
        const res = await fetch('/log/index.json')
        if (!res.ok) throw new Error(res.status)
        entries = (await res.json()).reverse() // newest first
      } catch (e) {
        entries = []
        list.innerHTML = '<li class="log-empty">The log couldn’t load. Try again in a moment.</li>'
      }
      render()
    }
    panel.hidden = false
    requestAnimationFrame(() => panel.classList.add('is-open'))
    toggle.setAttribute('aria-expanded', 'true')
    panel.querySelector('.log-close').focus({ preventScroll: true })
  }

  function close() {
    panel.classList.remove('is-open')
    toggle.setAttribute('aria-expanded', 'false')
    setTimeout(() => {
      if (!panel.classList.contains('is-open')) panel.hidden = true
    }, 320)
  }

  function render() {
    if (!entries.length) return
    const item = (id, label, caption, date = '') => `
      <li>
        <button type="button" class="log-item" data-id="${id}" aria-current="${current === id}"${date ? ` title="${date}"` : ''}>
          <span class="log-date">${label}</span>
          <span class="log-caption">${caption}</span>
        </button>
      </li>`
    list.innerHTML =
      item('live', 'Now', 'The live site, as it is today.') +
      entries.map((e) => item(e.id, roundLabel(e.id), escapeHtml(e.caption), formatDate(e.date))).join('')
    list.querySelectorAll('.log-item').forEach((b) => {
      b.setAttribute('aria-current', String((current || 'live') === b.dataset.id))
    })
  }

  // The first checkpoint is the site before this redesign; the rest are
  // rounds of exploration, numbered from 1.
  function roundLabel(id) {
    const n = Number(id) - 1
    return n === 0 ? 'Before' : `Round ${n}`
  }

  function formatDate(iso) {
    const d = new Date(`${iso}T12:00:00`)
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  }

  // --- Viewing a checkpoint -------------------------------------------------

  function show(id) {
    if (id === 'live') return returnToLive()
    const entry = entries.find((e) => e.id === id)
    if (!entry) return
    current = id
    frame.src = entry.path
    frame.hidden = false
    back.hidden = false
    document.body.classList.add('is-viewing-log')
    render()
    // On narrow screens the panel covers everything: get out of the way.
    if (matchMedia('(max-width: 720px)').matches) close()
  }

  function returnToLive() {
    current = null
    frame.hidden = true
    frame.removeAttribute('src')
    back.hidden = true
    document.body.classList.remove('is-viewing-log')
    if (entries) render()
  }

  // --- Events ---------------------------------------------------------------

  toggle.addEventListener('click', () => (panel.classList.contains('is-open') ? close() : open()))
  panel.querySelector('.log-close').addEventListener('click', close)
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.log-item')
    if (item) show(item.dataset.id)
  })
  back.addEventListener('click', returnToLive)
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (panel.classList.contains('is-open')) close()
    else if (current) returnToLive()
  })

  // Keep the theme in step if it's toggled while viewing an old version.
  new MutationObserver(() => {
    if (!current) return
    try {
      const doc = frame.contentDocument
      if (!doc) return
      if (root.dataset.theme) doc.documentElement.dataset.theme = root.dataset.theme
      else delete doc.documentElement.dataset.theme
    } catch (e) {
      // Not reachable (shouldn't happen: same origin). Leave it be.
    }
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] })
})()
