// The page is one contenteditable document. "Me" is a custom caret that
// types the whole page out on load (fumbling one word early on). When a
// visitor edits, my caret waits for them to pause, types a cheeky line next to
// their edit, then carries on with whatever it was doing.
;(() => {
  const doc = document.querySelector('.doc')
  if (!doc) return

  // --- Tunables -------------------------------------------------------------

  const WPM = 120 // typing speed (a "word" is 5 characters)
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

  // Text nodes that are content, in document order. Whitespace-only nodes
  // with a newline are just HTML indentation between tags, so skip those.
  function textNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes = []
    while (walker.nextNode()) {
      const n = walker.currentNode
      if (/\S/.test(n.data) || !n.data.includes('\n')) nodes.push(n)
    }
    return nodes
  }

  function rangeIn(node, offset) {
    const r = document.createRange()
    r.setStart(node, offset)
    return r
  }

  // End of an element's text. Prefer a position inside the last text node:
  // element-boundary positions have no client rect to measure the caret from.
  function rangeAtEnd(el) {
    const last = textNodes(el).pop()
    if (last) return rangeIn(last, last.length)
    const r = document.createRange()
    r.selectNodeContents(el)
    r.collapse(false)
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

  function backspaceAt(range) {
    const node = range.startContainer
    const offset = range.startOffset
    if (node.nodeType !== Node.TEXT_NODE || offset === 0) return
    node.deleteData(offset - 1, 1)
    range.setStart(node, offset - 1)
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

  const BACKSPACE = '\b'
  const MS_PER_CHAR = 60000 / (WPM * 5)

  // Uneven but averaging WPM, with a beat after sentence punctuation.
  function charDelay(ch, next) {
    let ms = MS_PER_CHAR * (0.5 + Math.random())
    if (/[.!?]/.test(ch) && next === ' ') ms += 160
    return ms
  }

  // tokens: an array of characters, BACKSPACE, or { pause: ms }.
  function typeStep(range, tokens, { interruptible = true } = {}) {
    let text = typeof tokens === 'string' ? [...tokens] : tokens
    return {
      async run(gen) {
        moveTo(range)
        while (text.length) {
          if (gen !== generation) return true
          if (interruptible && pendingReaction) return false
          if (Date.now() - lastInput < CALM_MS) {
            await calm()
            continue
          }
          const token = text[0]
          text = text.slice(1)
          if (typeof token === 'object') {
            setIdle(true)
            await sleep(token.pause)
            continue
          }
          setIdle(false)
          moveTo(range)
          if (token === BACKSPACE) backspaceAt(range)
          else insertAt(range, token)
          place()
          await sleep(token === BACKSPACE ? MS_PER_CHAR * 0.8 : charDelay(token, text[0]))
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

  // data-typo="Kon|ts" on an element: after typing "Kon", type "ts" by
  // mistake, notice, backspace it, then carry on.
  function withTypo(text, spec) {
    const [prefix, wrong] = (spec || '').split('|')
    const at = prefix && wrong ? text.indexOf(prefix) : -1
    if (at < 0) return [...text]
    const cut = at + prefix.length
    return [
      ...text.slice(0, cut),
      ...wrong,
      { pause: 420 },
      ...BACKSPACE.repeat(wrong.length),
      { pause: 120 },
      ...text.slice(cut),
    ]
  }

  const blockOf = (n) => n.parentElement.closest('li, p, .label')
  const sectionOf = (n) => n.parentElement.closest('section') || doc

  // Empty every text node, then type them back in order, with a short beat
  // between lines and a longer one between sections.
  function startIntro() {
    const nodes = textNodes(doc)
    doc.classList.add('is-ready')
    if (reducedMotion || !nodes.length) {
      moveTo(rangeAtEnd(doc))
      return
    }

    const jobs = nodes.map((n) => {
      const text = n.data.replace(/\s+/g, ' ')
      n.data = ''
      return { n, text }
    })
    moveTo(rangeIn(jobs[0].n, 0))
    queue.push(waitStep(600))

    const typoUsed = new Set()
    jobs.forEach(({ n, text }, i) => {
      const typoEl = n.parentElement.closest('[data-typo]')
      let tokens = [...text]
      if (typoEl && !typoUsed.has(typoEl) && text.includes(typoEl.dataset.typo.split('|')[0])) {
        typoUsed.add(typoEl)
        tokens = withTypo(text, typoEl.dataset.typo)
      }
      queue.push(typeStep(rangeIn(n, 0), tokens))

      const next = jobs[i + 1]
      if (!next) return
      if (sectionOf(n) !== sectionOf(next.n)) queue.push(waitStep(380))
      else if (blockOf(n) !== blockOf(next.n)) queue.push(waitStep(160))
    })
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
    doc.innerHTML = pristine
    reset.hidden = true
    moveTo(rangeAtEnd(doc))
    setIdle(true)
  })

  // --- Events ---------------------------------------------------------------

  doc.addEventListener('input', (e) => {
    lastInput = Date.now()
    lastEditKind = e.inputType && e.inputType.startsWith('delete') ? 'delete' : 'insert'
    lastEditBlock = editedBlock() || lastEditBlock
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
