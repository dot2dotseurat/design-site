# design-site

Materials mood board for the renovation. Static site: `index.html` + `app.js` read `data.json`.

- `data.json` — one entry per material option. `id` matches the ID column in the budget spreadsheet.
- `img/` — product and install photos from each vendor's product page (resized).
- Prices, stock and ship times were checked on the date in `data.json` (`checked`). Confirm before ordering.

Run locally: `python3 -m http.server` and open http://localhost:8000.

Pages: Materials (`index.html`), Budget (`budget.html`: square footage in, boxes and cost out, with saved scenarios and a CSV download), Palettes (`palettes.html`).

What counts as a good fit is written down in `REQUIREMENTS.md`; each item's `fit` in `data.json` follows it.
