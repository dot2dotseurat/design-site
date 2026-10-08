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
| Stock / ship time **(assumption)** | In stock, or ships in under 4 weeks | 4–12 weeks, or made to order | Over 12 weeks |
| Minimum order **(assumption)** | No minimum, or under 25 sq ft | A fee or minimum under 100 sq ft (e.g. a small-batch fee) | 100 sq ft or more for a single room |
| Sample | A sample is sold, free or cheap | Only a full-size sample | None |
| Care | No sealing, or a one-time seal | Regular resealing (marble, cement, terrazzo) | Etches or stains from shampoo and cleaners on a floor |
| Palette | Matches at least one tile palette or the taste summary on the Palettes page | Off-palette but a strong accent | — |

## Rating a card

1. **Good fit** passes every gate for its use.
2. **Use with care** misses one "good" gate but none of the "poor" ones, or has a conflicting or missing rating that a vendor email could settle.
3. **Poor fit** fails any "poor" gate for its use. It stays in `data.json` so you can see what you liked, and is hidden behind "Show poor fits".
4. Write `fit.notes` as the rule and the number ("DCOF 0.45 clears the 0.42 line with less margin than matte"), not as an adjective.

## Where the numbers come from

- **Freeze/thaw, DCOF, finish:** the vendor's product page.
- **Price, stock, lead time:** the product page on the `checked` date in `data.json`. Retailer search feeds can say "available" for backordered items, so open the page.
- **Lead time under 4 weeks:** in stock and shipped by freight. Zia and TileBar ship from stock; Fireclay Natural Press is made to order.
