(async () => {
  const data = await (await fetch('data.json')).json();
  const items = data.items, byId = Object.fromEntries(items.map(i => [i.id, i]));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const money = n => n == null ? '—' : '$' + Number(n).toFixed(2);
  const strip = cols => `<div class="pal__strip">${cols.map(([hex, label]) => `<button class="pal__sw${lum(hex) > 0.45 ? ' light' : ''}" style="background:${hex}" data-hex="${hex}" title="Copy ${hex}"><span>${esc(label)}<br>${hex}</span></button>`).join('')}</div>`;

  document.getElementById('tilePals').innerHTML = (data.palettes || []).map(p => `<article class="pal">
    ${strip(p.colors)}
    <div class="pal__body"><h3>${esc(p.name)}</h3><p>${esc(p.note)}</p>
    <ul class="pal__picks">${p.picks.map(([id, role]) => { const it = byId[id]; return it ? `<li><a href="index.html#card-${id}"><img src="${it.local[0]}" alt=""><span><strong>${esc(role)}</strong>${esc(it.name)} · ${money(it.price_sqft)}/${it.kind === 'liner' ? 'lf' : 'sf'}</span></a></li>` : ''; }).join('')}</ul></div>
  </article>`).join('');

  document.getElementById('inspoPals').innerHTML = (data.inspiration || []).map(p => `<article class="pal pal--inspo">
    <button class="inspo__img" data-src="${p.img}" data-cap="${esc(p.name)}"><img src="${p.img}" alt="${esc(p.name)} interior" loading="lazy"></button>
    <div class="inspo__side">
      <div class="pal__body"><h3>${esc(p.name)}</h3><p>${esc(p.note)}</p></div>
      ${strip(p.colors)}
    </div>
  </article>`).join('');

  document.addEventListener('click', e => {
    const sw = e.target.closest('.pal__sw');
    if (sw) { navigator.clipboard?.writeText(sw.dataset.hex); sw.classList.add('copied'); setTimeout(() => sw.classList.remove('copied'), 900); }
    const im = e.target.closest('.inspo__img');
    if (im) { lbImg.src = im.dataset.src; lbCap.textContent = im.dataset.cap; lightbox.hidden = false; }
  });
  const lightbox = document.getElementById('lightbox'), lbImg = document.getElementById('lbImg'), lbCap = document.getElementById('lbCap');
  const close = () => { lightbox.hidden = true; };
  document.getElementById('lbClose').onclick = close;
  lightbox.addEventListener('click', e => { if (e.target === lightbox) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();
