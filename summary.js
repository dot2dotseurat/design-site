(async function () {
  const { money, money2, esc, calc: calcLine, unitWord, qtyLabel, frostSlip } = BudgetCore;
  const data = await (await fetch('data.json')).json();
  const byId = Object.fromEntries(data.items.map(i => [i.id, i]));
  const calc = l => calcLine(l, byId);
  const root = document.getElementById('op');
  document.getElementById('print').onclick = () => window.print();

  // Which scenario: a share link (?s=) from Supabase, or the current one saved in this browser.
  const cfg = window.SUPABASE_CONFIG || {};
  const id = new URLSearchParams(location.search).get('s');
  let scenario = null;
  if (cfg.url && cfg.anonKey) {
    if (id) {
      const createClient = window.__createClient || (await import('https://esm.sh/@supabase/supabase-js@2')).createClient;
      const sb = createClient(cfg.url, cfg.anonKey);
      const { data: rows } = await sb.rpc('get_scenario', { p_id: id });
      if (rows && rows.length) scenario = { name: rows[0].name, lines: rows[0].lines || [], updated: rows[0].updated_at };
    }
  } else {
    try { const s = JSON.parse(localStorage.getItem('reno.budget')); scenario = s.scenarios.find(x => x.id === s.current) || s.scenarios[0]; } catch (e) {}
  }
  if (!scenario) { root.innerHTML = '<p class="op__loading">Nothing to show here. Open this page from the Budget page, or use a share link.</p>'; return; }

  const rows = scenario.lines.map(l => ({ l, c: calc(l) })).filter(r => r.c.it)
    .sort((a, b) => (a.l.area || '').localeCompare(b.l.area || ''));
  const total = rows.reduce((a, r) => a + r.c.cost, 0);
  const slowest = rows.filter(r => r.c.cost).map(r => r.c.it.lead_wk);
  const slowText = !slowest.length ? '—' : slowest.some(v => v == null) ? 'Some ship times unknown' : `${Math.max(...slowest)} wk longest`;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const checked = new Date(data.checked + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const ship = it => it.lead_wk == null ? 'Not stated' : it.lead_wk <= 1 ? '~1 wk' : `~${it.lead_wk} wk`;

  // Things to confirm before ordering, from the fit checks that missed (see REQUIREMENTS.md)
  const KEEP = ['Freeze/thaw', 'Slip', 'Ship time', 'Minimum order', 'Sample', 'Cleanable'];
  const confirm = [];
  rows.forEach(({ l, c }) => {
    (c.it.fit.checks || []).filter(k => k.level !== 'good' && KEEP.includes(k.rule)).forEach(k => confirm.push({ id: c.it.id, name: c.it.name, vendor: c.it.vendor, text: k.detail, level: k.level }));
    c.warns.forEach(w => confirm.push({ id: c.it.id, name: c.it.name, vendor: c.it.vendor, text: w, level: 'caution' }));
  });
  const seen = new Set(); const uniq = confirm.filter(x => { const k = x.id + x.text; if (seen.has(k)) return false; seen.add(k); return true; });

  const LEVEL = { good: 'Good fit', caution: 'Use with care', poor: 'Poor fit' };
  root.innerHTML = `
    <header class="op__head">
      <div><p class="eyebrow">Materials list</p><h1>${esc(scenario.name)}</h1></div>
      <dl class="op__stats">
        <div><dt>Estimated materials</dt><dd>${money(total)}</dd></div>
        <div><dt>Lines</dt><dd>${rows.length}</dd></div>
        <div><dt>Lead time</dt><dd>${esc(slowText)}</dd></div>
        <div><dt>Prepared</dt><dd>${today}</dd></div>
      </dl>
    </header>
    <table class="op__table">
      <thead><tr><th></th><th>Area</th><th>Material</th><th>Order</th><th class="num">Cost</th><th>Ships</th><th>Frost / slip</th><th>Orders</th><th>Notes</th></tr></thead>
      <tbody>${rows.map(({ l, c }) => { const it = c.it, fs = frostSlip(it); return `<tr>
        <td class="op__thumb"><img src="${esc(it.local[0])}" alt=""></td>
        <td>${esc(l.area || '—')}</td>
        <td><a href="${esc(it.url)}" target="_blank" rel="noopener"><strong>${esc(it.name)}</strong></a><small>${esc(it.vendor)} · ${esc(it.id)}${it.kind === 'wallcovering' ? '' : ' · ' + esc(it.size)}</small></td>
        <td><strong>${c.units ? `${c.units} ${esc(unitWord(it, c.units))}` : '—'}</strong><small>${c.need ? `${Math.round(c.need * 10) / 10} ${qtyLabel(it)} + ${esc(l.over)}%` : ''}</small></td>
        <td class="num">${c.cost ? money(c.cost) : '—'}</td>
        <td>${esc(ship(it))}</td>
        <td><span class="op__fit op__fit--${it.fit.level}">${esc(LEVEL[it.fit.level])}</span><small>${esc(fs.frost)} · ${esc(fs.slip)}</small></td>
        <td>${esc(l.orderer && l.orderer !== 'TBD' ? l.orderer : '—')}</td>
        <td class="op__note">${esc(l.note || '')}</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><td colspan="4">Estimated total, before freight, tax, grout, setting materials and labor</td><td class="num">${money(total)}</td><td colspan="4"></td></tr></tfoot>
    </table>
    ${uniq.length ? `<section class="op__confirm"><h2>Confirm before ordering</h2><ul>${uniq.map(x => `<li class="${x.level}"><strong>${esc(x.id)}</strong> ${esc(x.vendor)}: ${esc(x.text)}</li>`).join('')}</ul></section>` : ''}
    <footer class="op__foot">Prices, stock and ship times checked ${checked}; vendors change them often. Frost and slip ratings are the vendor's own listings, not an installer's review. Quantities include the overage shown and assume full boxes.</footer>`;
})();
