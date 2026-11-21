# ks.io

Plain static site, no build, no dependencies. Netlify publishes `public/` (see `netlify.toml`).

- Run: `python3 -m http.server 8000 -d public`, open http://localhost:8000
- Test: no automated tests. Check in a browser: intro typing, editing the page
  (my caret reacts), reset button, link clicks, /beliefs, light/dark toggle, mobile width.
- Copy changes: edit the HTML. `data-intro` marks the line typed on load, `data-later`
  the line typed after the paste. Cheeky reaction lines are in `LINES` in `public/live.js`.
- Plausible analytics script is blocked in this container; abort it in Playwright
  (`route(/plausible/, r => r.abort())`) and use `waitUntil: 'domcontentloaded'`.
