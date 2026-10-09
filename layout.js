(async function () {
  const LE = LayoutEngine;
  const data = await (await fetch('data.json')).json();
  const rules = await (await fetch('fit-rules.json')).json();
  const items = data.items, byId = Object.fromEntries(items.map(i => [i.id, i]));
  const usable = items.filter(i => i.geom);
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const uid = () => Math.random().toString(36).slice(2, 8);
  const ROOM = new URLSearchParams(location.search).get('room');
  const roomsData = ROOM ? await fetch('rooms.json').then(r => r.json()).catch(() => null) : null;
  const ROOMDEF = roomsData && roomsData.rooms.find(r => r.id === ROOM);
  const STORE = 'reno.layout' + (ROOMDEF ? '.' + ROOM : '');
  const GROUTS = [[0, 'None'], [0.0625, '1/16"'], [0.125, '1/8"'], [0.1875, '3/16"'], [0.25, '1/4"'], [0.375, '3/8"']];
  const GROUT_COLORS = [['#ece6d8', 'Bone'], ['#d7d2c6', 'Light grey'], ['#9c968b', 'Grey'], ['#3b3a37', 'Charcoal'], ['#c98f8f', 'Rose'], ['#ffffff', 'White']];
  const OFFSETS = [[0, 'None (stack)'], [2, '1/2 offset'], [3, '1/3 offset'], [4, '1/4 offset']];
  const unitName = (it, n) => { const u = (it.unit || 'unit').split(/[ (]/)[0]; if (u === 'sq') return 'sq ft'; if (u === 'm²' || n === 1) return u; return u === 'box' ? 'boxes' : u + 's'; };
  const frac = n => { const w = Math.floor(n + 1e-9), r = n - w; const f = [[0, ''], [.125, '1/8'], [.25, '1/4'], [.375, '3/8'], [.5, '1/2'], [.625, '5/8'], [.75, '3/4'], [.875, '7/8']].find(([v]) => Math.abs(r - v) < .02); return f ? `${w || (f[1] ? '' : 0)}${w && f[1] ? ' ' : ''}${f[1]}` : n.toFixed(2); };

  // ---------- project ----------
  function newWall(name, w, h, kind, item) {
    return { id: uid(), name, w, h, kind: kind || 'shower', cutouts: [], regions: [{ id: uid(), role: 'field', name: name + ' field', x: 0, y: 0, w, h, item: item === undefined ? 'B2' : item, item2: null, mode: 'single', prints: 'alternate', orient: 'h', offset: 0, grout: 0.125, groutColor: '#ece6d8', dx: 0, dy: 0 }] };
  }
  // a layout opened from a room: walls sized from the room, tiles taken from what was chosen for it
  function roomProject() {
    let mine = {}; try { mine = (JSON.parse(localStorage.getItem('reno.rooms')) || {})[ROOM] || {}; } catch (e) {}
    const chosen = surface => { const l = (mine.materials || []).find(m => m.surface === surface && byId[m.item] && byId[m.item].geom); return l ? l.item : null; };
    const pick = s => s.kind === 'floor' ? chosen('Floor') : s.kind === 'shower' ? chosen('Shower walls') : /backsplash/i.test(s.name) ? chosen('Backsplash') : chosen('Walls');
    const dims = mine.dims || {};
    const walls = ROOMDEF.layout.map(s => newWall(s.name, s.w, s.h, s.kind, pick(s)));
    const p = { name: ROOMDEF.name, room: ROOM, zoom: 3, neededBy: mine.neededBy || '', walls, reqs: [], sel: null, wallSel: walls[0].id };
    p.sel = walls[0].regions[0].id; return p;
  }
  function freshProject() {
    if (ROOMDEF) return roomProject();
    const p = { name: 'Shower', zoom: 3, neededBy: '', walls: [newWall('Left Wall', 36, 96), newWall('Back Wall', 60, 96), newWall('Right Wall', 36, 96)], reqs: [], sel: null, wallSel: null };
    p.wallSel = p.walls[1].id; p.sel = p.walls[1].regions[0].id; return p;
  }
  let P;
  try { P = JSON.parse(localStorage.getItem(STORE)); } catch (e) {}
  if (!P || !P.walls || !P.walls.length) P = freshProject();
  const save = () => {
    try {
      // totals, so the room page can show what this layout needs
      P.totals = summary('all').map(b => { const o = LE.order(b.it, b.total, OVER); return { item: b.it.id, name: b.it.name, total: b.total, units: o.units, unitName: unitName(b.it, o.units), cost: o.cost }; });
      localStorage.setItem(STORE, JSON.stringify(P));
    } catch (e) {}
  };
  const wall = () => P.walls.find(w => w.id === P.wallSel) || P.walls[0];
  const allRegions = w => w.regions;
  const findSel = () => { for (const w of P.walls) { const r = w.regions.find(r => r.id === P.sel); if (r) return { w, r, type: 'region' }; const c = w.cutouts.find(c => c.id === P.sel); if (c) return { w, c, type: 'cutout' }; } return null; };
  const selRegion = () => { const s = findSel(); if (!s) return null; if (s.type === 'region') return s; const inner = s.w.regions.find(r => r.parent === s.c.id && r.role === 'niche'); return inner ? { w: s.w, r: inner, type: 'region' } : null; };

  // ---------- the layout of a wall ----------
  const geomFor = (r, it) => ({ ...it.geom, w: r.gw ?? it.geom.w, h: r.gh ?? it.geom.h });
  function overlaysFor(w, r) {
    const idx = w.regions.indexOf(r);
    const later = w.regions.slice(idx + 1).filter(o => o.role !== 'niche' && o.id !== r.id);
    const holes = r.role === 'niche' ? [] : w.cutouts;
    return [...later, ...holes].map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
  }
  function regionResult(w, r) {
    const it = byId[r.item];
    if (!it || !it.geom) return null;
    return { r, it, res: LE.count(r, geomFor(r, it), overlaysFor(w, r)) };
  }

  // ---------- drawing ----------
  const defs = new Map();
  function artFill(it, v) {
    const a = it.art || {};
    if (a.crops && a.image) {
      const k = `art-${it.id}-${v}`; if (!defs.has(k)) { const c = a.crops[v % a.crops.length]; defs.set(k, `<pattern id="${k}" width="1" height="1" patternUnits="objectBoundingBox" viewBox="${c.join(' ')}" preserveAspectRatio="none"><image href="${esc(a.image)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none"/></pattern>`); }
      return `url(#${k})`;
    }
    return a.color || '#cccccc';
  }
  function cellFill(r, it, it2, c) {
    const nv = (it.art && it.art.crops) ? it.art.crops.length : 1, par = (c.i + c.j) % 2 ? 1 : 0;
    if (r.mode === 'checker' && it2) return par ? (it2.art || {}).color || '#ccc' : (it.art || {}).color || '#ccc';
    if (it.geom.paired && it.art && it.art.colors && r.mode !== 'prints') return it.art.colors[par];
    if (r.mode === 'prints' && nv > 1) {
      const m = r.prints; const v = m === 'a' ? 0 : m === 'b' ? 1 : m === 'random' ? Math.abs(Math.sin(c.i * 12.9898 + c.j * 78.233) * 43758.5453) % 1 * nv | 0 : par % nv;
      return artFill(it, v);
    }
    return artFill(it, 0);
  }
  const S = () => P.zoom;
  function fitZoom() { const c = $('canvas'), maxH = Math.max(...P.walls.map(w => w.h)), totalW = P.walls.reduce((a, w) => a + w.w, 0); P.zoom = Math.max(1, Math.min(8, Math.min((c.clientHeight - 110) / maxH, (c.clientWidth - 80 - 60 * P.walls.length) / totalW))); }
  function drawWall(w, ox, oy) {
    const s = S(), H = w.h, g = [];
    const Y = (y, h) => (H - y - h) * s;
    const order = [...w.regions.filter(r => r.role !== 'niche'), ...[], ...w.regions.filter(r => r.role === 'niche')];
    const parts = [];
    const drawRegion = r => {
      const it = byId[r.item], it2 = r.item2 ? byId[r.item2] : null;
      const sel = r.id === P.sel;
      let body = '';
      if (it && it.geom) {
        const cs = LE.count(r, geomFor(r, it), overlaysFor(w, r)).cells;
        body = cs.map(c => { const ov = r.over && byId[r.over[c.i + ',' + c.j]]; return `<rect x="${(c.x * s).toFixed(2)}" y="${Y(c.y, c.h).toFixed(2)}" width="${(c.w * s).toFixed(2)}" height="${(c.h * s).toFixed(2)}" fill="${ov ? artFill(ov, 0) : cellFill(r, it, it2, c)}"${ov ? ' class="lay__painted"' : ''}/>`; }).join('');
      } else body = `<rect x="${r.x * s}" y="${Y(r.y, r.h)}" width="${r.w * s}" height="${r.h * s}" fill="#d9d2c4"/>`;
      const cid = `clip-${r.id}`;
      parts.push(`<g data-r="${r.id}"><clipPath id="${cid}"><rect x="${r.x * s}" y="${Y(r.y, r.h)}" width="${r.w * s}" height="${r.h * s}"/></clipPath>
        <rect x="${r.x * s}" y="${Y(r.y, r.h)}" width="${r.w * s}" height="${r.h * s}" fill="${r.groutColor || '#ece6d8'}"/>
        <g clip-path="url(#${cid})">${body}</g>
        ${sel ? `<rect class="lay__sel" x="${r.x * s}" y="${Y(r.y, r.h)}" width="${r.w * s}" height="${r.h * s}"/>` : ''}</g>`);
    };
    w.regions.filter(r => r.role !== 'niche').forEach(drawRegion);
    w.cutouts.forEach(c => {
      const sel = c.id === P.sel;
      parts.push(`<g data-c="${c.id}"><rect x="${c.x * s}" y="${Y(c.y, c.h)}" width="${c.w * s}" height="${c.h * s}" class="${c.kind === 'window' ? 'lay__window' : 'lay__niche'}"/>${sel ? `<rect class="lay__sel" x="${c.x * s}" y="${Y(c.y, c.h)}" width="${c.w * s}" height="${c.h * s}"/>` : ''}</g>`);
    });
    w.regions.filter(r => r.role === 'niche').forEach(drawRegion);
    const handle = findSel(); let hx = '';
    if (handle && handle.w === w) { const o = handle.type === 'region' ? handle.r : handle.c; if (o.role !== 'field') hx = `<rect class="lay__handle" data-handle="${o.id}" x="${(o.x + o.w) * s - 5}" y="${Y(o.y, o.h) - 5}" width="10" height="10"/>`; }
    const sel = w.id === P.wallSel;
    return `<g transform="translate(${ox},${oy})" data-wall="${w.id}">
      <text class="lay__wlabel${sel ? ' on' : ''}" x="0" y="-12">${esc(w.name)} <tspan class="dim">${frac(w.w)}" × ${frac(w.h)}"</tspan></text>
      <rect x="-2" y="-2" width="${w.w * s + 4}" height="${w.h * s + 4}" class="lay__frame${sel ? ' on' : ''}"/>
      ${parts.join('')}${hx}</g>`;
  }
  function renderCanvas() {
    defs.clear();
    const s = S(), gap = 60; let x = 40; const maxH = Math.max(...P.walls.map(w => w.h)); const out = [];
    P.walls.forEach(w => { out.push(drawWall(w, x, 50)); x += w.w * s + gap; });
    const W = x, Hh = maxH * s + 100;
    const svg = $('svg'); svg.setAttribute('width', W); svg.setAttribute('height', Hh); svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    svg.innerHTML = `<defs>${[...defs.values()].join('')}</defs>${out.join('')}`;
    // defs filled while drawing: write again now that it's populated
    svg.querySelector('defs').innerHTML = [...defs.values()].join('');
    $('zoomLbl').textContent = `${Math.round(s * 10) / 10} px/in`;
  }

  // ---------- picking a tile ----------
  let pickCb = null, pickKind = 'all';
  function openPicker(cb, kind) { pickCb = cb; pickKind = kind || 'all'; $('picker').hidden = false; $('pickSearch').value = ''; renderPicker(); $('pickSearch').focus(); }
  function renderPicker() {
    const q = $('pickSearch').value.toLowerCase(), poor = $('pickPoor').checked;
    $('pickKinds').innerHTML = ['all', 'tile', 'liner'].map(k => `<button type="button" class="chip" data-kind="${k}" aria-pressed="${pickKind === k}">${k === 'all' ? 'All' : k === 'tile' ? 'Tiles' : 'Liners'}</button>`).join('');
    const list = usable.filter(i => (pickKind === 'all' || i.kind === pickKind) && (poor || !(i.fit.level === 'poor' || i.hidden)) && (!q || (i.name + i.vendor + i.id + i.room).toLowerCase().includes(q)));
    $('pickGrid').innerHTML = list.map(i => `<button class="lay__pick" type="button" data-pick="${i.id}"><img src="${esc(i.local[0])}" alt=""><strong>${esc(i.name)}</strong><span>${esc(i.vendor)} · ${i.id} · ${frac(i.geom.w)}×${frac(i.geom.h)}"</span><span class="op__fit op__fit--${i.fit.level}">${{ good: 'Good fit', caution: 'Use with care', poor: 'Poor fit' }[i.fit.level]}</span></button>`).join('') || '<p>No tiles match.</p>';
  }
  $('pickSearch').oninput = renderPicker; $('pickPoor').onchange = renderPicker;
  $('pickClose').onclick = () => { $('picker').hidden = true; };
  $('picker').addEventListener('click', e => {
    if (e.target === $('picker')) $('picker').hidden = true;
    const k = e.target.closest('[data-kind]'); if (k) { pickKind = k.dataset.kind; renderPicker(); }
    const p = e.target.closest('[data-pick]'); if (p && pickCb) { $('picker').hidden = true; pickCb(p.dataset.pick); }
  });

  // ---------- left panel ----------
  const sel1 = (id, opts, cur, attrs) => `<select id="${id}" ${attrs || ''}>${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const num = (id, v, step) => `<input id="${id}" type="number" step="${step || 0.125}" value="${Math.round(v * 1000) / 1000}">`;
  function tileChip(r, which) {
    const it = byId[which === 2 ? r.item2 : r.item];
    return it ? `<button class="lay__tile" type="button" data-tile="${which}"><img src="${esc(it.local[0])}" alt=""><span><strong>${esc(it.name)}</strong>${frac(it.geom.w)}" × ${frac(it.geom.h)}" · ${money(it.price_sqft)}/${it.kind === 'liner' ? 'lf' : 'sf'}</span></button>`
      : `<button class="btn btn--primary" type="button" data-tile="${which}">Choose a tile from the board</button>`;
  }
  function renderLeft() {
    const w = wall(), s = findSel(), rs = selRegion(), r = rs && rs.r;
    let h = '';
    h += `<h3 class="lay__h">${r ? 'Tile' : 'Select a region'}${r ? ` <small>${esc(r.name)}</small>` : ''}</h3>`;
    if (r) {
      const it = byId[r.item];
      h += `<div class="lay__sec">${tileChip(r, 1)}`;
      if (it) h += `<div class="lay__row"><label>Width<span>${num('rW', r.gw ?? it.geom.w)}</span></label><label>Height<span>${num('rH', r.gh ?? it.geom.h)}</span></label></div><p class="lay__hint">Size comes from the board (${esc(it.id)}). Editing it here changes only this layout.</p>`;
      const nv = it && it.art && it.art.crops ? it.art.crops.length : 1;
      const modes = [['single', it && it.geom.paired ? 'Paired checkerboard' : 'Single tile'], ['checker', 'Checker with a second tile']].concat(nv > 1 ? [['prints', 'Mix the printed tiles']] : []);
      h += `<label class="lay__lbl">Pattern</label>${sel1('rMode', modes, r.mode)}`;
      if (r.mode === 'checker') h += `<label class="lay__lbl">Second tile</label>${tileChip(r, 2)}`;
      if (r.mode === 'prints') h += `<label class="lay__lbl">Prints</label>${sel1('rPrints', [['alternate', 'Alternate'], ['random', 'Random'], ['a', 'Print A only'], ['b', 'Print B only']], r.prints)}`;
      h += `<label class="lay__lbl">Layout</label><div class="lay__seg"><button class="on" type="button">Grid</button><button type="button" disabled title="Not built yet">Herringbone (soon)</button></div>`;
      h += `<label class="lay__lbl">Orientation</label><div class="lay__seg"><button type="button" data-orient="h" class="${r.orient === 'h' ? 'on' : ''}">Horizontal</button><button type="button" data-orient="v" class="${r.orient === 'v' ? 'on' : ''}">Vertical</button></div>`;
      h += `<label class="lay__lbl">Offset</label>${sel1('rOffset', OFFSETS, r.offset)}`;
      h += `<label class="lay__lbl">Grout width</label>${sel1('rGrout', GROUTS.map(([v, l]) => [v, l]), r.grout)}`;
      h += `<label class="lay__lbl">Grout color</label><div class="lay__swatches">${GROUT_COLORS.map(([c, n]) => `<button type="button" class="${r.groutColor === c ? 'on' : ''}" style="background:${c}" data-grout="${c}" title="${n}" aria-label="${n}"></button>`).join('')}</div></div>`;
    }
    const obj = s ? (s.type === 'cutout' ? s.c : s.r) : null;
    if (obj && obj.role !== 'field') h += `<h3 class="lay__h">Position <small>${esc(obj.name)}</small></h3><div class="lay__sec"><div class="lay__row"><label>From left<span>${num('pX', obj.x)}</span></label><label>From floor<span>${num('pY', obj.y)}</span></label></div><div class="lay__row"><label>Width<span>${num('pW', obj.w)}</span></label><label>Height<span>${num('pH', obj.h)}</span></label></div>${s.type === 'cutout' && obj.kind === 'window' ? '<p class="lay__hint">A window has no tile.</p>' : ''}<button class="btn btn--quiet" ${s.type === 'cutout' ? `data-delcut="${obj.id}"` : `data-del="${obj.id}"`} type="button">Remove this ${obj.kind || obj.role}</button></div>`;
    // walls
    h += `<h3 class="lay__h">Walls</h3><div class="lay__sec">${P.walls.map(x => `<div class="lay__wall${x.id === w.id ? ' on' : ''}" data-wall="${x.id}"><strong>${esc(x.name)}</strong><span>${frac(x.w)}"×${frac(x.h)}"</span><button class="bud__x" data-delwall="${x.id}" type="button" aria-label="Remove wall">×</button></div>`).join('')}<button class="btn" id="addWall" type="button">+ Add a wall</button></div>`;
    h += `<div class="lay__sec"><label class="lay__lbl">Selected wall</label><input id="wName" value="${esc(w.name)}"><div class="lay__row"><label>Width<span>${num('wW', w.w, 1)}</span></label><label>Height<span>${num('wH', w.h, 1)}</span></label></div><label class="lay__lbl">What is it?</label>${sel1('wKind', [['shower', 'Shower wall'], ['wall', 'Dry wall'], ['floor', 'Floor']], w.kind)}</div>`;
    // additions
    h += `<h3 class="lay__h">Cutouts and additions</h3><div class="lay__sec"><div class="lay__btns"><button class="btn" id="addNiche" type="button">+ Niche</button><button class="btn" id="addWindow" type="button">+ Window</button><button class="btn" id="addPanel" type="button">+ Accent panel</button><button class="btn" id="addLinerH" type="button">+ Liner (across)</button><button class="btn" id="addLinerV" type="button">+ Liner (up)</button><button class="btn" id="addFrame" type="button" ${s ? '' : 'disabled'}>Frame selection with liner</button></div>`;
    h += `<div class="lay__items">${w.cutouts.map(c => `<div class="lay__item${c.id === P.sel ? ' on' : ''}" data-sel="${c.id}">${c.kind === 'window' ? '▭' : '▢'} ${esc(c.name)} <span>${frac(c.w)}×${frac(c.h)}"</span><button class="bud__x" data-delcut="${c.id}" type="button" aria-label="Remove">×</button></div>`).join('')}${w.regions.map(r => `<div class="lay__item${r.id === P.sel ? ' on' : ''}" data-sel="${r.id}">${r.role === 'field' ? '▦' : r.role === 'liner' ? '━' : r.role === 'niche' ? '▢' : '◧'} ${esc(r.name)} <span>${byId[r.item] ? esc(byId[r.item].id) : ''}</span>${r.role === 'field' ? '' : `<button class="bud__x" data-del="${r.id}" type="button" aria-label="Remove ${esc(r.name)}" title="Remove">×</button>`}</div>`).join('')}</div></div>`;
    $('left').innerHTML = h;
  }

  // ---------- right panel ----------
  const flat = () => P.walls.flatMap(w => w.regions.map(r => ({ w, ...regionResult(w, r), role: r.role })).filter(x => x.it));
  function summary(scope) {
    const ws = scope === 'wall' ? [wall()] : P.walls, by = {};
    const bucket = it => by[it.id] || (by[it.id] = { it, area: it.geom.w * it.geom.h, total: 0, full: 0, cut1: 0, cut2: 0, cut3: 0, sqft: 0, lf: 0 });
    ws.forEach(w => w.regions.forEach(r => {
      const rr = regionResult(w, r); if (!rr) return;
      const g = geomFor(r, rr.it), base = bucket(rr.it); base.area = g.w * g.h; base.sqft += rr.res.sqft;
      rr.res.cells.forEach(c => {
        const ovId = r.over && r.over[c.i + ',' + c.j], ov = ovId && byId[ovId] && byId[ovId].geom ? byId[ovId] : null;
        const b = ov ? bucket(ov) : base;
        b.total++; if (c.cuts === 0) b.full++; else if (c.cuts === 1) b.cut1++; else if (c.cuts === 2) b.cut2++; else b.cut3++;
        if (ov) { const a = (c.vx1 - c.vx0) * (c.vy1 - c.vy0) / 144; b.sqft += a; base.sqft -= a; }
        if (b.it.kind === 'liner') b.lf += Math.max(c.vx1 - c.vx0, c.vy1 - c.vy0) / 12;
      });
    }));
    return Object.values(by);
  }
  let scope = 'all';
  const OVER = 10;
  function renderRight() {
    const rows = summary(scope), tot = { sqft: 0, total: 0, cost: 0 };
    const hdr = `<h3 class="lay__h">Layout optimizer</h3><div class="lay__sec"><p class="lay__hint">Moves the grid to avoid thin cuts at the edges and around cutouts.</p><button class="btn btn--primary lay__wide" id="autoBtn" type="button">Auto layout (selected region)</button><button class="btn lay__wide" id="autoAll" type="button">Auto layout (every region)</button><div class="lay__nudge"><span></span><button class="btn" data-nudge="0,0.125" type="button" aria-label="Up">▲</button><span></span><button class="btn" data-nudge="-0.125,0" type="button" aria-label="Left">◀</button><button class="btn" data-nudge="0,-0.125" type="button" aria-label="Down">▼</button><button class="btn" data-nudge="0.125,0" type="button" aria-label="Right">▶</button></div></div>`;
    let h = hdr + `<h3 class="lay__h">Tile summary</h3><div class="lay__sec"><div class="lay__seg"><button type="button" data-scope="wall" class="${scope === 'wall' ? 'on' : ''}">This wall</button><button type="button" data-scope="all" class="${scope === 'all' ? 'on' : ''}">All walls</button></div>`;
    h += rows.map(b => {
      const o = LE.order(b.it, b.total, OVER); tot.sqft += b.sqft; tot.total += b.total; tot.cost += o.cost;
      return `<div class="lay__sum"><div class="lay__sumh"><img src="${esc(b.it.local[0])}" alt=""><strong>${esc(b.it.name)}</strong></div>
        <dl><dt>Sq ft covered</dt><dd>${b.sqft.toFixed(1)}</dd><dt>Total pieces</dt><dd>${b.total}</dd><dt>Full (no cuts)</dt><dd>${b.full}</dd><dt>1-cut</dt><dd>${b.cut1}</dd><dt>2-cut</dt><dd>${b.cut2}</dd><dt>3+ cuts</dt><dd>${b.cut3}</dd>
        <dt>Order (+${OVER}%)</dt><dd><strong>${o.units} ${esc(unitName(b.it, o.units))}</strong></dd><dt>Cost</dt><dd>${money(o.cost)}</dd></dl></div>`;
    }).join('') || '<p class="lay__hint">Choose a tile to see counts.</p>';
    h += `<div class="lay__total"><span>${tot.sqft.toFixed(1)} sq ft · ${tot.total} pieces</span><strong>${money(tot.cost)}</strong></div></div>`;
    h += requirementsHTML();
    $('right').innerHTML = h;
  }

  // ---------- requirements ----------
  function checksFor(it, kind) {
    const s = it.specs || {}, out = [];
    const ok = (t) => out.push(['good', t]), care = (t) => out.push(['caution', t]), bad = (t) => out.push(['poor', t]);
    const rated = s.rated_for || [];
    if (kind === 'shower') rated.includes('shower') ? ok('Listed for shower use') : care('Not listed for shower use: ask the vendor');
    else if (kind === 'wall') rated.includes('wall') ? ok('Listed for walls') : care('Not listed for walls: ask the vendor');
    else {
      rated.includes('floor') ? ok('Listed for floors') : care('Not listed for floors: ask the vendor');
      const sl = s.slip;
      if (!sl) care('No slip rating published'); else if ('dcof' in sl) (sl.dcof >= rules.dcof_min ? ok : bad)(`DCOF ${sl.dcof} ${sl.dcof >= rules.dcof_min ? 'clears' : 'is under'} ${rules.dcof_min}`);
      else if ('dcof_lt' in sl) bad(`DCOF listed under ${sl.dcof_lt}`); else if ('dcof_pass' in sl) ok('Passes the DCOF test (number not published)'); else (parseInt(sl.r.replace(/\D/g, '')) >= rules.r_min ? ok : care)(`${sl.r} slip rating`);
      if (!rules.slip_safe_finishes.includes(s.finish_class)) care(`${s.finish_class === 'unknown' ? 'Finish not stated' : s.finish_class + ' finish is slick when wet'}`);
    }
    if (s.porosity === 'seal-regular') care('Porous: seal before and after grouting, and reseal regularly');
    if (s.porosity === 'etches') care('Etches from soap and cleaners');
    if (it.small_batch_fee) care(`$${it.small_batch_fee.fee} small-batch fee under ${it.small_batch_fee.below_sqft} sq ft`);
    if (it.min_order_sqft) care(`${it.min_order_sqft} sq ft minimum order`);
    if (it.lead_wk == null) care('Ship time not published'); else if (it.lead_wk >= rules.lead_good_below_wk) care(`About ${it.lead_wk} weeks to ship`);
    (s.care_flags || []).forEach(f => care(f));
    return out;
  }
  const SUGGEST = ['Waterproofing membrane behind the tile', 'Slope the niche sill so it drains', 'Edge trim or bullnose at outside corners', 'Grout color confirmed with a sample', 'Samples ordered and checked in the room', 'Grout joint width agreed with the installer', 'Where the layout starts (centered, or full tile at the floor)'];
  function requirementsHTML() {
    const used = summary('all').map(b => b.it.id);
    const kinds = id => [...new Set(P.walls.filter(w => w.regions.some(r => r.item === id || r.item2 === id || (r.over && Object.values(r.over).includes(id)))).map(w => w.kind))];
    let h = `<h3 class="lay__h">Requirements</h3><div class="lay__sec">`;
    h += `<label class="lay__lbl">Needed on site by</label><input type="date" id="neededBy" value="${esc(P.neededBy || '')}">`;
    used.forEach(id => {
      const it = byId[id], ks = kinds(id);
      const checks = ks.flatMap(k => checksFor(it, k)); const seen = new Set();
      const o = LE.order(it, summary('all').find(b => b.it.id === id)?.total || 0, OVER);
      const by = P.neededBy && it.lead_wk != null ? (() => { const d = new Date(P.neededBy + 'T12:00:00'); d.setDate(d.getDate() - Math.ceil(it.lead_wk * 7)); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })() : null;
      h += `<div class="lay__req"><div class="lay__reqh"><strong>${esc(it.id)} · ${esc(it.name)}</strong><span class="op__fit op__fit--${it.fit.level}">${{ good: 'Good fit', caution: 'Use with care', poor: 'Poor fit' }[it.fit.level]}</span></div>
        <ul>${checks.filter(([l, t]) => !seen.has(t) && seen.add(t)).map(([l, t]) => `<li class="chk chk--${l === 'good' ? 'good' : l === 'poor' ? 'poor' : 'caution'}"><b>${l === 'good' ? '✓' : l === 'poor' ? '✗' : '!'}</b> <span>${esc(t)}</span></li>`).join('')}</ul>
        <p class="lay__hint">${o.units} ${esc(unitName(it, o.units))} for the pieces counted, with 10% extra${by ? `; order by <strong>${by}</strong>` : ''}.${(it.liners || []).length ? ` Matching liners: ${it.liners.map(l => esc(l)).join(', ')}.` : ''}</p></div>`;
    });
    h += `<label class="lay__lbl">Your checklist</label><ul class="lay__todo">${P.reqs.map(q => `<li><label><input type="checkbox" data-req="${q.id}" ${q.done ? 'checked' : ''}> ${esc(q.text)}</label><button class="bud__x" data-delreq="${q.id}" type="button" aria-label="Remove">×</button></li>`).join('')}</ul>
      <form id="reqForm" class="lay__reqform"><input id="reqText" placeholder="Add a requirement" aria-label="Add a requirement"><button class="btn" type="submit">Add</button></form>
      <div class="lay__chips">${SUGGEST.filter(t => !P.reqs.some(q => q.text === t)).map(t => `<button type="button" class="chip" data-suggest="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
    return h;
  }

  // ---------- actions ----------
  const redraw = (all) => { renderCanvas(); if (all !== 'canvas') { renderLeft(); renderRight(); } renderTools(); save(); };
  function setSel(id) { P.sel = id; const w = P.walls.find(w => w.regions.some(r => r.id === id) || w.cutouts.some(c => c.id === id)); if (w) P.wallSel = w.id; redraw(); }
  function pickFor(cb, kind) { openPicker(cb, kind); }
  function renderTools() {
    const b = P.brush && byId[P.brush], t = P.tool || 'select';
    $('tools').innerHTML = `<span class="lay__seg lay__seg--bar"><button type="button" data-tool="select" class="${t === 'select' ? 'on' : ''}" title="Select, move and resize (Esc)">Select</button><button type="button" data-tool="paint" class="${t === 'paint' ? 'on' : ''}" title="Click or drag over tiles to replace them">Paint tiles</button><button type="button" data-tool="fill" class="${t === 'fill' ? 'on' : ''}" title="Drag a rectangle to fill every tile inside it">Fill area</button><button type="button" data-tool="erase" class="${t === 'erase' ? 'on' : ''}" title="Click a painted tile, or drag a rectangle, to put tiles back">Reset tiles</button></span>`
      + `<button class="lay__brush" type="button" id="brushBtn" title="Choose the tile to paint with">${b ? `<img src="${esc(b.local[0])}" alt=""><span>${esc(b.name)} <small>${frac(b.geom.w)}×${frac(b.geom.h)}"</small></span>` : '<span>Choose a tile to paint with</span>'}</button><span class="lay__msg" id="toolMsg">${esc(msgText)}</span>`;
    $('canvas').classList.toggle('painting', t !== 'select');
  }
  const b0 = () => { const b = byId[P.brush]; return b ? `${frac(b.geom.w)}×${frac(b.geom.h)}"` : 'the brush'; };
  let msgText = '';
  function say(t) { msgText = t; const m = $('toolMsg'); if (m) m.textContent = t; clearTimeout(say.t); say.t = setTimeout(() => { msgText = ''; const m2 = $('toolMsg'); if (m2) m2.textContent = ''; }, 5000); }
  // the cell of a tile region under a point on a wall, or null
  function cellAt(w, px, py) {
    const rs = [...w.regions.filter(r => r.role === 'niche').reverse(), ...w.regions.filter(r => r.role !== 'niche').reverse()];
    for (const r of rs) {
      if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue;
      const rr = regionResult(w, r); if (!rr) continue;
      const c = rr.res.cells.find(c => px >= c.vx0 && px <= c.vx1 && py >= c.vy0 && py <= c.vy1);
      if (c) return { r, it: rr.it, c, g: geomFor(r, rr.it) };
    }
    return null;
  }
  function paintAt(w, px, py, erase) {
    const hit = cellAt(w, px, py); if (!hit) return false;
    const key = hit.c.i + ',' + hit.c.j;
    if (erase) { if (hit.r.over && hit.r.over[key]) { delete hit.r.over[key]; return true; } return false; }
    const b = byId[P.brush]; if (!b) { say('Choose a tile to paint with first.'); return false; }
    const A = [b.geom.w, b.geom.h].sort((x, y) => x - y), B = [hit.g.w, hit.g.h].sort((x, y) => x - y);
    if (Math.abs(A[0] - B[0]) > 0.3 || Math.abs(A[1] - B[1]) > 0.3) { say(`${b.id} is ${frac(b.geom.w)}×${frac(b.geom.h)}", but this region is ${frac(hit.g.w)}×${frac(hit.g.h)}". Paint with a tile of the same size.`); return false; }
    (hit.r.over || (hit.r.over = {}))[key] = b.id; return true;
  }
  function addRegion(role, over) {
    const w = wall(); const r = { id: uid(), role, name: '', x: 0, y: 0, w: 12, h: 12, item: null, item2: null, mode: 'single', prints: 'alternate', orient: 'h', offset: 0, grout: role === 'liner' ? 0.125 : 0.125, groutColor: '#ece6d8', dx: 0, dy: 0, ...over };
    w.regions.push(r); return r;
  }
  function addNiche(c) { const w = wall(); const n = { id: uid(), kind: 'niche', name: 'Niche', x: Math.round((w.w - 14) / 2), y: 48, w: 14, h: 24 }; w.cutouts.push(n); const r = addRegion('niche', { name: 'Niche tile', parent: n.id, x: n.x, y: n.y, w: n.w, h: n.h, item: 'B5', mode: 'prints', grout: 0.125 }); return { n, r }; }

  document.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('#zoomIn')) { const c = $('canvas').getBoundingClientRect(); zoomAt(1.25, c.left + c.width / 2, c.top + c.height / 2); return; }
    const tl = t.closest('[data-tool]'); if (tl) { P.tool = tl.dataset.tool; if ((P.tool === 'paint' || P.tool === 'fill') && !P.brush) { pickFor(id => { P.brush = id; redraw(); }, 'all'); } redraw('canvas'); renderTools(); return; }
    if (t.closest('#brushBtn')) { pickFor(id => { P.brush = id; if (!P.tool || P.tool === 'select') P.tool = 'paint'; redraw(); }, 'all'); return; }
    if (t.closest('#zoomFit')) { fitZoom(); redraw('canvas'); return; }
    if (t.closest('#zoomOut')) { const c = $('canvas').getBoundingClientRect(); zoomAt(0.8, c.left + c.width / 2, c.top + c.height / 2); return; }
    const tileBtn = t.closest('[data-tile]');
    if (tileBtn) { const rs = selRegion(); if (!rs) return; const which = +tileBtn.dataset.tile; pickFor(id => { const r = rs.r; if (which === 2) r.item2 = id; else { r.item = id; const it = byId[id]; if (it.geom.shape === 'liner') r.role = r.role === 'field' ? 'field' : 'liner'; if (!(it.art && it.art.crops) && r.mode === 'prints') r.mode = 'single'; if (it.art && it.art.crops && r.role === 'niche') r.mode = 'prints'; } redraw(); }, rs.r.role === 'liner' ? 'liner' : 'all'); return; }
    const so = t.closest('[data-orient]'); if (so) { const rs = selRegion(); rs.r.orient = so.dataset.orient; redraw(); return; }
    const sg = t.closest('[data-grout]'); if (sg) { const rs = selRegion(); rs.r.groutColor = sg.dataset.grout; redraw(); return; }
    const sc = t.closest('[data-scope]'); if (sc) { scope = sc.dataset.scope; renderRight(); return; }
    const ns = t.closest('[data-nudge]'); if (ns) { const rs = selRegion(); const [a, b] = ns.dataset.nudge.split(',').map(Number); rs.r.dx = (rs.r.dx || 0) + a; rs.r.dy = (rs.r.dy || 0) + b; redraw(); return; }
    const sw = t.closest('[data-wall]'); if (sw && !t.closest('[data-delwall]') && sw.closest('#left')) { P.wallSel = sw.dataset.wall; const w = wall(); P.sel = w.regions[0].id; redraw(); return; }
    const dw = t.closest('[data-delwall]'); if (dw) { if (P.walls.length > 1) { P.walls = P.walls.filter(w => w.id !== dw.dataset.delwall); P.wallSel = P.walls[0].id; P.sel = P.walls[0].regions[0].id; redraw(); } return; }
    const si = t.closest('[data-sel]'); if (si && !t.closest('[data-delcut]') && !t.closest('[data-del]')) { setSel(si.dataset.sel); return; }
    const dc = t.closest('[data-delcut]'); if (dc) { removeObj(dc.dataset.delcut); return; }
    const dr = t.closest('[data-del]'); if (dr) { removeObj(dr.dataset.del); return; }
    const rq = t.closest('[data-delreq]'); if (rq) { P.reqs = P.reqs.filter(q => q.id !== rq.dataset.delreq); redraw(); return; }
    const sg2 = t.closest('[data-suggest]'); if (sg2) { P.reqs.push({ id: uid(), text: sg2.dataset.suggest, done: false }); redraw(); return; }
    switch (t.id) {
      case 'addWall': { const w = newWall('Wall ' + (P.walls.length + 1), 36, 96); P.walls.push(w); P.wallSel = w.id; P.sel = w.regions[0].id; redraw(); break; }
      case 'addNiche': { const { n } = addNiche(); P.sel = n.id; redraw(); break; }
      case 'addWindow': { const w = wall(); const n = { id: uid(), kind: 'window', name: 'Window', x: Math.round((w.w - 24) / 2), y: 48, w: 24, h: 24 }; w.cutouts.push(n); P.sel = n.id; redraw(); break; }
      case 'addPanel': { const w = wall(); const r = addRegion('panel', { name: 'Accent panel', x: Math.round(w.w / 2 - 12), y: 20, w: 24, h: 24, item: 'B5', mode: 'prints' }); P.sel = r.id; redraw(); break; }
      case 'addLinerH': case 'addLinerV': {
        const w = wall(), horiz = t.id === 'addLinerH', lin = byId.L1;
        const r = addRegion('liner', horiz ? { name: 'Liner band', x: 0, y: 60, w: w.w, h: 1, item: 'L1', grout: 0.125, orient: 'h' } : { name: 'Vertical liner', x: Math.round(w.w / 2), y: 0, w: 1, h: w.h, item: 'L1', grout: 0.125, orient: 'v' });
        P.sel = r.id; redraw(); break;
      }
      case 'addFrame': { frameSelection(); break; }
      case 'autoBtn': { const rs = selRegion(); if (!rs) break; const b = LE.autoLayout(rs.r, geomFor(rs.r, byId[rs.r.item]), overlaysFor(rs.w, rs.r)); rs.r.dx = b.dx; rs.r.dy = b.dy; redraw(); break; }
      case 'autoAll': { P.walls.forEach(w => w.regions.forEach(r => { const it = byId[r.item]; if (it) { const b = LE.autoLayout(r, geomFor(r, it), overlaysFor(w, r)); r.dx = b.dx; r.dy = b.dy; } })); redraw(); break; }
      case 'resetBtn': if (confirm('Start a new project? This clears the current layout.')) { P = freshProject(); redraw(); } break;
      case 'saveBtn': { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(P, null, 1)], { type: 'application/json' })), download: (P.name || 'layout').replace(/\W+/g, '-') + '.json' }); a.click(); break; }
      case 'openBtn': $('openFile').click(); break;
      case 'pdfBtn': window.print(); break;
      case 'budgetBtn': sendToBudget(); break;
    }
  });
  $('openFile').onchange = async e => { try { const p = JSON.parse(await e.target.files[0].text()); if (p.walls) { P = p; redraw(); } } catch (err) { alert('That file is not a layout project.'); } };

  // a niche is a hole plus a tile region of the same size: keep them together
  function syncNiche(w, o) {
    const pid = o.parent || (o.kind === 'niche' ? o.id : null); if (!pid) return;
    [...w.regions.filter(r => r.parent === pid), ...w.cutouts.filter(c => c.id === pid)].forEach(k => { k.x = o.x; k.y = o.y; k.w = o.w; k.h = o.h; });
  }
  // remove a region or cutout; a niche and its tile go together
  function removeObj(id) {
    const w = P.walls.find(x => x.regions.some(r => r.id === id) || x.cutouts.some(c => c.id === id)); if (!w) return;
    const reg = w.regions.find(r => r.id === id);
    if (reg && reg.role === 'field') return;
    const cutId = reg ? reg.parent : id;
    w.regions = w.regions.filter(r => r.id !== id && !(cutId && r.parent === cutId));
    if (cutId) w.cutouts = w.cutouts.filter(c => c.id !== cutId);
    P.wallSel = w.id; P.sel = w.regions[0].id; redraw();
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (P.tool || 'select') !== 'select') { P.tool = 'select'; redraw(); return; }
    if ((e.key !== 'Delete' && e.key !== 'Backspace') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const s = findSel(); if (!s) return;
    const o = s.type === 'region' ? s.r : s.c; if (o.role === 'field') return;
    e.preventDefault(); removeObj(o.id);
  });
  function frameSelection() {
    const s = findSel(); if (!s) return;
    const o = s.type === 'region' ? s.r : s.c, w = s.w, t = 1;
    const mk = (name, x, y, ww, hh, orient) => addRegion('liner', { name, x, y, w: ww, h: hh, item: 'L1', grout: 0.125, orient });
    mk(`${o.name} liner (top)`, o.x - t, o.y + o.h, o.w + 2 * t, t, 'h'); mk(`${o.name} liner (bottom)`, o.x - t, o.y - t, o.w + 2 * t, t, 'h');
    mk(`${o.name} liner (left)`, o.x - t, o.y, t, o.h, 'v'); mk(`${o.name} liner (right)`, o.x + o.w, o.y, t, o.h, 'v');
    redraw();
  }
  function sendToBudget() {
    const lines = summary('all').map(b => { const piecesArea = b.it.kind === 'liner' ? b.lf : (b.total * b.area) / 144; return { area: P.name, item: b.it.id, qty: String(Math.round(piecesArea * 100) / 100), over: String(OVER), orderer: 'TBD', note: `From the layout "${P.name}"` }; });
    if (!lines.length) return;
    location.href = 'budget.html?lines=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(lines)))));
  }

  // numeric and select inputs
  document.addEventListener('change', e => {
    const t = e.target, id = t.id, rs = selRegion(), w = wall();
    const v = parseFloat(t.value);
    if (t.dataset.req) { P.reqs.find(q => q.id === t.dataset.req).done = t.checked; save(); return; }
    if (id === 'neededBy') { P.neededBy = t.value; redraw(); return; }
    if (id === 'projName') { P.name = t.value; save(); return; }
    if (rs && (id === 'rW' || id === 'rH') && v > 0) { rs.r[id === 'rW' ? 'gw' : 'gh'] = v; redraw(); return; }
    if (id === 'wName') { w.name = t.value; redraw(); return; }
    if (id === 'wW' && v > 0) { w.w = v; w.regions[0].w = v; redraw(); return; }
    if (id === 'wH' && v > 0) { w.h = v; w.regions[0].h = v; redraw(); return; }
    if (id === 'wKind') { w.kind = t.value; redraw(); return; }
    const s = findSel();
    if (['pX', 'pY', 'pW', 'pH'].includes(id) && s) { const k = { pX: 'x', pY: 'y', pW: 'w', pH: 'h' }[id]; const o = s.type === 'region' ? s.r : s.c; o[k] = v; syncNiche(s.w, o); redraw(); return; }
    if (rs && ['rMode', 'rPrints', 'rOffset', 'rGrout'].includes(id)) { const k = { rMode: 'mode', rPrints: 'prints', rOffset: 'offset', rGrout: 'grout' }[id]; rs.r[k] = ['rOffset', 'rGrout'].includes(id) ? +t.value : t.value; redraw(); return; }
  });
  document.addEventListener('submit', e => { if (e.target.id === 'reqForm') { e.preventDefault(); const v = $('reqText').value.trim(); if (v) { P.reqs.push({ id: uid(), text: v, done: false }); redraw(); } } });
  if (ROOMDEF) { const a = document.createElement('a'); a.className = 'btn'; a.href = 'room.html?room=' + ROOM; a.textContent = '← ' + ROOMDEF.name; $('projName').parentNode.insertBefore(a, $('projName'));
    let src = 'offering'; try { src = ((JSON.parse(localStorage.getItem('reno.rooms')) || {})[ROOM] || {}).sizeSource || 'offering'; } catch (e) {}
    if (src === 'offering') { const b = document.createElement('span'); b.className = 'lay__msg'; b.textContent = 'Room sizes are estimates from the offering plan'; $('projName').after(b); } }
  $('projName').value = P.name; $('projName').onchange = () => { P.name = $('projName').value; save(); };

  // ---------- dragging on the canvas ----------
  let drag = null, painting = null, marq = null;
  const cap = e => { try { $('svg').setPointerCapture(e.pointerId); } catch (err) {} };
  $('svg').addEventListener('pointerdown', e => {
    const wg = e.target.closest('[data-wall]'); if (!wg) return;
    P.wallSel = wg.dataset.wall; const w = P.walls.find(x => x.id === P.wallSel);
    if ((P.tool || 'select') !== 'select') {
      const fr0 = wg.querySelector('.lay__frame').getBoundingClientRect();
      const erase = P.tool === 'erase' || e.shiftKey;
      if ((P.tool === 'paint' || P.tool === 'fill') && !P.brush) { pickFor(id => { P.brush = id; redraw(); }, 'all'); return; }
      if (P.tool === 'fill' || P.tool === 'erase') {
        const x0 = (e.clientX - fr0.left - 2) / S(), y0 = w.h - (e.clientY - fr0.top - 2) / S();
        marq = { w, fr: fr0, x0, y0, cx: e.clientX, cy: e.clientY, erase, moved: false };
        cap(e); return;
      }
      painting = { w, erase, fr: fr0, changed: false };
      painting.changed = paintAt(w, (e.clientX - fr0.left - 2) / S(), w.h - (e.clientY - fr0.top - 2) / S(), erase) || painting.changed;
      cap(e); renderCanvas(); renderRight(); return;
    }
    const h = e.target.closest('[data-handle]');
    if (h) { const f = findSel(), o = f.type === 'region' ? f.r : f.c; drag = { mode: 'resize', w, sx: e.clientX, sy: e.clientY, o: { x: o.x, y: o.y, w: o.w, h: o.h } }; cap(e); return; }
    // find what is under the pointer: niche tiles first, then cutouts, then later regions, then the field
    const fr = wg.querySelector('.lay__frame').getBoundingClientRect(), s = S();
    const px = (e.clientX - fr.left - 2) / s, py = w.h - (e.clientY - fr.top - 2) / s;
    const hit = [...w.regions.filter(r => r.role === 'niche').reverse(), ...w.cutouts.slice().reverse(), ...w.regions.filter(r => r.role !== 'niche').reverse()]
      .find(o => px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h);
    if (hit) {
      P.sel = hit.id;
      if (hit.role !== 'field') { const f = findSel(), o = f.type === 'region' ? f.r : f.c; drag = { mode: 'move', w, sx: e.clientX, sy: e.clientY, o: { x: o.x, y: o.y } }; cap(e); }
    }
    redraw();
  });
  $('svg').addEventListener('pointermove', e => {
    if (marq) {
      if (Math.hypot(e.clientX - marq.cx, e.clientY - marq.cy) > 4) marq.moved = true;
      let m = $('svg').querySelector('.lay__marquee'); if (!m) { m = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); m.setAttribute('class', 'lay__marquee'); $('svg').appendChild(m); }
      const sr = $('svg').getBoundingClientRect(), x = Math.min(marq.cx, e.clientX) - sr.left, y = Math.min(marq.cy, e.clientY) - sr.top;
      m.setAttribute('x', x); m.setAttribute('y', y); m.setAttribute('width', Math.abs(e.clientX - marq.cx)); m.setAttribute('height', Math.abs(e.clientY - marq.cy)); marq.last = [e.clientX, e.clientY]; return;
    }
    if (painting) { const fr = painting.fr; if (paintAt(painting.w, (e.clientX - fr.left - 2) / S(), painting.w.h - (e.clientY - fr.top - 2) / S(), painting.erase)) { painting.changed = true; renderCanvas(); renderRight(); } return; }
    if (!drag) return;
    const s = S(), q = v => Math.round(v / 0.125) * 0.125;
    const dx = q((e.clientX - drag.sx) / s), dy = -q((e.clientY - drag.sy) / s);   // dy is up
    const f = findSel(), o = f.type === 'region' ? f.r : f.c, w = drag.w;
    if (drag.mode === 'move') { o.x = Math.max(0, Math.min(w.w - o.w, drag.o.x + dx)); o.y = Math.max(0, Math.min(w.h - o.h, drag.o.y + dy)); }
    else { o.w = Math.max(0.5, Math.min(w.w - o.x, drag.o.w + dx)); o.h = Math.max(0.5, Math.min(w.h - o.y, drag.o.h + dy)); }
    syncNiche(w, o);
    renderCanvas();
  });
  // every tile whose middle falls inside the rectangle (wall inches), painted or reset
  function fillRect(w, ax, ay, bx, by, erase) {
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    const b = byId[P.brush]; let n = 0, skipped = 0;
    w.regions.forEach(r => {
      const rr = regionResult(w, r); if (!rr) return;
      const g = geomFor(r, rr.it);
      rr.res.cells.forEach(c => {
        const cx = (c.vx0 + c.vx1) / 2, cy = (c.vy0 + c.vy1) / 2;
        if (cx < x0 || cx > x1 || cy < y0 || cy > y1) return;
        const hit = cellAt(w, cx, cy); if (!hit || hit.r !== r || hit.c.i !== c.i || hit.c.j !== c.j) return;
        const key = c.i + ',' + c.j;
        if (erase) { if (r.over && r.over[key]) { delete r.over[key]; n++; } return; }
        const A = [b.geom.w, b.geom.h].sort((p, q) => p - q), B = [g.w, g.h].sort((p, q) => p - q);
        if (Math.abs(A[0] - B[0]) > 0.3 || Math.abs(A[1] - B[1]) > 0.3) { skipped++; return; }
        (r.over || (r.over = {}))[key] = b.id; n++;
      });
    });
    return { n, skipped };
  }
  const endDrag = (e) => {
    if (marq) {
      const m = marq; marq = null; const mel = $('svg').querySelector('.lay__marquee'); if (mel) mel.remove();
      if (m.moved && m.last) {
        const ex = (m.last[0] - m.fr.left - 2) / S(), ey = m.w.h - (m.last[1] - m.fr.top - 2) / S();
        const { n, skipped } = fillRect(m.w, m.x0, m.y0, ex, ey, m.erase);
        redraw(); say(m.erase ? `Reset ${n} tile${n === 1 ? '' : 's'}.` : `Filled ${n} tile${n === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} that are a different size from ${b0()}` : ''}.`);
      } else if (m.erase) { if (paintAt(m.w, m.x0, m.y0, true)) redraw(); }
      else say('Drag a rectangle over the tiles to fill.');
      return;
    }
    if (painting) { painting = null; redraw(); return; } if (drag) { drag = null; redraw(); } };
  $('svg').addEventListener('pointerup', endDrag); $('svg').addEventListener('pointercancel', endDrag);

  function zoomAt(factor, clientX, clientY) {
    const c = $('canvas'), r = c.getBoundingClientRect(), old = P.zoom;
    const nz = Math.max(0.5, Math.min(40, old * factor)); if (nz === old) return;
    const mx = clientX - r.left, my = clientY - r.top, wx = (c.scrollLeft + mx) / old, wy = (c.scrollTop + my) / old;
    P.zoom = nz; renderCanvas(); c.scrollLeft = wx * nz - mx; c.scrollTop = wy * nz - my; save();
  }
  $('canvas').addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); } }, { passive: false });
  $('svg').addEventListener('dblclick', e => { const wg = e.target.closest('[data-wall]'); if (wg && (P.tool || 'select') === 'select') zoomAt(2, e.clientX, e.clientY); });
  document.addEventListener('keydown', e => { if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; const c = $('canvas').getBoundingClientRect(); if (e.key === '+' || e.key === '=') zoomAt(1.25, c.left + c.width / 2, c.top + c.height / 2); if (e.key === '-') zoomAt(0.8, c.left + c.width / 2, c.top + c.height / 2); });

  // tile from the board: ?tile=ID sets the selected region's tile
  const want = new URLSearchParams(location.search).get('tile');
  if (want && byId[want] && byId[want].geom) { const rs = selRegion(); if (rs) { rs.r.item = want; if (byId[want].art && byId[want].art.crops && rs.r.role === 'niche') rs.r.mode = 'prints'; } history.replaceState(null, '', 'layout.html'); }

  if (!localStorage.getItem(STORE) || want) fitZoom();
  redraw();
})();
