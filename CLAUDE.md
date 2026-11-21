# ks.io

Plain static site, no build, no dependencies. Netlify publishes `public/` (see `netlify.toml`).

- Run: `python3 -m http.server 8000 -d public`, open http://localhost:8000
- Test: no automated tests. Check in a browser: intro typing, editing the page
  (my caret reacts), reset button, link clicks, /beliefs, light/dark toggle, mobile width.
- Copy changes: edit the HTML; the whole page is typed out on load. `data-typo="Kon|ts"`
  makes the caret type "ts" by mistake after "Kon" and fix it. Speed
  (`WPM_START`, `WPM_END`, `RAMP_CHARS`) and the cheeky reaction lines (`LINES`)
  are at the top of `public/live.js`.
- Plausible analytics script is blocked in this container; abort it in Playwright
  (`route(/plausible/, r => r.abort())`) and use `waitUntil: 'domcontentloaded'`.
