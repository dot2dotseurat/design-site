(async function () {
  const res = await fetch('data.json');
  const data = await res.json();
  const items = data.items.map((it, i) => ({ ...it, order: i }));
  const ROOM_NOTES = {
    Deck: 'Outdoor floor — needs to survive freeze/thaw',
    Closets: 'Closet doors, interiors and wardrobe panels',
    Wallpaper: 'Murals and wallpaper, priced per square meter',
    Bathroom: 'Floor and wall options',
    Kitchen: 'Backsplash',
    Liners: 'Pencil liners and trim to run with the bathroom tile'
  };
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const rooms = [...new Set(items.filter(i => i.kind !== 'liner').map(i => i.room))];
  const palettes = data.palettes || [];
  let active = 'All';
  let sort = 'lead';

  const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
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
    const n = r === 'All' ? items.filter(i => i.kind !== 'liner').length : items.filter(i => i.room === r).length;
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
    const lf = it.kind === 'liner';
    return `<article class="card${lf ? ' card--liner' : ''}" id="card-${it.id}">
      <button class="card__media" type="button" data-id="${it.id}" aria-label="Enlarge photo of ${esc(it.name)}">
        <img src="${a}" alt="${esc(it.name)}" loading="lazy">
        ${b ? `<img class="alt" src="${b}" alt="" loading="lazy"><span class="hint">${it.id === 'D6' ? 'Hover: second color' : it.kind === 'wallcovering' ? 'Hover: in a room' : 'Hover: installed'}</span>` : ''}
        ${tag}
        ${it.fit && it.fit.level === 'poor' ? `<span class="tag tag--poor">Poor fit for ${it.id === 'B4' ? 'floors' : 'NYC deck'}</span>` : ''}
      </button>
      <div class="card__body">
        <p class="vendor">${esc(it.vendor)}</p>
        <h3>${esc(it.name)}</h3>
        <p class="spec">${esc(it.material)} · ${esc(it.size)} · ${esc(it.finish)}</p>
        <p class="price"><strong>${fmt(it.price_sqft)}</strong><span>/ ${lf ? 'linear ft' : 'sq ft'} · ${fmt(it.unit_price)} per ${esc(it.unit)}</span></p>
        <p class="spec">${it.sqft_needed ? `Estimate: <strong>${fmt(Math.ceil(it.sqft_needed * (1 + (it.overage ?? 0.15)) / it.sqft_per_unit) * it.unit_price)}</strong> for ${it.sqft_needed} sq ft + ${Math.round((it.overage ?? 0.15) * 100)}% overage` : (lf ? 'Estimate: add linear ft in the budget sheet' : 'Estimate: add sq ft in the budget sheet')}</p>
        <dl>
          <dt>Ships</dt><dd>${esc(it.ship)}</dd>
          <dt>Sample</dt><dd>${esc(it.sample)}</dd>
          ${it.kind === 'tile' ? `<dt>Outdoor</dt><dd>${esc(it.outdoor)}</dd>` : ''}
        </dl>
        ${it.moved ? `<p class="moved">${esc(it.moved)}</p>` : ''}
        ${(it.uses || []).length ? `<div class="uses"><span>Best for</span>${it.uses.map(u => `<em>${esc(u)}</em>`).join('')}</div>` : ''}
        ${it.fit ? `<div class="fit fit--${it.fit.level}"><p class="fit__h">NYC + kids: <strong>${{ good: 'Good fit', caution: 'Use with care', poor: 'Poor fit' }[it.fit.level]}</strong></p><ul>${it.fit.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
        ${flags ? `<ul class="flags">${flags}</ul>` : ''}
        ${(it.liners || []).length ? `<div class="liners"><p class="pairs__h">Liners that match</p>${it.liners.map(id => { const l = byId[id]; return l ? `<a class="liner" href="${l.url}" target="_blank" rel="noopener"><img src="${l.local[0]}" alt=""><span><strong>${esc(l.name)}</strong>${fmt(l.price_sqft)} / linear ft · ${esc(l.ship)}${l.fit && l.fit.level !== 'good' ? ` · <i>${esc(l.fit.notes[0])}</i>` : ''}</span></a>` : ''; }).join('')}</div>` : ''}
        ${(it.pairings || []).length ? `<div class="pairs"><p class="pairs__h">Palettes to try</p>${it.pairings.map(p => `<div class="pair">
          <div class="pair__strip">${p.colors.map(([hex, label]) => `<button class="pair__sw" style="background:${hex}" data-hex="${hex}" title="${esc(label)} ${hex} — click to copy" aria-label="${esc(label)} ${hex}"></button>`).join('')}</div>
          <p class="pair__name"><strong>${esc(p.name)}</strong> <span>${esc(p.rule)}</span></p>
          <p class="pair__names">${p.colors.map(c => esc(c[1])).join(' · ')}</p>
          <p class="pair__why">${esc(p.why)}</p></div>`).join('')}</div>` : ''}
        <div class="card__foot"><a href="${it.url}" target="_blank" rel="noopener">View at ${esc(it.vendor)} ↗</a><span class="id">${it.id}</span></div>
      </div>
    </article>`;
  }

  function sorted(list) {
    const l = [...list];
    if (sort === 'price') l.sort((a, b) => (a.price_sqft - b.price_sqft) || ((a.lead_wk ?? 99) - (b.lead_wk ?? 99)));
    else if (sort === 'lead') l.sort((a, b) => ((a.lead_wk ?? 99) - (b.lead_wk ?? 99)) || (a.price_sqft - b.price_sqft));
    else l.sort((a, b) => a.order - b.order);
    return l;
  }

  function paletteHTML() {
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    return `<section class="room" id="room-palettes"><div class="wrap">
      <div class="room__head"><h2>Palettes</h2><span class="room__meta">Bathroom combinations, with liners · click a tile to jump to its card</span></div>
      <div class="palettes">${palettes.map(p => `<article class="pal">
        <div class="pal__strip">${p.colors.map(([hex, label]) => `<div class="pal__sw${lum(hex) > 0.45 ? ' light' : ''}" style="background:${hex}"><span>${esc(label)}<br>${hex}</span></div>`).join('')}</div>
        <div class="pal__body"><h3>${esc(p.name)}</h3><p>${esc(p.note)}</p>
        <ul class="pal__picks">${p.picks.map(([id, role]) => { const it = byId[id]; return it ? `<li><a href="#card-${id}" data-jump="${id}"><img src="${it.local[0]}" alt=""><span><strong>${esc(role)}</strong>${esc(it.name)} · ${fmt(it.price_sqft)}/${it.kind === 'liner' ? 'lf' : 'sf'}</span></a></li>` : ''; }).join('')}</ul></div>
      </article>`).join('')}</div>
    </div></section>`;
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
  document.getElementById('rooms').addEventListener('click', e => {
    const a = e.target.closest('[data-jump]'); if (!a) return;
    e.preventDefault();
    const id = a.dataset.jump;
    if (active !== 'All') { active = 'All'; [...filters.children].forEach(c => c.setAttribute('aria-pressed', c.textContent.startsWith('All'))); render(); }
    const el = document.getElementById('card-' + id);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
  });
  if (location.hash.startsWith('#card-')) {
    const el = document.querySelector(location.hash);
    if (el) setTimeout(() => { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); }, 300);
  }
  document.addEventListener('click', e => {
    const sw = e.target.closest('.pair__sw'); if (!sw) return;
    navigator.clipboard?.writeText(sw.dataset.hex); sw.classList.add('copied'); setTimeout(() => sw.classList.remove('copied'), 900);
  });
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
