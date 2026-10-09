// Shared by the Rooms overview and each room page. Room choices are kept in this browser (localStorage).
window.RoomsCore = (function () {
  const STORE = 'reno.rooms';
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } };
  const save = s => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} };
  const uid = () => Math.random().toString(36).slice(2, 8);

  // a room from rooms.json with this browser's edits laid over it
  function merge(state, r) {
    const u = state[r.id] || {};
    return { ...r, dims: { w: u.dims?.w ?? r.w, d: u.dims?.d ?? r.d, h: u.dims?.h ?? r.h }, materials: u.materials || [], reqs: u.reqs || [], neededBy: u.neededBy || '', notes: u.notes || '' };
  }
  const frac = n => { const w = Math.floor(n + 1e-9), r = n - w; const f = [[0, ''], [.25, '1/4'], [.5, '1/2'], [.75, '3/4']].find(([v]) => Math.abs(r - v) < .13); return f ? `${w}${f[1] ? ' ' + f[1] : ''}` : n.toFixed(1); };
  const ftin = inches => `${Math.floor(inches / 12)}'-${frac(inches % 12)}"`;

  // sensible starting quantities for each surface, from the room's size (sq ft, or linear ft for trim)
  function autoQty(r, surface) {
    const { w, d, h } = r.dims, area = a => Math.round(a / 144 * 10) / 10;
    const lay = r.layout || [];
    switch (surface) {
      case 'Floor': case 'Ceiling': return area(w * d);
      case 'Walls': return area(2 * (w + d) * h);
      case 'Accent wall': return area(Math.min(w, d) * h);
      case 'Backsplash': return area(lay.filter(l => /backsplash/i.test(l.name)).reduce((a, l) => a + l.w * l.h, 0)) || 20;
      case 'Shower walls': return area(lay.filter(l => l.kind === 'shower').reduce((a, l) => a + l.w * l.h, 0)) || 80;
      case 'Shower floor': { const b = lay.find(l => /back/i.test(l.name)), s = lay.find(l => /left/i.test(l.name)); return area((b ? b.w : 60) * (s ? s.w : 42)); }
      case 'Trim or liner': return Math.round(2 * (w + d) / 12);
      default: return 0;
    }
  }
  const qtyUnit = (surface, it) => surface === 'Trim or liner' || (it && it.kind === 'liner') ? 'linear ft' : 'sq ft';
  // which use a surface puts a material to, for the fit checks
  function useFor(r, surface, it) {
    if (it && it.kind === 'wallcovering') return 'wallpaper';
    if (surface === 'Shower walls') return 'shower';
    if (surface === 'Floor') return r.type === 'outdoor' ? 'deck' : 'floor';
    if (surface === 'Shower floor') return 'floor';
    return 'wall';
  }
  function layoutTotals(id) {
    try { const p = JSON.parse(localStorage.getItem('reno.layout.' + id)); return p && p.totals ? p.totals : null; } catch (e) { return null; }
  }
  // a CSS background that shows just this room from the floor plan image, with a little margin
  function planStyle(unit, r, width, pad) {
    const p = unit.plans[r.plan]; if (!p) return null;
    const [x, y, bw, bh] = r.box, px = (pad ?? 0.2) * Math.max(bw, bh);
    const cx = Math.max(0, x - px), cy = Math.max(0, y - px), cw = Math.min(p.w - cx, bw + 2 * px), ch = Math.min(p.h - cy, bh + 2 * px);
    const k = width / cw;
    return { css: `background-image:url('${p.image}');background-size:${(p.w * k).toFixed(1)}px ${(p.h * k).toFixed(1)}px;background-position:${(-cx * k).toFixed(1)}px ${(-cy * k).toFixed(1)}px;width:${width}px;height:${(ch * k).toFixed(1)}px`,
      box: { l: ((x - cx) / cw * 100).toFixed(2), t: ((y - cy) / ch * 100).toFixed(2), w: (bw / cw * 100).toFixed(2), h: (bh / ch * 100).toFixed(2) } };
  }
  return { load, save, merge, autoQty, qtyUnit, useFor, layoutTotals, planStyle, ftin, uid };
})();
