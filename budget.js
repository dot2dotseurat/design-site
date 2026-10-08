(async function () {
  const data = await (await fetch('data.json')).json();
  const items = data.items, byId = Object.fromEntries(items.map(i => [i.id, i]));
  const isPoor = i => !!(i.fit && i.fit.level === 'poor');
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const money2 = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const STORE = 'reno.budget';
  const AREAS = ['Deck', 'Hall bath', 'Kids bath', 'Powder room', 'Kitchen', 'Dining room', 'Basement', 'Closets', 'Hallway'];

  let state;
  try { state = JSON.parse(localStorage.getItem(STORE)); } catch (e) {}
  if (!state || !state.scenarios || !state.scenarios.length) state = { current: null, scenarios: [{ id: uid(), name: 'Base case', lines: [] }] };
  if (!state.scenarios.some(s => s.id === state.current)) state.current = state.scenarios[0].id;
  let showPoor = false;
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} };
  const cur = () => state.scenarios.find(s => s.id === state.current);

  // "10x8 + 4x3" or "120" -> sq ft
  function parseArea(txt) {
    const s = String(txt ?? '').toLowerCase().replace(/[×*]/g, 'x').replace(/,/g, '');
    if (!s.trim()) return 0;
    return s.split('+').reduce((sum, part) => {
      const m = part.trim().split('x').map(v => parseFloat(v));
      if (m.some(isNaN)) return sum;
      return sum + (m.length > 1 ? m.reduce((a, b) => a * b, 1) : m[0]);
    }, 0);
  }
  const defaultOver = it => it ? Math.round((it.overage ?? 0.15) * 100) : 15;

  function calc(line) {
    const it = byId[line.item];
    const need = parseArea(line.qty);
    if (!it || !need) return { it, need, units: 0, cost: 0, warns: [], covered: 0 };
    const over = (parseFloat(line.over) || 0) / 100;
    const order = need * (1 + over);
    const units = Math.ceil(order / it.sqft_per_unit - 1e-9);
    let cost = units * it.unit_price;
    const warns = [];
    if (it.small_batch_fee && order < it.small_batch_fee.below_sqft) { cost += it.small_batch_fee.fee; warns.push(`Includes a ${money(it.small_batch_fee.fee)} small-batch fee (orders under ${it.small_batch_fee.below_sqft} sq ft)`); }
    if (it.min_order_sqft && order < it.min_order_sqft) warns.push(`Vendor minimum is ${it.min_order_sqft} sq ft; this is ${Math.round(order)}`);
    if (isPoor(it)) warns.push('Marked a poor fit on the Materials page');
    return { it, need, units, cost, warns, covered: units * it.sqft_per_unit };
  }
  const unitWord = (it, n) => {
    const u = (it.unit || '').split(/[ (]/)[0] || 'unit';
    if (u === 'sq') return 'sq ft';
    if (u === 'm²' || n === 1) return u;
    return u === 'box' ? 'boxes' : u + 's';
  };
  const qtyLabel = it => it && it.kind === 'liner' ? 'linear ft' : 'sq ft';

  function materialOptions(selected) {
    const rooms = [...new Set(items.map(i => i.room))];
    return '<option value="">Choose a material…</option>' + rooms.map(r => {
      const list = items.filter(i => i.room === r && (showPoor || !(isPoor(i) || i.hidden) || i.id === selected));
      return list.length ? `<optgroup label="${esc(r)}">${list.map(i => `<option value="${i.id}"${i.id === selected ? ' selected' : ''}>${esc(i.id)} · ${esc(i.name)} (${money2(i.price_sqft)}/${i.kind === 'liner' ? 'lf' : 'sf'})</option>`).join('')}</optgroup>` : '';
    }).join('');
  }

  function render() {
    const s = cur();
    document.getElementById('scenario').innerHTML = state.scenarios.map(x => `<option value="${x.id}"${x.id === s.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    document.getElementById('scenarioName').textContent = s.name;
    const rows = s.lines.map(l => ({ l, c: calc(l) }));
    const total = rows.reduce((a, r) => a + r.c.cost, 0);
    document.getElementById('scenarioMeta').textContent = `${s.lines.length} line${s.lines.length === 1 ? '' : 's'} · ${money(total)}`;
    document.getElementById('budTable').innerHTML = s.lines.length ? `
      <div class="bud__row bud__row--head"><span>Area</span><span>Material</span><span>Surface to cover</span><span>Overage</span><span>You'd order</span><span>Cost</span><span></span></div>
      ${rows.map(({ l, c }) => `<div class="bud__row" data-line="${l.id}">
        <span><input list="areas" data-f="area" value="${esc(l.area)}" placeholder="Area" aria-label="Area"></span>
        <span><select data-f="item" aria-label="Material">${materialOptions(l.item)}</select></span>
        <span class="bud__qty"><input data-f="qty" value="${esc(l.qty)}" placeholder="e.g. 120 or 10x8" inputmode="decimal" aria-label="Surface to cover"><small>${c.need ? Math.round(c.need * 10) / 10 + ' ' + qtyLabel(c.it) : qtyLabel(c.it)}</small></span>
        <span class="bud__over"><input data-f="over" type="number" min="0" max="100" step="1" value="${esc(l.over)}" aria-label="Overage percent"><small>%</small></span>
        <span class="bud__order">${c.units ? `<strong>${c.units} ${unitWord(c.it, c.units)}</strong><small>${Math.round(c.covered * 10) / 10} ${qtyLabel(c.it)}${c.it.unit_price ? ` · ${money2(c.it.unit_price)} each` : ''}</small>` : '<small>Add a material and a surface</small>'}</span>
        <span class="bud__cost">${c.cost ? money(c.cost) : '—'}</span>
        <span><button class="bud__x" data-del="${l.id}" type="button" aria-label="Remove line">×</button></span>
        ${c.warns.length ? `<p class="bud__warn">${c.warns.map(esc).join(' · ')}</p>` : ''}
        ${c.it ? `<p class="bud__ship">${esc(c.it.ship)}</p>` : ''}
      </div>`).join('')}` : '<p class="bud__empty">No lines yet. Add one, or use “Add to budget” on a card on the Materials page.</p>';

    // totals
    const byArea = {};
    rows.forEach(({ l, c }) => { const k = (l.area || 'No area').trim() || 'No area'; byArea[k] = (byArea[k] || 0) + c.cost; });
    const leads = rows.filter(r => r.c.it && r.c.cost).map(r => r.c.it.lead_wk);
    const longest = leads.length ? (leads.some(v => v == null) ? 'Some ship times unknown' : `${Math.max(...leads)} week${Math.max(...leads) === 1 ? '' : 's'} for the slowest item`) : '—';
    document.getElementById('budTotals').innerHTML = `
      <div class="bud-total bud-total--big"><span>${esc(s.name)}</span><strong>${money(total)}</strong><small>${esc(longest)}</small></div>
      <ul class="bud-areas">${Object.entries(byArea).map(([k, v]) => `<li><span>${esc(k)}</span><b>${money(v)}</b></li>`).join('') || '<li><span>No areas yet</span><b>—</b></li>'}</ul>`;

    // compare
    const comp = state.scenarios.map(x => {
      const r = x.lines.map(calc); const t = r.reduce((a, c) => a + c.cost, 0);
      return { x, t, n: x.lines.length };
    });
    const base = comp.find(c => c.x.id === s.id).t;
    document.getElementById('budCompare').innerHTML = `
      <div class="bud__row bud__row--head bud__row--cmp"><span>Scenario</span><span>Lines</span><span>Total</span><span>vs. this scenario</span></div>
      ${comp.map(c => `<div class="bud__row bud__row--cmp${c.x.id === s.id ? ' is-current' : ''}"><span><button class="linkbtn" data-open="${c.x.id}" type="button">${esc(c.x.name)}</button></span><span>${c.n}</span><span class="bud__cost">${money(c.t)}</span><span>${c.x.id === s.id ? '—' : (c.t - base >= 0 ? '+' : '−') + money(Math.abs(c.t - base))}</span></div>`).join('')}`;
  }

  // inputs: update in place so typing isn't interrupted
  const table = document.getElementById('budTable');
  table.addEventListener('input', e => {
    const f = e.target.dataset.f; if (!f) return;
    const l = cur().lines.find(x => x.id === e.target.closest('[data-line]').dataset.line);
    l[f] = e.target.value;
    if (f === 'item' && byId[l.item]) l.over = String(defaultOver(byId[l.item]));
    save();
    if (f === 'item') render(); else refreshRow(e.target.closest('[data-line]'), l);
  });
  function refreshRow(rowEl, l) {
    const c = calc(l);
    rowEl.querySelector('.bud__order').innerHTML = c.units ? `<strong>${c.units} ${unitWord(c.it, c.units)}</strong><small>${Math.round(c.covered * 10) / 10} ${qtyLabel(c.it)}${c.it.unit_price ? ` · ${money2(c.it.unit_price)} each` : ''}</small>` : '<small>Add a material and a surface</small>';
    rowEl.querySelector('.bud__cost').textContent = c.cost ? money(c.cost) : '—';
    rowEl.querySelector('.bud__qty small').textContent = c.need ? Math.round(c.need * 10) / 10 + ' ' + qtyLabel(c.it) : qtyLabel(c.it);
    let w = rowEl.querySelector('.bud__warn');
    if (c.warns.length) { if (!w) { w = document.createElement('p'); w.className = 'bud__warn'; rowEl.appendChild(w); } w.textContent = c.warns.join(' · '); } else if (w) w.remove();
    const s = cur(); const tot = s.lines.reduce((a, x) => a + calc(x).cost, 0);
    document.getElementById('scenarioMeta').textContent = `${s.lines.length} line${s.lines.length === 1 ? '' : 's'} · ${money(tot)}`;
    clearTimeout(refreshRow.t); refreshRow.t = setTimeout(render, 600);
  }
  table.addEventListener('focusout', () => setTimeout(() => { if (!table.contains(document.activeElement)) render(); }, 50));
  table.addEventListener('click', e => {
    const d = e.target.closest('[data-del]'); if (!d) return;
    const s = cur(); s.lines = s.lines.filter(l => l.id !== d.dataset.del); save(); render();
  });

  const addLine = (item, area) => {
    const it = item && byId[item];
    cur().lines.push({ id: uid(), area: area || (it ? it.room : ''), item: it ? it.id : '', qty: '', over: String(defaultOver(it)) });
    save(); render();
    const rows = document.querySelectorAll('[data-line]'); const last = rows[rows.length - 1];
    if (last) last.querySelector('[data-f="qty"]').focus();
  };
  document.getElementById('addLine').onclick = () => addLine();

  document.getElementById('scenario').onchange = e => { state.current = e.target.value; save(); render(); };
  document.getElementById('newScenario').onclick = () => {
    const name = prompt('Name this scenario (for example, “Tight budget”)', 'New scenario'); if (!name) return;
    const s = { id: uid(), name: name.trim(), lines: [] }; state.scenarios.push(s); state.current = s.id; save(); render();
  };
  document.getElementById('dupScenario').onclick = () => {
    const c = cur(); const name = prompt('Name the copy', c.name + ' (copy)'); if (!name) return;
    const s = { id: uid(), name: name.trim(), lines: c.lines.map(l => ({ ...l, id: uid() })) }; state.scenarios.push(s); state.current = s.id; save(); render();
  };
  document.getElementById('renameScenario').onclick = () => { const n = prompt('Rename scenario', cur().name); if (n) { cur().name = n.trim(); save(); render(); } };
  document.getElementById('delScenario').onclick = () => {
    if (state.scenarios.length === 1) { cur().lines = []; save(); render(); return; }
    if (!confirm(`Delete “${cur().name}”?`)) return;
    state.scenarios = state.scenarios.filter(s => s.id !== state.current); state.current = state.scenarios[0].id; save(); render();
  };
  document.getElementById('budCompare').addEventListener('click', e => { const o = e.target.closest('[data-open]'); if (o) { state.current = o.dataset.open; save(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  document.getElementById('showPoor').onchange = e => { showPoor = e.target.checked; render(); };

  document.getElementById('csv').onclick = () => {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const head = ['Scenario', 'Area', 'ID', 'Material', 'Vendor', 'Surface to cover', 'Unit of surface', 'Overage %', 'Units to order', 'Unit', 'Unit price', 'Cost', 'Ship time', 'Notes', 'Link'];
    const out = [head.map(q).join(',')];
    state.scenarios.forEach(s => s.lines.forEach(l => {
      const c = calc(l); const it = c.it;
      out.push([s.name, l.area, it && it.id, it && it.name, it && it.vendor, c.need ? Math.round(c.need * 100) / 100 : '', it ? qtyLabel(it) : '', l.over, c.units || '', it && it.unit, it && it.unit_price, c.cost ? Math.round(c.cost * 100) / 100 : '', it && it.ship, c.warns.join('; '), it && it.url].map(q).join(','));
    }));
    const url = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'reno-budget.csv' }); a.click(); URL.revokeObjectURL(url);
  };

  document.body.insertAdjacentHTML('beforeend', `<datalist id="areas">${AREAS.map(a => `<option value="${a}">`).join('')}</datalist>`);

  // "Add to budget" from a card on the Materials page
  const add = new URLSearchParams(location.search).get('add');
  if (add && byId[add]) { addLine(add); history.replaceState(null, '', 'budget.html'); }
  else render();
})();
