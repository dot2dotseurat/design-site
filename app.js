(async function () {
  const res = await fetch('data.json');
  const data = await res.json();
  const items = data.items.map((it, i) => ({ ...it, order: i }));
  const ROOM_NOTES = {
    Deck: 'Outdoor floor — needs to survive freeze/thaw',
    Bathroom: 'Floor and wall options',
    Kitchen: 'Backsplash'
  };
  const rooms = [...new Set(items.map(i => i.room))];
  let active = 'All';
  let sort = 'default';

  const fmt = n => '$' + n.toFixed(2);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isBad = f => /NOT frost|not publish|Longest lead/i.test(f);

  document.getElementById('checked').textContent =
    new Date(data.checked + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // filters
  const filters = document.getElementById('filters');
  ['All', ...rooms].forEach(r => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    const n = r === 'All' ? items.length : items.filter(i => i.room === r).length;
    b.innerHTML = `${esc(r)}<small>${n}</small>`;
    b.setAttribute('aria-pressed', r === active);
    b.onclick = () => { active = r; [...filters.children].forEach(c => c.setAttribute('aria-pressed', c === b)); render(); };
    filters.appendChild(b);
  });
  document.getElementById('sort').onchange = e => { sort = e.target.value; render(); };

  function card(it) {
    const [a, b] = it.local;
    const slow = it.lead_wk == null ? 'Ship time unknown' : it.lead_wk >= 4 ? `~${it.lead_wk} wks` : null;
    const tag = slow ? `<span class="tag tag--slow">${esc(slow)}</span>` : `<span class="tag">${esc(it.stock)}</span>`;
    const flags = (it.flags || []).map(f => `<li class="${isBad(f) ? 'bad' : ''}">${esc(f)}</li>`).join('');
    return `<article class="card">
      <button class="card__media" type="button" data-id="${it.id}" aria-label="Enlarge photo of ${esc(it.name)}">
        <img src="${a}" alt="${esc(it.name)}" loading="lazy">
        ${b ? `<img class="alt" src="${b}" alt="" loading="lazy"><span class="hint">Hover: installed</span>` : ''}
        ${tag}
      </button>
      <div class="card__body">
        <p class="vendor">${esc(it.vendor)}</p>
        <h3>${esc(it.name)}</h3>
        <p class="spec">${esc(it.material)} · ${esc(it.size)} · ${esc(it.finish)}</p>
        <p class="price"><strong>${fmt(it.price_sqft)}</strong><span>/ sq ft · ${fmt(it.unit_price)} per ${esc(it.unit)}</span></p>
        <p class="spec">${it.sqft_needed ? `Estimate: <strong>${fmt(Math.ceil(it.sqft_needed * (1 + (it.overage ?? 0.15)) / it.sqft_per_unit) * it.unit_price)}</strong> for ${it.sqft_needed} sq ft + ${Math.round((it.overage ?? 0.15) * 100)}% overage` : 'Estimate: add sq ft in the budget sheet'}</p>
        <dl>
          <dt>Ships</dt><dd>${esc(it.ship)}</dd>
          <dt>Sample</dt><dd>${esc(it.sample)}</dd>
          <dt>Outdoor</dt><dd>${esc(it.outdoor)}</dd>
        </dl>
        ${flags ? `<ul class="flags">${flags}</ul>` : ''}
        <div class="card__foot"><a href="${it.url}" target="_blank" rel="noopener">View at ${esc(it.vendor)} ↗</a><span class="id">${it.id}</span></div>
      </div>
    </article>`;
  }

  function sorted(list) {
    const l = [...list];
    if (sort === 'price') l.sort((a, b) => a.price_sqft - b.price_sqft);
    else if (sort === 'lead') l.sort((a, b) => (a.lead_wk ?? 99) - (b.lead_wk ?? 99));
    else l.sort((a, b) => a.order - b.order);
    return l;
  }

  function render() {
    const show = active === 'All' ? rooms : [active];
    let total = 0;
    document.getElementById('rooms').innerHTML = show.map(r => {
      const list = sorted(items.filter(i => i.room === r));
      total += list.length;
      const p = list.map(i => i.price_sqft);
      const range = `${fmt(Math.min(...p))}–${fmt(Math.max(...p))} / sq ft`;
      return `<section class="room" id="room-${r.toLowerCase()}"><div class="wrap">
        <div class="room__head"><h2>${esc(r)}</h2><span class="room__meta">${esc(ROOM_NOTES[r] || '')} · ${list.length} option${list.length > 1 ? 's' : ''} · ${range}</span></div>
        <div class="grid">${list.map(card).join('')}</div>
      </div></section>`;
    }).join('');
    document.getElementById('count').textContent = `${total} options shown`;
  }
  render();

  // lightbox (click) + tap to toggle installed photo on touch
  const lb = document.getElementById('lightbox'), lbImg = document.getElementById('lbImg'), lbCap = document.getElementById('lbCap');
  document.getElementById('rooms').addEventListener('click', e => {
    const m = e.target.closest('.card__media'); if (!m) return;
    const it = items.find(i => i.id === m.dataset.id);
    const showingAlt = m.matches(':hover') && it.local[1];
    lbImg.src = showingAlt ? it.local[1] : it.local[0];
    lbImg.alt = it.name;
    lbCap.textContent = `${it.name} — ${it.vendor}`;
    lb.hidden = false;
  });
  const close = () => { lb.hidden = true; lbImg.src = ''; };
  document.getElementById('lbClose').onclick = close;
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();
