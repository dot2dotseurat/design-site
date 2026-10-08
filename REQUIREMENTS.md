# What counts as a good fit

One rubric for every tile, wallcovering and liner on the board. Each item's `fit.level` in `data.json` comes from these rules, and `fit.notes` says which rule it passed or missed.

The context is a NYC renovation with kids: freeze/thaw outdoors, wet floors indoors, hands at kid height. The thresholds marked **(assumption)** are my defaults; change them here and every item gets re-checked against the new number.

## Verify on the product page, not the listing

Vendor tags, search snippets and marketing copy contradict the product page. Zia tags every ceramic "Outdoor-Freeze-Thaw" and its descriptions say "as well as freeze and thaw", but the usage panel on each page marks exterior freeze/thaw floors with an ✗. Only trust a rating you can quote from the product page's own spec or usage section, and write the quote or source in `outdoor` or `flags`. If two places on a page disagree, the item is **use with care** until the vendor confirms in writing.

## Gates by use

| Use | Must pass for "good" |
| --- | --- |
| **Deck / outdoor floor** | Freeze/thaw stated as passing (ASTM C1026 or the vendor's usage list). Slip: DCOF ≥ 0.42 wet, or R10+. Matte, satin or honed finish, never polished or gloss. Porcelain or glazed ceramic, or stone that doesn't need yearly sealing. |
| **Bathroom / kitchen floor** | DCOF ≥ 0.42 stated (matte ≥ 0.50 preferred for kids). Not polished or gloss. Non-porous, or sealing is a one-time job. |
| **Walls / backsplash / shower walls** | Glazed or sealed surface that wipes clean. No frost or slip rating needed. |
| **Wallpaper** | Spongeable at least. Scrubbable (Commercial Grade) for kid-height walls. Not in bathrooms; below grade only after the damp is fixed. |

## Gates for every item

| Check | Good | Use with care | Poor fit (hidden by default) |
| --- | --- | --- | --- |
| Price | Published per sq ft or per box | — | Not published |
| Safety for the use | Freeze/thaw passes (deck); DCOF 0.42+ or R10+ (floors) | Rating missing or listings disagree | Freeze/thaw fails for a deck; DCOF listed under 0.42 on a floor |
| Stock / ship time **(assumption)** | In stock, or ships in under 4 weeks | 4–12 weeks, or not published | Over 12 weeks |
| Minimum order **(assumption)** | No minimum, or under 25 sq ft | A fee or minimum under 100 sq ft (e.g. a small-batch fee) | 100 sq ft or more for a single room |
| Sample | A sample is sold, free or cheap | Only a full-size sample | None |
| Care | No sealing, or a one-time seal | Regular resealing, or marble that etches from soap and cleaners | — |
| Palette | Matches at least one tile palette or the taste summary on the Palettes page | Off-palette but a strong accent | — |

## How a rating is computed

The numbers above live in `fit-rules.json`. Each item in `data.json` carries a typed `specs` block, and `scripts/check_fit.py` runs the gates and writes `fit.level`, `fit.tag` and `fit.checks` back into `data.json`. The site shows the result and a "checks passed" list on every card. Never edit `fit.level` by hand.

```
python3 scripts/check_fit.py            # re-rate everything and rewrite data.json
python3 scripts/check_fit.py --report   # print each item and what is missing or failing
python3 scripts/check_fit.py --check    # exit 1 if data.json is stale or a spec is invalid
```

### The `specs` block

| Field | Values |
| --- | --- |
| `check_uses` | Which gates apply: `deck`, `floor`, `wall`, `wallpaper`. List only the uses you would actually put it in |
| `freeze_thaw` | `{status: pass / fail / unknown / conflict, source: "who said so"}`. Only read for `deck` |
| `slip` | `{dcof: 0.74}`, `{dcof_lt: 0.42}` (listed as under), `{dcof_pass: true}` (passes, no number), `{r: "R11"}`, or `null` for unknown |
| `finish_class` | `matte`, `satin`, `honed`, `tumbled`, `gloss`, `polished`, `mixed`, `unknown` |
| `porosity` | `non-porous`, `seal-once`, `seal-regular`, `etches`, `unknown` |
| `rated_for` | Uses the vendor lists: `floor`, `wall`, `shower`, `outdoor` |
| `sample` | `sold`, `full-size-only`, `none`, `unknown` (liners are exempt) |
| `cleanable` | Wallpaper only: `scrubbable`, `spongeable`, `damp-sponge`, `unknown` |
| `care_flags` | Short human judgments that force "use with care", such as "Install takes 2–3× longer" |

Price, `lead_wk`, `min_order_sqft` and `small_batch_fee` sit on the item itself. **Unknown is a valid answer**: it rates "use with care" and shows up in the checks list, which is how a missing rating becomes visible instead of assumed.

### Adding a tile

1. Read the product page and fill in `specs`, writing the page's own wording in `freeze_thaw.source`.
2. Run `python3 scripts/check_fit.py`.
3. Write `fit.notes` for anything the rules can't see, like kids, color or install effort. Hand-written notes never change the rating; a judgment that should lower it goes in `care_flags`.

## Reading a rating

1. **Good fit** passes every check for its uses.
2. **Use with care** has at least one check that missed or is unknown, or a `care_flag`.
3. **Poor fit** fails a hard check for one of its uses. It stays in `data.json` so you can see what you liked, and is hidden behind "Show poor fits".

## Where the numbers come from

- **Freeze/thaw, DCOF, finish:** the vendor's product page.
- **Price, stock, lead time:** the product page on the `checked` date in `data.json`. Retailer search feeds can say "available" for backordered items, so open the page.
- **Lead time under 4 weeks:** in stock and shipped by freight. Zia and TileBar ship from stock; Fireclay Natural Press is made to order.
