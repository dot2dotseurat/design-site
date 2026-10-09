// Tile layout maths: no DOM, so it can be tested in node. Units are inches. y runs up from the floor.
// A "region" is a rectangle on a wall that one tile is laid inside: { x, y, w, h, orient, offset, grout, dx, dy }.
//   orient: 'h' lays tile.w left-to-right, 'v' swaps w and h.
//   offset: 0 (stack) or a denominator 2, 3, 4 for a running-bond shift of 1/2, 1/3, 1/4 per row.
//   dx, dy: where the grid starts, measured from the region's left and bottom edges.
// Later regions and cutouts sit on top of earlier ones and hide the tile beneath them.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LayoutEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const EPS = 0.01;

  function dims(geom, orient) { return orient === 'v' ? { cw: geom.h, ch: geom.w } : { cw: geom.w, ch: geom.h }; }

  // Every tile cell that shows inside the region, clipped to it. i and j are the column and row indexes.
  function cells(region, geom) {
    const { cw, ch } = dims(geom, region.orient), g = region.grout || 0;
    const px = cw + g, py = ch + g, d = region.offset || 0;
    const baseY = region.y + (region.dy || 0), baseX = region.x + (region.dx || 0);
    const j0 = Math.floor((region.y - baseY) / py) - 1, j1 = Math.ceil((region.y + region.h - baseY) / py) + 1;
    const out = [];
    for (let j = j0; j <= j1; j++) {
      const y = baseY + j * py;
      if (y + ch <= region.y + EPS || y >= region.y + region.h - EPS) continue;
      const shift = d ? (((j % d) + d) % d) * px / d : 0;
      const i0 = Math.floor((region.x - baseX - shift) / px) - 1, i1 = Math.ceil((region.x + region.w - baseX - shift) / px) + 1;
      for (let i = i0; i <= i1; i++) {
        const x = baseX + shift + i * px;
        const vx0 = Math.max(x, region.x), vx1 = Math.min(x + cw, region.x + region.w);
        const vy0 = Math.max(y, region.y), vy1 = Math.min(y + ch, region.y + region.h);
        if (vx1 - vx0 <= EPS || vy1 - vy0 <= EPS) continue;
        const clipped = (vx0 > x + EPS) + (vx1 < x + cw - EPS) + (vy0 > y + EPS) + (vy1 < y + ch - EPS);
        out.push({ i, j, x, y, w: cw, h: ch, vx0, vx1, vy0, vy1, clipped });
      }
    }
    return out;
  }

  const overlap = (a, b) => {
    const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
    return x1 - x0 > EPS && y1 - y0 > EPS ? { x0, x1, y0, y1 } : null;
  };

  // Extra cuts a cell needs because other pieces sit on top of it. Returns null when it is fully hidden.
  function coverCuts(cell, overlays) {
    const V = { x0: cell.vx0, x1: cell.vx1, y0: cell.vy0, y1: cell.vy1 };
    const area = (V.x1 - V.x0) * (V.y1 - V.y0);
    let extra = 0, covered = 0;
    for (const o of overlays) {
      const O = overlap(V, { x0: o.x, x1: o.x + o.w, y0: o.y, y1: o.y + o.h });
      if (!O) continue;
      covered += (O.x1 - O.x0) * (O.y1 - O.y0);
      const L = O.x0 <= V.x0 + EPS, R = O.x1 >= V.x1 - EPS, B = O.y0 <= V.y0 + EPS, T = O.y1 >= V.y1 - EPS;
      const sides = L + R + B + T;
      if (L && R && B && T) return null;
      if ((L && R) || (B && T)) extra += 1;          // a strip across: what is left is still a rectangle
      else if (sides === 2) extra += 2;               // a corner taken out: L-shaped
      else if (sides === 1) extra += 3;               // a notch
      else extra += 4;                                // a hole in the middle
    }
    if (covered >= area - EPS) return null;
    return extra;
  }

  // Area of a set of rectangles with overlaps counted once.
  function unionArea(rects) {
    if (!rects.length) return 0;
    const xs = [...new Set(rects.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b);
    const ys = [...new Set(rects.flatMap(r => [r.y, r.y + r.h]))].sort((a, b) => a - b);
    let a = 0;
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      if (rects.some(r => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) a += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    }
    return a;
  }

  // Count the tiles a region needs, once the pieces on top of it are taken away.
  function count(region, geom, overlays) {
    const shown = [];
    let full = 0, cut1 = 0, cut2 = 0, cut3 = 0;
    for (const c of cells(region, geom)) {
      const extra = coverCuts(c, overlays || []);
      if (extra === null) continue;
      const cuts = c.clipped + extra;
      if (cuts === 0) full++; else if (cuts === 1) cut1++; else if (cuts === 2) cut2++; else cut3++;
      shown.push({ ...c, cuts });
    }
    const hidden = (overlays || []).map(o => ({ x: Math.max(o.x, region.x), y: Math.max(o.y, region.y), w: 0, h: 0, _o: o }))
      .map(h => { const o = h._o; const x0 = Math.max(o.x, region.x), x1 = Math.min(o.x + o.w, region.x + region.w), y0 = Math.max(o.y, region.y), y1 = Math.min(o.y + o.h, region.y + region.h); return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; })
      .filter(Boolean);
    const sqft = (region.w * region.h - unionArea(hidden)) / 144;
    return { total: full + cut1 + cut2 + cut3, full, cut1, cut2, cut3, sqft, cells: shown };
  }

  // Try start offsets and keep the one with the fewest thin slivers, then the fewest cut tiles, then the most symmetrical.
  function autoLayout(region, geom, overlays, step) {
    const { cw, ch } = dims(geom, region.orient), g = region.grout || 0;
    const px = cw + g, py = ch + g, s = step || 0.25;
    const thin = d => Math.min(2, 0.35 * d);
    let best = null;
    for (let dx = 0; dx < px - EPS; dx += s) {
      for (let dy = 0; dy < py - EPS; dy += s) {
        const r = { ...region, dx, dy };
        let thinCount = 0, cuts = 0, asym = 0;
        const cs = cells(r, geom);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const c of cs) {
          if (c.clipped) {
            cuts++;
            if (c.vx1 - c.vx0 < thin(cw) || c.vy1 - c.vy0 < thin(ch)) thinCount++;
          }
        }
        // symmetry: compare the width of the partial tile at the left and right of the middle row, and bottom and top of the middle column
        const row = cs.filter(c => c.vy0 <= region.y + region.h / 2 && c.vy1 >= region.y + region.h / 2);
        const col = cs.filter(c => c.vx0 <= region.x + region.w / 2 && c.vx1 >= region.x + region.w / 2);
        if (row.length) { const L = Math.min(...row.map(c => c.vx0)), R = Math.max(...row.map(c => c.vx1)); asym += Math.abs((row.reduce((a, c) => c.vx0 === L ? c.vx1 - c.vx0 : a, 0)) - (row.reduce((a, c) => c.vx1 === R ? c.vx1 - c.vx0 : a, 0))); }
        if (col.length) { const B = Math.min(...col.map(c => c.vy0)), T = Math.max(...col.map(c => c.vy1)); asym += Math.abs((col.reduce((a, c) => c.vy0 === B ? c.vy1 - c.vy0 : a, 0)) - (col.reduce((a, c) => c.vy1 === T ? c.vy1 - c.vy0 : a, 0))); }
        const score = thinCount * 1000 + cuts + asym * 0.01;
        if (!best || score < best.score - 1e-9) best = { dx, dy, score, thin: thinCount, cuts };
      }
    }
    return best || { dx: 0, dy: 0, score: 0, thin: 0, cuts: 0 };
  }

  // How many orderable units a tile count needs. perUnit comes from geom.per_unit, or is worked out from the sold area.
  function perUnit(item) {
    const g = item.geom;
    if (g.per_unit) return g.per_unit;
    const sf = (g.w * g.h) / 144;
    return Math.max(1, Math.round(item.sqft_per_unit / sf * 100) / 100);
  }

  function order(item, pieces, overagePct) {
    const pu = perUnit(item);
    const need = pieces * (1 + (overagePct || 0) / 100);
    const units = Math.ceil(need / pu - 1e-9);
    let cost = units * item.unit_price;
    if (item.small_batch_fee && pieces * (item.geom.w * item.geom.h) / 144 < item.small_batch_fee.below_sqft) cost += item.small_batch_fee.fee;
    return { units, cost, perUnit: pu };
  }

  return { cells, count, coverCuts, unionArea, autoLayout, perUnit, order, dims };
});
