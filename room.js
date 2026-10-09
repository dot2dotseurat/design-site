(async function () {
  const { money, money2, esc, calc, defaultOver, unitWord } = BudgetCore, RC = RoomsCore;
  const [data, rooms, rules] = await Promise.all([fetch('data.json').then(r => r.json()), fetch('rooms.json').then(r => r.json()), fetch('fit-rules.json').then(r => r.json())]);
  const items = data.items, byId = Object.fromEntries(items.map(i => [i.id, i]));
  const id = new URLSearchParams(location.search).get('room');
  const base = rooms.rooms.find(r => r.id === id);
  const root = document.getElementById('room');
  if (!base) { root.innerHTML = '<p class="op__loading">That room is not in the list. <a href="rooms.html">See all rooms</a>.</p>'; return; }
  document.title = `${base.name} · Materials Mood Board`;
  const state = RC.load();
  const mine = () => (state[id] = state[id] || {});
  const room = () => RC.merge(state, base);
  const persist = () => RC.save(state);
  const SRC = Object.fromEntries(rooms.sizeSources.map(x => [x.id, x]));
  const LEVEL = { good: 'Good fit', caution: 'Use with care', poor: 'Poor fit' };
  const LEVELS_CLS = { good: 'good', caution: 'caution', poor: 'poor' };

  function planHTML(r) {
    const pl = RC.planStyle(rooms.unit, r, 380, 0.3), full = rooms.unit.plans[r.plan];
    if (!pl) return '<p class="room__hint">The floor plan images stay on the machine that has the offering plan. They are not in the repository.</p>';
    const fb = r.box, fz = 300 / full.w;
    return `<div class="rooms__crop room__crop" style="${pl.css}"><span class="rooms__hl" style="left:${pl.box.l}%;top:${pl.box.t}%;width:${pl.box.w}%;height:${pl.box.h}%"></span></div>
      <details class="room__whole"><summary>Show the whole ${esc(full.title.toLowerCase())} plan</summary>
        <div class="room__full" style="width:${Math.round(full.w * fz)}px;height:${Math.round(full.h * fz)}px;background-image:url('${full.image}');background-size:100% 100%"><span class="rooms__hl" style="left:${fb[0] / full.w * 100}%;top:${fb[1] / full.h * 100}%;width:${fb[2] / full.w * 100}%;height:${fb[3] / full.h * 100}%"></span></div></details>`;
  }

  function render() {
    const r = room();
    const rows = r.materials.map(l => ({ l, c: calc(l, byId) }));
    const matCost = rows.reduce((a, x) => a + x.c.cost, 0);
    const lay = RC.layoutTotals(id);
    const layCost = lay ? lay.reduce((a, t) => a + (t.cost || 0), 0) : 0;
    const area = Math.round(r.dims.w * r.dims.d / 144);
    const surfaces = r.surfaces;

    let h = `<p class="room__crumb"><a href="rooms.html">← All rooms</a> · ${esc(r.floor)}</p>
      <div class="room__head"><h1>${esc(r.name)}</h1><div class="room__stats"><div><span>Size · ${esc(SRC[r.sizeSource].short.toLowerCase())}</span><strong>${RC.ftin(r.dims.w)} × ${RC.ftin(r.dims.d)}</strong></div><div><span>Area</span><strong>${area} sq ft</strong></div><div><span>Chosen so far</span><strong>${money(matCost)}</strong></div></div></div>
      <p class="lede">${esc(r.note || '')}</p>
      <div class="room__top"><section class="room__card"><h2>Floor plan</h2>${planHTML(r)}</section>
      <section class="room__card"><h2>Size</h2><label class="lay__lbl">Where these sizes come from</label><select id="sizeSource">${rooms.sizeSources.map(x => `<option value="${x.id}"${x.id === r.sizeSource ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
        ${r.sizeSource === 'offering' ? '<p class="room__warn">These are read by eye from the offering plan, not the official plans. Quantities below are estimates: don\'t order from them yet.</p>' : ''}
        <p class="room__hint">Change the sizes once you have better ones; they set the starting quantities below.</p>
        <div class="lay__row"><label>Width (in)<span><input id="dW" type="number" step="0.5" value="${r.dims.w}"></span></label><label>Depth (in)<span><input id="dD" type="number" step="0.5" value="${r.dims.d}"></span></label></div>
        ${r.h ? `<div class="lay__row"><label>Ceiling (in)<span><input id="dH" type="number" step="0.5" value="${r.dims.h}"></span></label><label>Floor area<span><input value="${area} sq ft" disabled></span></label></div>` : ''}
        <label class="lay__lbl">Notes</label><textarea id="notes" rows="3" placeholder="Anything to remember about this room">${esc(r.notes)}</textarea></section></div>`;

    // materials
    h += `<section class="room__card room__wide"><div class="room__sechead"><h2>Materials</h2><span>${money(matCost)} · ${r.materials.length} line${r.materials.length === 1 ? '' : 's'}</span></div>
      <div class="room__lines">${rows.map(({ l, c }) => { const it = byId[l.item]; return `<div class="room__line" data-line="${l.id}">
        <select data-f="surface" aria-label="Surface">${surfaces.map(s => `<option${s === l.surface ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <button class="lay__tile room__pick" type="button" data-choose="${l.id}">${it ? `<img src="${esc(it.local[0])}" alt=""><span><strong>${esc(it.name)}</strong>${esc(it.vendor)} · ${money2(it.price_sqft)}/${it.kind === 'liner' ? 'lf' : 'sf'}</span>` : '<span><strong>Choose a material</strong>from the board</span>'}</button>
        <label class="room__qty"><input data-f="qty" value="${esc(l.qty)}" inputmode="decimal" aria-label="Quantity"><small>${RC.qtyUnit(l.surface, it)}</small></label>
        <label class="room__qty"><input data-f="over" type="number" min="0" max="100" value="${esc(l.over)}" aria-label="Overage"><small>% extra</small></label>
        <div class="room__order">${c.units ? `<strong>${c.units} ${esc(unitWord(it, c.units))}</strong><small>${money(c.cost)}</small>` : '<small>Enter a quantity</small>'}</div>
        <button class="bud__x" data-del="${l.id}" type="button" aria-label="Remove">×</button></div>`; }).join('') || '<p class="room__hint">Nothing chosen yet. Add a surface, then pick its material from the board.</p>'}</div>
      <div class="room__add"><span class="lay__lbl">Add</span>${surfaces.map(s => `<button class="chip" data-addsurface="${esc(s)}" type="button">+ ${esc(s)}</button>`).join('')}</div>
      <div class="room__sechead room__actions"><button class="btn btn--primary" id="toBudget" type="button" ${r.materials.length ? '' : 'disabled'}>Add these to the budget</button></div></section>`;

    // layouts
    h += `<section class="room__card room__wide"><div class="room__sechead"><h2>Layouts</h2><span>${lay ? money(layCost) + ' in the layout' : 'not started'}</span></div>
      <p class="room__hint">Lay tile surface by surface: ${r.layout.map(s => esc(s.name)).join(', ')}. The layout tool opens with these sized from this room.</p>
      ${lay ? `<ul class="room__laysum">${lay.map(t => `<li><strong>${esc(t.name)}</strong> ${t.total} pieces · ${t.units} ${esc(t.unitName)} · ${money(t.cost)}</li>`).join('')}</ul>` : ''}
      <a class="btn btn--primary" href="layout.html?room=${esc(id)}">${lay ? 'Open the layout' : 'Start a layout'}</a>
      <p class="room__hint">A layout counts its own tiles and sends them to the budget from the layout page. If a surface is in both lists, use one of them so it isn't counted twice.</p></section>`;

    // requirements
    const used = [...new Set(r.materials.map(l => l.item).filter(i => byId[i]))];
    h += `<section class="room__card room__wide"><div class="room__sechead"><h2>Requirements</h2><span>${used.length} material${used.length === 1 ? '' : 's'} checked</span></div>
      <label class="lay__lbl">Needed on site by</label><input type="date" id="needed" value="${esc(r.neededBy)}" class="room__date">`;
    used.forEach(iid => {
      const it = byId[iid], uses = [...new Set(r.materials.filter(l => l.item === iid).map(l => RC.useFor(r, l.surface, it)))];
      const checks = uses.flatMap(u => FitChecks.checksFor(it, u, rules)); const seen = new Set();
      const by = r.neededBy && it.lead_wk != null ? (() => { const d = new Date(r.neededBy + 'T12:00:00'); d.setDate(d.getDate() - Math.ceil(it.lead_wk * 7)); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })() : null;
      h += `<div class="lay__req"><div class="lay__reqh"><strong>${esc(it.id)} · ${esc(it.name)}</strong><span class="op__fit op__fit--${it.fit.level}">${LEVEL[it.fit.level]}</span></div>
        <p class="room__hint">For: ${uses.map(u => ({ deck: 'outdoor floor', floor: 'floor', shower: 'shower wall', wall: 'wall', wallpaper: 'wallpaper' }[u])).join(', ')}${by ? ` · order by <strong>${by}</strong>` : ''}</p>
        <ul>${checks.filter(([, t]) => !seen.has(t) && seen.add(t)).map(([lv, t]) => `<li class="chk chk--${LEVELS_CLS[lv]}"><b>${lv === 'good' ? '✓' : lv === 'poor' ? '✗' : '!'}</b> <span>${esc(t)}</span></li>`).join('')}</ul></div>`;
    });
    h += `<label class="lay__lbl">Your checklist for this room</label><ul class="lay__todo">${r.reqs.map(q => `<li><label><input type="checkbox" data-req="${q.id}" ${q.done ? 'checked' : ''}> ${esc(q.text)}</label><button class="bud__x" data-delreq="${q.id}" type="button" aria-label="Remove">×</button></li>`).join('')}</ul>
      <form id="reqForm" class="lay__reqform"><input id="reqText" placeholder="Add a requirement" aria-label="Add a requirement"><button class="btn" type="submit">Add</button></form>
      <div class="lay__chips">${(rooms.types[r.type] || []).filter(t => !r.reqs.some(q => q.text === t)).map(t => `<button type="button" class="chip" data-suggest="${esc(t)}">${esc(t)}</button>`).join('')}</div></section>`;
    root.innerHTML = h;
  }

  // ---------- editing ----------
  const lines = () => { const m = mine(); return (m.materials = m.materials || []); };
  function addLine(surface, item) {
    const r = room(), it = item && byId[item];
    lines().push({ id: RC.uid(), surface, item: item || '', qty: String(RC.autoQty(r, surface)), over: String(defaultOver(it)), note: '' });
    persist(); render();
  }
  function choose(lineId) {
    Picker.open({ items, kind: 'all', onPick: iid => { const l = lines().find(x => x.id === lineId), it = byId[iid]; l.item = iid; l.over = String(defaultOver(it)); persist(); render(); } });
  }
  root.addEventListener('click', e => {
    const t = e.target;
    const a = t.closest('[data-addsurface]'); if (a) { const s = a.dataset.addsurface; Picker.open({ items, kind: 'all', onPick: iid => addLine(s, iid) }); return; }
    const c = t.closest('[data-choose]'); if (c) { choose(c.dataset.choose); return; }
    const d = t.closest('[data-del]'); if (d) { const m = mine(); m.materials = lines().filter(l => l.id !== d.dataset.del); persist(); render(); return; }
    const dq = t.closest('[data-delreq]'); if (dq) { const m = mine(); m.reqs = (m.reqs || []).filter(q => q.id !== dq.dataset.delreq); persist(); render(); return; }
    const sg = t.closest('[data-suggest]'); if (sg) { (mine().reqs = mine().reqs || []).push({ id: RC.uid(), text: sg.dataset.suggest, done: false }); persist(); render(); return; }
    if (t.closest('#toBudget')) {
      const r = room();
      const out = r.materials.filter(l => byId[l.item] && parseFloat(l.qty) > 0).map(l => ({ area: r.name, item: l.item, qty: l.qty, over: l.over, orderer: 'TBD', note: l.surface + (r.sizeSource === 'offering' ? ' (size is an estimate from the offering plan)' : '') }));
      location.href = 'budget.html?lines=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(out)))));
    }
  });
  root.addEventListener('input', e => {
    const row = e.target.closest('[data-line]'), f = e.target.dataset.f;
    if (row && f) { const l = lines().find(x => x.id === row.dataset.line); l[f] = e.target.value; persist(); if (f === 'surface') { l.qty = String(RC.autoQty(room(), l.surface)); persist(); render(); } else refreshRow(row, l); }
  });
  function refreshRow(row, l) {
    const c = calc(l, byId), it = byId[l.item];
    row.querySelector('.room__order').innerHTML = c.units ? `<strong>${c.units} ${esc(unitWord(it, c.units))}</strong><small>${money(c.cost)}</small>` : '<small>Enter a quantity</small>';
    const total = room().materials.reduce((a, x) => a + calc(x, byId).cost, 0);
    document.querySelector('.room__stats div:last-child strong').textContent = money(total);
    document.querySelector('.room__sechead span').textContent = `${money(total)} · ${room().materials.length} line${room().materials.length === 1 ? '' : 's'}`;
  }
  root.addEventListener('change', e => {
    const t = e.target, m = mine();
    if (['dW', 'dD', 'dH'].includes(t.id)) { const v = parseFloat(t.value); if (v > 0) { m.dims = { ...(m.dims || {}), [{ dW: 'w', dD: 'd', dH: 'h' }[t.id]]: v }; persist(); render(); } return; }
    if (t.id === 'sizeSource') { m.sizeSource = t.value; persist(); render(); return; }
    if (t.id === 'notes') { m.notes = t.value; persist(); return; }
    if (t.id === 'needed') { m.neededBy = t.value; persist(); render(); return; }
    if (t.dataset.req) { (m.reqs || []).find(q => q.id === t.dataset.req).done = t.checked; persist(); }
  });
  root.addEventListener('submit', e => { if (e.target.id === 'reqForm') { e.preventDefault(); const v = document.getElementById('reqText').value.trim(); if (v) { (mine().reqs = mine().reqs || []).push({ id: RC.uid(), text: v, done: false }); persist(); render(); } } });
  render();
})();
