(async function () {
  const { money, money2, esc, isPoor, defaultOver, qtyLabel, calc: calcLine, unitWord, ORDERERS } = BudgetCore;
  const data = await (await fetch('data.json')).json();
  const items = data.items, byId = Object.fromEntries(items.map(i => [i.id, i]));
  const calc = line => calcLine(line, byId);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const LOCAL = 'reno.budget';
  const AREAS = ['Deck', 'Hall bath', 'Kids bath', 'Powder room', 'Kitchen', 'Dining room', 'Basement', 'Closets', 'Hallway'];
  const $ = id => document.getElementById(id);

  // ---- storage: this browser, or Supabase when supabase-config.js is filled in ----
  const cfg = window.SUPABASE_CONFIG || {};
  const remote = !!(cfg.url && cfg.anonKey);
  const sharedId = new URLSearchParams(location.search).get('s');
  const readonly = remote && !!sharedId;
  let sb = null, session = null, notice = '';
  if (remote) {
    const createClient = window.__createClient || (await import('https://esm.sh/@supabase/supabase-js@2')).createClient;
    sb = createClient(cfg.url, cfg.anonKey);
    session = (await sb.auth.getSession()).data.session;
    sb.auth.onAuthStateChange((event, s) => { if (event === 'SIGNED_IN' && !session) location.replace(location.pathname + location.search); });
  }
  const signedIn = !!session;
  const canEdit = remote ? signedIn && !readonly : true;

  let state = { current: null, scenarios: [] };
  const readLocal = () => { try { const s = JSON.parse(localStorage.getItem(LOCAL)); return s && s.scenarios && s.scenarios.length ? s : null; } catch (e) { return null; } };
  const writeLocal = () => { try { localStorage.setItem(LOCAL, JSON.stringify(state)); } catch (e) {} };

  if (!remote) {
    state = readLocal() || { current: null, scenarios: [{ id: uid(), name: 'Base case', lines: [] }] };
  } else if (readonly) {
    const { data: rows, error } = await sb.rpc('get_scenario', { p_id: sharedId });
    if (error || !rows || !rows.length) notice = 'This share link is not valid, or the scenario was deleted.';
    else state.scenarios = [{ id: rows[0].id, name: rows[0].name, lines: rows[0].lines || [] }];
  } else if (signedIn) {
    const { data: rows, error } = await sb.from('scenarios').select('id,name,lines').order('created_at');
    if (error) notice = 'Could not load your scenarios: ' + error.message;
    else state.scenarios = rows.map(r => ({ id: r.id, name: r.name, lines: r.lines || [] }));
    if (!state.scenarios.length && !error) {
      const made = await createRemote('Base case', []);
      if (made) state.scenarios.push(made);
    }
  }
  if (!state.scenarios.some(s => s.id === state.current)) state.current = (state.scenarios[0] || {}).id || null;
  const cur = () => state.scenarios.find(s => s.id === state.current);
  let showPoor = false;

  async function createRemote(name, lines) {
    const { data: row, error } = await sb.from('scenarios').insert({ name, lines }).select('id,name,lines').single();
    if (error) { alert('Could not save: ' + error.message); return null; }
    return { id: row.id, name: row.name, lines: row.lines || [] };
  }
  const timers = {};
  function persist(s) {
    if (!remote) return writeLocal();
    if (readonly || !s) return;
    clearTimeout(timers[s.id]);
    timers[s.id] = setTimeout(async () => {
      setSaving('Saving…');
      const { error } = await sb.from('scenarios').update({ name: s.name, lines: s.lines }).eq('id', s.id);
      setSaving(error ? 'Not saved: ' + error.message : 'Saved');
    }, 500);
  }
  function setSaving(t) { const el = $('saveState'); if (el) el.textContent = t; }

  async function newScenario(name, lines) {
    if (remote) { const s = await createRemote(name, lines); if (!s) return; state.scenarios.push(s); state.current = s.id; }
    else { const s = { id: uid(), name, lines }; state.scenarios.push(s); state.current = s.id; writeLocal(); }
    render();
  }
  async function dropScenario(id) {
    if (remote) { const { error } = await sb.from('scenarios').delete().eq('id', id); if (error) { alert('Could not delete: ' + error.message); return; } }
    state.scenarios = state.scenarios.filter(s => s.id !== id);
    if (!state.scenarios.length) { if (remote) { await newScenario('Base case', []); return; } state.scenarios.push({ id: uid(), name: 'Base case', lines: [] }); }
    state.current = state.scenarios[0].id; if (!remote) writeLocal(); render();
  }

  // ---- rendering ----
  function materialOptions(selected) {
    const rooms = [...new Set(items.map(i => i.room))];
    return '<option value="">Choose a material…</option>' + rooms.map(r => {
      const list = items.filter(i => i.room === r && (showPoor || !(isPoor(i) || i.hidden) || i.id === selected));
      return list.length ? `<optgroup label="${esc(r)}">${list.map(i => `<option value="${i.id}"${i.id === selected ? ' selected' : ''}>${esc(i.id)} · ${esc(i.name)} (${money2(i.price_sqft)}/${i.kind === 'liner' ? 'lf' : 'sf'})</option>`).join('')}</optgroup>` : '';
    }).join('');
  }
  const orderHTML = c => c.units ? `<strong>${c.units} ${unitWord(c.it, c.units)}</strong><small>${Math.round(c.covered * 10) / 10} ${qtyLabel(c.it)}${c.it.unit_price ? ` · ${money2(c.it.unit_price)} each` : ''}</small>` : '<small>Add a material and a surface</small>';
  const dis = readonly ? ' disabled' : '';

  function chrome() {
    const loggedOutRemote = remote && !signedIn && !readonly;
    $('authBar').innerHTML = !remote ? '<span class="auth__note">Saved in this browser only</span>'
      : readonly ? '<span class="auth__note">Shared, read-only view</span>'
      : signedIn ? `<span class="auth__note">Signed in as ${esc(session.user.email)} · <span id="saveState">Saved</span></span><button class="btn" id="shareBtn" type="button">Copy share link</button><a class="btn" id="summaryBtn" href="summary.html?s=${esc(state.current || '')}" target="_blank" rel="noopener">One-pager</a><button class="btn btn--quiet" id="signOut" type="button">Sign out</button>`
      : '<form id="signInForm" class="signin"><input type="email" id="signInEmail" placeholder="you@example.com" required aria-label="Email"><button class="btn btn--primary" type="submit">Email me a sign-in link</button></form>';
    if (!remote) $('authBar').innerHTML += ' <a class="btn" href="summary.html" target="_blank" rel="noopener">One-pager</a>';
    $('editTools').hidden = readonly || loggedOutRemote;
    $('lines').hidden = loggedOutRemote; $('totals').hidden = loggedOutRemote; $('compare').hidden = loggedOutRemote || readonly;
    $('notice').hidden = !notice && !loggedOutRemote;
    $('notice').textContent = notice || (loggedOutRemote ? 'Sign in to see and edit your budget. A scenario shared with you opens from its link without signing in.' : '');
    const lo = readLocalIfRemote();
    if (remote && signedIn && !readonly && lo) $('authBar').insertAdjacentHTML('beforeend', `<button class="btn" id="importBtn" type="button">Import ${lo.scenarios.length} browser scenario${lo.scenarios.length === 1 ? '' : 's'}</button>`);
  }
  const readLocalIfRemote = () => { const l = readLocal(); return l && l.scenarios.some(s => s.lines.length) ? l : null; };

  function render() {
    chrome();
    if (remote && !signedIn && !readonly) return;
    const s = cur();
    if (!s) { $('budTable').innerHTML = ''; $('scenarioName').textContent = ''; return; }
    $('scenario').innerHTML = state.scenarios.map(x => `<option value="${x.id}"${x.id === s.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    $('scenarioName').textContent = s.name;
    const rows = s.lines.map(l => ({ l, c: calc(l) }));
    const total = rows.reduce((a, r) => a + r.c.cost, 0);
    $('scenarioMeta').textContent = `${s.lines.length} line${s.lines.length === 1 ? '' : 's'} · ${money(total)}`;
    $('addLine').hidden = readonly;
    $('budTable').innerHTML = s.lines.length ? `
      <div class="bud__row bud__row--head"><span>Area</span><span>Material</span><span>Surface to cover</span><span>Overage</span><span>You'd order</span><span>Cost</span><span></span></div>
      ${rows.map(({ l, c }) => `<div class="bud__row" data-line="${l.id}">
        <span><input list="areas" data-f="area" value="${esc(l.area)}" placeholder="Area" aria-label="Area"${dis}></span>
        <span><select data-f="item" aria-label="Material"${dis}>${materialOptions(l.item)}</select></span>
        <span class="bud__qty"><input data-f="qty" value="${esc(l.qty)}" placeholder="e.g. 120 or 10x8" inputmode="decimal" aria-label="Surface to cover"${dis}><small>${c.need ? Math.round(c.need * 10) / 10 + ' ' + qtyLabel(c.it) : qtyLabel(c.it)}</small></span>
        <span class="bud__over"><input data-f="over" type="number" min="0" max="100" step="1" value="${esc(l.over)}" aria-label="Overage percent"${dis}><small>%</small></span>
        <span class="bud__order">${orderHTML(c)}</span>
        <span class="bud__cost">${c.cost ? money(c.cost) : '—'}</span>
        <span>${readonly ? '' : `<button class="bud__x" data-del="${l.id}" type="button" aria-label="Remove line">×</button>`}</span>
        <span class="bud__meta"><label>Who orders <select data-f="orderer" aria-label="Who orders"${dis}>${ORDERERS.map(o => `<option${(l.orderer || 'TBD') === o ? ' selected' : ''}>${o}</option>`).join('')}</select></label>
          <label class="bud__note">Note <input data-f="note" value="${esc(l.note)}" placeholder="e.g. samples first, confirm frost with Zia" aria-label="Note"${dis}></label></span>
        ${c.warns.length ? `<p class="bud__warn">${c.warns.map(esc).join(' · ')}</p>` : ''}
        ${c.it ? `<p class="bud__ship">${esc(c.it.ship)}</p>` : ''}
      </div>`).join('')}` : `<p class="bud__empty">${readonly ? 'This scenario has no lines.' : 'No lines yet. Add one, or use “Add to budget” on a card on the Materials page.'}</p>`;

    const byArea = {};
    rows.forEach(({ l, c }) => { const k = (l.area || 'No area').trim() || 'No area'; byArea[k] = (byArea[k] || 0) + c.cost; });
    const leads = rows.filter(r => r.c.it && r.c.cost).map(r => r.c.it.lead_wk);
    const longest = leads.length ? (leads.some(v => v == null) ? 'Some ship times unknown' : `${Math.max(...leads)} week${Math.max(...leads) === 1 ? '' : 's'} for the slowest item`) : '—';
    $('budTotals').innerHTML = `
      <div class="bud-total bud-total--big"><span>${esc(s.name)}</span><strong>${money(total)}</strong><small>${esc(longest)}</small></div>
      <ul class="bud-areas">${Object.entries(byArea).map(([k, v]) => `<li><span>${esc(k)}</span><b>${money(v)}</b></li>`).join('') || '<li><span>No areas yet</span><b>—</b></li>'}</ul>`;

    const comp = state.scenarios.map(x => ({ x, t: x.lines.reduce((a, l) => a + calc(l).cost, 0), n: x.lines.length }));
    const base = comp.find(c => c.x.id === s.id).t;
    $('budCompare').innerHTML = `
      <div class="bud__row bud__row--head bud__row--cmp"><span>Scenario</span><span>Lines</span><span>Total</span><span>vs. this scenario</span></div>
      ${comp.map(c => `<div class="bud__row bud__row--cmp${c.x.id === s.id ? ' is-current' : ''}"><span><button class="linkbtn" data-open="${c.x.id}" type="button">${esc(c.x.name)}</button></span><span>${c.n}</span><span class="bud__cost">${money(c.t)}</span><span>${c.x.id === s.id ? '—' : (c.t - base >= 0 ? '+' : '−') + money(Math.abs(c.t - base))}</span></div>`).join('')}`;
  }

  // ---- editing ----
  const table = $('budTable');
  table.addEventListener('input', e => {
    const f = e.target.dataset.f; if (!f || readonly) return;
    const s = cur(), l = s.lines.find(x => x.id === e.target.closest('[data-line]').dataset.line);
    l[f] = e.target.value;
    if (f === 'item' && byId[l.item]) l.over = String(defaultOver(byId[l.item]));
    persist(s);
    if (f === 'item') render(); else refreshRow(e.target.closest('[data-line]'), l);
  });
  function refreshRow(rowEl, l) {
    const c = calc(l);
    rowEl.querySelector('.bud__order').innerHTML = orderHTML(c);
    rowEl.querySelector('.bud__cost').textContent = c.cost ? money(c.cost) : '—';
    rowEl.querySelector('.bud__qty small').textContent = c.need ? Math.round(c.need * 10) / 10 + ' ' + qtyLabel(c.it) : qtyLabel(c.it);
    let w = rowEl.querySelector('.bud__warn');
    if (c.warns.length) { if (!w) { w = document.createElement('p'); w.className = 'bud__warn'; rowEl.appendChild(w); } w.textContent = c.warns.join(' · '); } else if (w) w.remove();
    const s = cur(); const tot = s.lines.reduce((a, x) => a + calc(x).cost, 0);
    $('scenarioMeta').textContent = `${s.lines.length} line${s.lines.length === 1 ? '' : 's'} · ${money(tot)}`;
  }
  table.addEventListener('focusout', () => setTimeout(() => { if (!table.contains(document.activeElement)) render(); }, 50));
  table.addEventListener('click', e => {
    const d = e.target.closest('[data-del]'); if (!d || readonly) return;
    const s = cur(); s.lines = s.lines.filter(l => l.id !== d.dataset.del); persist(s); render();
  });
  const addLine = (item, area) => {
    const it = item && byId[item], s = cur();
    s.lines.push({ id: uid(), area: area || (it ? it.room : ''), item: it ? it.id : '', qty: '', over: String(defaultOver(it)), orderer: 'TBD', note: '' });
    persist(s); render();
    const rows = document.querySelectorAll('[data-line]'); const last = rows[rows.length - 1];
    if (last) last.querySelector('[data-f="qty"]').focus();
  };
  $('addLine').onclick = () => addLine();
  $('scenario').onchange = e => { state.current = e.target.value; if (!remote) writeLocal(); render(); };
  $('newScenario').onclick = () => { const name = prompt('Name this scenario (for example, “Tight budget”)', 'New scenario'); if (name) newScenario(name.trim(), []); };
  $('dupScenario').onclick = () => { const c = cur(); const name = prompt('Name the copy', c.name + ' (copy)'); if (name) newScenario(name.trim(), c.lines.map(l => ({ ...l, id: uid() }))); };
  $('renameScenario').onclick = () => { const s = cur(); const n = prompt('Rename scenario', s.name); if (n) { s.name = n.trim(); persist(s); render(); } };
  $('delScenario').onclick = () => {
    const s = cur();
    if (state.scenarios.length === 1 && !s.lines.length) return;
    if (!confirm(`Delete “${s.name}”?${remote ? ' Its share link will stop working.' : ''}`)) return;
    dropScenario(s.id);
  };
  $('budCompare').addEventListener('click', e => { const o = e.target.closest('[data-open]'); if (o) { state.current = o.dataset.open; if (!remote) writeLocal(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  $('showPoor').onchange = e => { showPoor = e.target.checked; render(); };

  // ---- auth, sharing, import ----
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'signInForm') return;
    e.preventDefault();
    const email = $('signInEmail').value.trim();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    $('notice').hidden = false;
    $('notice').textContent = error ? 'Could not send the link: ' + error.message : `Check ${email} for a sign-in link.`;
  });
  document.addEventListener('click', async e => {
    const id = e.target.id;
    if (id === 'signOut') { await sb.auth.signOut(); location.replace(location.pathname); }
    if (id === 'shareBtn') {
      const url = `${location.origin}${location.pathname}?s=${state.current}`;
      try { await navigator.clipboard.writeText(url); e.target.textContent = 'Link copied'; } catch (err) { prompt('Copy this link', url); }
      setTimeout(() => { e.target.textContent = 'Copy share link'; }, 1500);
    }
    if (id === 'importBtn') {
      const lo = readLocal(); if (!lo) return;
      for (const sc of lo.scenarios.filter(x => x.lines.length)) { const made = await createRemote(sc.name, sc.lines); if (made) state.scenarios.push(made); }
      try { localStorage.removeItem(LOCAL); } catch (err) {}
      render();
    }
  });

  $('csv').onclick = () => {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const head = ['Scenario', 'Area', 'ID', 'Material', 'Vendor', 'Surface to cover', 'Unit of surface', 'Overage %', 'Units to order', 'Unit', 'Unit price', 'Cost', 'Who orders', 'Ship time', 'Notes', 'Link'];
    const out = [head.map(q).join(',')];
    state.scenarios.forEach(s => s.lines.forEach(l => {
      const c = calc(l); const it = c.it;
      out.push([s.name, l.area, it && it.id, it && it.name, it && it.vendor, c.need ? Math.round(c.need * 100) / 100 : '', it ? qtyLabel(it) : '', l.over, c.units || '', it && it.unit, it && it.unit_price, c.cost ? Math.round(c.cost * 100) / 100 : '', l.orderer || '', it && it.ship, [l.note, ...c.warns].filter(Boolean).join('; '), it && it.url].map(q).join(','));
    }));
    const url = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'reno-budget.csv' }); a.click(); URL.revokeObjectURL(url);
  };

  document.body.insertAdjacentHTML('beforeend', `<datalist id="areas">${AREAS.map(a => `<option value="${a}">`).join('')}</datalist>`);

  // Lines sent from the Layout page: ?lines=<base64 json>
  const sent = new URLSearchParams(location.search).get('lines');
  if (sent && canEdit && cur()) {
    try {
      const incoming = JSON.parse(decodeURIComponent(escape(atob(sent))));
      const s = cur();
      incoming.forEach(l => { if (byId[l.item]) s.lines.push({ id: uid(), area: l.area || '', item: l.item, qty: String(l.qty || ''), over: String(l.over ?? defaultOver(byId[l.item])), orderer: l.orderer || 'TBD', note: l.note || '' }); });
      persist(s);
    } catch (e) { notice = 'Could not read the lines sent from the layout.'; }
    history.replaceState(null, '', 'budget.html');
  }

  // "Add to budget" from a card on the Materials page
  const add = new URLSearchParams(location.search).get('add');
  if (add && byId[add] && canEdit && cur()) { addLine(add); history.replaceState(null, '', 'budget.html'); }
  else render();
})();
