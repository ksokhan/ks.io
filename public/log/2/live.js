// The page is one contenteditable document. "Me" is a custom caret that
// types the opening line, pastes the rest, then types a little more. When a
// visitor edits, my caret waits for them to pause, types a cheeky line next to
// their edit, then carries on with whatever it was doing.
;(() => {
  const doc = document.querySelector('.doc')
  if (!doc) return

  // --- Tunables -------------------------------------------------------------

  const CALM_MS = 900 // how long a visitor must pause before I move again
  const REACT_DELAY_MS = 1100 // pause after their last edit before I react
  const REACT_COOLDOWN_MS = 5000
  const MAX_REACTIONS = 4

  const LINES = {
    first: ['Oh, hi. Make yourself at home.'],
    insert: ['Ooh, I like that.', 'You type faster than me.', 'Careful, I might keep that.'],
    delete: ['Hey, I was using that.', 'Bold edit. Respect.', 'Less is more, I suppose.'],
    wipe: ['Minimalism. I respect it.'],
    last: ['There’s a reset button up there, by the way.'],
  }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const pristine = doc.innerHTML
  const pristineLength = doc.textContent.trim().length

  // --- My caret -------------------------------------------------------------

  const caret = document.createElement('div')
  caret.className = 'me is-idle'
  caret.setAttribute('aria-hidden', 'true')
  document.body.append(caret)

  // A live Range: the DOM keeps it valid as the visitor edits around it.
  let me = document.createRange()

  function rectAt(range) {
    const r = range.cloneRange()
    r.collapse(true)
    const own = r.getClientRects()[0]
    if (own && own.height) return { x: own.left, y: own.top, h: own.height }

    // Collapsed ranges at text edges often have no rect; measure a neighbour.
    const { startContainer: node, startOffset: offset } = r
    if (node.nodeType === Node.TEXT_NODE) {
      const q = document.createRange()
      if (offset > 0) {
        q.setStart(node, offset - 1)
        q.setEnd(node, offset)
        const rects = q.getClientRects()
        const b = rects[rects.length - 1]
        if (b && b.height) return { x: b.right, y: b.top, h: b.height }
      }
      if (offset < node.length) {
        q.setStart(node, offset)
        q.setEnd(node, offset + 1)
        const b = q.getClientRects()[0]
        if (b && b.height) return { x: b.left, y: b.top, h: b.height }
      }
    }

    // Empty element: sit at its content-box start, one line tall.
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
    const cs = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    const size = parseFloat(cs.fontSize)
    const line = parseFloat(cs.lineHeight) || size * 1.45
    const h = size * 1.2
    return {
      x: box.left + parseFloat(cs.paddingLeft),
      y: box.top + parseFloat(cs.paddingTop) + (line - h) / 2,
      h,
    }
  }

  function place() {
    if (!doc.contains(me.startContainer)) {
      caret.hidden = true
      return
    }
    caret.hidden = false
    const { x, y, h } = rectAt(me)
    caret.style.height = `${h}px`
    caret.style.transform = `translate(${x + scrollX - 1}px, ${y + scrollY}px)`
  }

  let placeQueued = false
  function schedulePlace() {
    if (placeQueued) return
    placeQueued = true
    requestAnimationFrame(() => {
      placeQueued = false
      place()
    })
  }

  function setIdle(idle) {
    caret.classList.toggle('is-idle', idle)
  }

  function moveTo(range) {
    me = range
    place()
  }

  // End of an element's text. Prefer a position inside the last text node:
  // element-boundary positions have no client rect to measure the caret from.
  function rangeAtEnd(el) {
    const r = document.createRange()
    let node = el
    while (node.lastChild && node.lastChild.nodeType !== Node.COMMENT_NODE) node = node.lastChild
    if (node.nodeType === Node.TEXT_NODE) {
      r.setStart(node, node.length)
    } else {
      r.selectNodeContents(el)
      r.collapse(false)
    }
    return r
  }

  // Insert text at a range without touching the visitor's selection or the
  // undo stack, then leave the range collapsed after the new text.
  function insertAt(range, text) {
    let node = range.startContainer
    let offset = range.startOffset
    if (node.nodeType !== Node.TEXT_NODE) {
      const before = node.childNodes[offset - 1]
      if (before && before.nodeType === Node.TEXT_NODE) {
        node = before
        offset = before.length
      } else {
        node = document.createTextNode('')
        range.insertNode(node)
        offset = 0
      }
    }
    node.insertData(offset, text)
    range.setStart(node, offset + text.length)
    range.collapse(true)
  }

  // --- Script runner --------------------------------------------------------
  // A queue of steps. Typing pauses while the visitor is typing, and yields to
  // a pending reaction mid-word; the unfinished step stays queued so I pick up
  // where I left off afterwards.

  let queue = []
  let pendingReaction = null
  let running = false
  let generation = 0 // bumped on reset so stale steps drop out
  let lastInput = 0

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  async function calm() {
    while (Date.now() - lastInput < CALM_MS) {
      setIdle(true)
      await sleep(100)
    }
  }

  function charDelay(ch, next) {
    let ms = 45 + Math.random() * 70
    if (ch === ' ' && Math.random() < 0.15) ms += 120
    if (/[.,!?)]/.test(ch) && next) ms += 220
    return ms
  }

  function typeStep(range, text, { interruptible = true } = {}) {
    return {
      async run(gen) {
        moveTo(range)
        while (text) {
          if (gen !== generation) return true
          if (interruptible && pendingReaction) return false
          if (Date.now() - lastInput < CALM_MS) {
            await calm()
            continue
          }
          setIdle(false)
          moveTo(range)
          insertAt(range, text[0])
          place()
          const ch = text[0]
          text = text.slice(1)
          await sleep(charDelay(ch, text[0]))
        }
        return true
      },
    }
  }

  const waitStep = (ms) => ({
    async run() {
      setIdle(true)
      await sleep(ms)
      return true
    },
  })

  const doStep = (fn) => ({
    async run() {
      fn()
      return true
    },
  })

  async function loop() {
    if (running) return
    running = true
    const gen = generation
    while (gen === generation) {
      await calm()
      if (gen !== generation) break
      if (pendingReaction) {
        const step = pendingReaction
        await step.run(gen)
        pendingReaction = null
        lastReactionAt = Date.now()
        continue
      }
      const step = queue[0]
      if (!step) break
      const done = await step.run(gen)
      if (done && gen === generation) queue.shift()
    }
    running = false
    setIdle(true)
    // A reset may have queued new work while the old loop was winding down.
    if (gen !== generation && (queue.length || pendingReaction)) loop()
  }

  // --- Intro ----------------------------------------------------------------

  function startIntro() {
    const intro = doc.querySelector('[data-intro]')
    const later = doc.querySelector('[data-later]')
    const introText = intro ? intro.textContent : ''
    const laterText = later ? later.textContent : ''

    if (reducedMotion || !intro) {
      doc.classList.add('is-ready')
      moveTo(rangeAtEnd(intro || doc))
      return
    }

    intro.textContent = ''
    if (later) later.textContent = ''
    doc.classList.add('is-intro', 'is-ready')
    moveTo(rangeAtEnd(intro))

    queue.push(waitStep(700), typeStep(rangeAtEnd(intro), introText), waitStep(450))
    queue.push(
      doStep(() => {
        doc.classList.remove('is-intro')
        place()
      })
    )
    if (later) {
      queue.push(waitStep(900), typeStep(rangeAtEnd(later), laterText))
    }
    loop()
  }

  // --- Reacting to visitors -------------------------------------------------

  let reactions = 0
  let lastReactionAt = 0
  let lastEditKind = 'insert'
  let lastEditBlock = null
  let reactTimer = 0
  const used = new Set()

  function pick(kind) {
    const pool = LINES[kind].filter((l) => !used.has(l))
    const line = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
    if (line) used.add(line)
    return line
  }

  function editedBlock() {
    const sel = getSelection()
    if (!sel.rangeCount) return null
    let node = sel.getRangeAt(0).startContainer
    if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement
    const block = node && node.closest('li, p, .label')
    return block && doc.contains(block) ? block : null
  }

  // Make an empty muted line next to the visitor's edit for me to type into.
  function makeAside(block) {
    if (block && block.classList.contains('label')) {
      const list = block.parentElement.querySelector('.items')
      if (list) {
        const el = document.createElement(list.tagName === 'UL' ? 'li' : 'p')
        el.className = 'aside'
        list.append(el)
        return el
      }
    } else if (block) {
      const el = document.createElement(block.tagName === 'LI' ? 'li' : 'p')
      el.className = 'aside'
      block.after(el)
      return el
    }
    const el = document.createElement('p')
    el.className = 'aside'
    doc.append(el)
    return el
  }

  function maybeReact() {
    if (pendingReaction || reactions >= MAX_REACTIONS) return
    const since = Date.now() - lastReactionAt
    if (since < REACT_COOLDOWN_MS) {
      reactTimer = setTimeout(maybeReact, REACT_COOLDOWN_MS - since)
      return
    }

    const wiped = doc.textContent.trim().length < pristineLength * 0.25
    let kind = reactions === 0 ? 'first' : wiped ? 'wipe' : lastEditKind
    if (reactions === MAX_REACTIONS - 1) kind = 'last'
    const line = pick(kind) || pick(lastEditKind)
    if (!line) return
    reactions++

    const block = lastEditBlock && doc.contains(lastEditBlock) ? lastEditBlock : null
    pendingReaction = {
      async run(gen) {
        await sleep(250)
        if (gen !== generation) return
        const aside = makeAside(block)
        await typeStep(rangeAtEnd(aside), line, { interruptible: false }).run(gen)
        await sleep(600)
      },
    }
    loop()
  }

  // --- Reset ----------------------------------------------------------------

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'reset'
  reset.textContent = 'reset'
  reset.hidden = true
  document.body.append(reset)

  reset.addEventListener('click', () => {
    generation++
    queue = []
    pendingReaction = null
    clearTimeout(reactTimer)
    doc.classList.remove('is-intro')
    doc.innerHTML = pristine
    reset.hidden = true
    const intro = doc.querySelector('[data-intro]')
    moveTo(rangeAtEnd(intro || doc))
    setIdle(true)
  })

  // --- Events ---------------------------------------------------------------

  doc.addEventListener('input', (e) => {
    lastInput = Date.now()
    lastEditKind = e.inputType && e.inputType.startsWith('delete') ? 'delete' : 'insert'
    lastEditBlock = editedBlock() || lastEditBlock
    // If they start editing mid-intro, skip straight to the "pasted" page.
    doc.classList.remove('is-intro')
    reset.hidden = false
    schedulePlace()
    clearTimeout(reactTimer)
    reactTimer = setTimeout(maybeReact, REACT_DELAY_MS)
  })

  // Keep it a plain-text document: no bold/italic, paste as text.
  doc.addEventListener('beforeinput', (e) => {
    if (e.inputType.startsWith('format')) e.preventDefault()
  })
  doc.addEventListener('paste', (e) => {
    e.preventDefault()
    const text = e.clipboardData ? e.clipboardData.getData('text/plain') : ''
    if (text) document.execCommand('insertText', false, text)
  })

  // Links still work inside the editable document: a plain click follows the
  // link; dragging to select or editing with the keyboard doesn't.
  doc.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]')
    if (!link || e.detail > 1 || !getSelection().isCollapsed) return
    e.preventDefault()
    if (link.target === '_blank' || e.metaKey || e.ctrlKey) {
      window.open(link.href, '_blank', 'noopener')
    } else {
      location.href = link.href
    }
  })

  addEventListener('resize', schedulePlace)
  new ResizeObserver(schedulePlace).observe(doc)

  // Wait for fonts so the typing doesn't reflow under the caret.
  ;(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    startIntro()
    place()
  })
})()
