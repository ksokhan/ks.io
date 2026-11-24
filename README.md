# ks.io

My personal site. A plain static site with no build step and no dependencies.

The homepage is one editable document: a caret ("me") types the opening line,
pastes the rest, and reacts when visitors edit the page.

## Run locally

```sh
python3 -m http.server 8000 -d public
```

Then open http://localhost:8000. Any static server works; it needs to serve
`public/` at the root, since asset paths are absolute.

## Layout

- `public/index.html`, `public/beliefs/index.html`: the two pages
- `public/site.css`: the shared visual system (dark, plus light via OS setting or toggle)
- `public/live.js`: the live typing, visitor reactions and reset button
- `public/theme.js`: the light/dark toggle
- `public/fonts/`: self-hosted Public Sans 300 and Inconsolata 400 (OFL)

Deployed on Netlify; `netlify.toml` publishes `public/` with no build command.
