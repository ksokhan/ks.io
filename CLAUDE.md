# ks.io

Plain static site, no build, no dependencies. Netlify publishes `public/` (see `netlify.toml`).

- Run: `python3 -m http.server 8000 -d public`, open http://localhost:8000
- Test: no automated tests. Check in a browser: intro typing, editing the page
  (first edit gets the note, later ones a look), reset button, link clicks, /beliefs, light/dark toggle, mobile width.
- Copy changes: edit the HTML. On pages with `data-typeout` on `<main>` (homepage only)
  the first section is typed out on load and the rest fades in line by line (Esc or a
  touch tap skips, the top-right icon replays); `data-typo="Kon|ts"` makes the caret type "ts" by mistake
  after "Kon" and fix it. Speed
  (`WPM_START`, `WPM_END`, `RAMP_CHARS`) and the one-time note to visitors (`NOTE`)
  are at the top of `public/live.js`.
- Header typing can replay a real recording: type it at `/record-typing.html`, paste the
  output into `public/recording.js` (`null` = built-in typing; `PLAYBACK_RATE` in live.js).
- State persists per page in localStorage (`ksio:<path>`): the typed-out flag and the
  visitor's edits, tied to a hash of the page's HTML. To see the intro again, clear it
  (`localStorage.clear()`) or change the page's copy.
- Plausible analytics script is blocked in this container; abort it in Playwright
  (`route(/plausible/, r => r.abort())`) and use `waitUntil: 'domcontentloaded'`.
