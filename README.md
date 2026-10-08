# design-site

Materials mood board for the renovation. Static site: `index.html` + `app.js` read `data.json`.

- `data.json` — one entry per material option. `id` matches the ID column in the budget spreadsheet.
- `img/` — product and install photos from each vendor's product page (resized).
- Prices, stock and ship times were checked on the date in `data.json` (`checked`). Confirm before ordering.

Run locally: `python3 scripts/serve.py` and open http://localhost:8000. This adds a Hide / Unhide button to each card that saves `hidden: true` into `data.json`; hidden items stay out of the board unless "Show hidden and poor fits" is ticked. A plain `python3 -m http.server`, or the published site, shows no Hide buttons.

Pages: Materials (`index.html`), Budget (`budget.html`: square footage in, boxes and cost out, named scenarios, who orders what, CSV download), Layout (`layout.html`: lay board tiles on shower walls with cutouts, liners and a niche, with tile and cut counts, a layout optimizer, requirements and a handoff to the Budget; the maths is in `layout-engine.js`), One-pager (`summary.html`: a printable materials list for your GC or designer), Palettes (`palettes.html`).

Budget scenarios save in the browser by default. To store them in Supabase, with a read-only share link per scenario, follow `docs/supabase-setup.md` and fill in `supabase-config.js`.

What counts as a good fit is written down in `REQUIREMENTS.md`. Each item's `specs` block holds typed facts, and `python3 scripts/check_fit.py` computes `fit` from them using `fit-rules.json`; run it after editing `data.json` (`--check` verifies it is current).
