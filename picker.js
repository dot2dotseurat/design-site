// A "choose a tile from the board" dialog, shared by the room pages.
//   Picker.open({ items, kind: 'all' | 'tile' | 'liner' | 'wallcovering', title, onPick(id) })
window.Picker = (function () {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LEVEL = { good: 'Good fit', caution: 'Use with care', poor: 'Poor fit' };
  let root, state;
  function ensure() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'lightbox lay__picker'; root.hidden = true;
    root.innerHTML = `<div class="lay__pickbox" role="dialog" aria-label="Choose a material">
      <div class="lay__pickhead"><input type="search" id="pkSearch" placeholder="Search the board" aria-label="Search materials"><span id="pkKinds"></span><label class="poor"><input type="checkbox" id="pkPoor"><span>Include hidden and poor fits</span></label><button class="btn" id="pkClose" type="button">Close</button></div>
      <div class="lay__pickgrid" id="pkGrid"></div></div>`;
    document.body.appendChild(root);
    root.addEventListener('click', e => {
      if (e.target === root || e.target.closest('#pkClose')) root.hidden = true;
      const k = e.target.closest('[data-pkkind]'); if (k) { state.kind = k.dataset.pkkind; render(); }
      const p = e.target.closest('[data-pkpick]'); if (p) { root.hidden = true; state.onPick(p.dataset.pkpick); }
    });
    root.querySelector('#pkSearch').addEventListener('input', render);
    root.querySelector('#pkPoor').addEventListener('change', render);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.hidden) root.hidden = true; });
  }
  function render() {
    const q = root.querySelector('#pkSearch').value.toLowerCase(), poor = root.querySelector('#pkPoor').checked;
    const kinds = [['all', 'All'], ['tile', 'Tiles'], ['liner', 'Liners'], ['wallcovering', 'Wallpaper']];
    root.querySelector('#pkKinds').innerHTML = kinds.map(([k, l]) => `<button type="button" class="chip" data-pkkind="${k}" aria-pressed="${state.kind === k}">${l}</button>`).join('');
    const list = state.items.filter(i => (state.kind === 'all' || i.kind === state.kind) && (poor || !(i.fit.level === 'poor' || i.hidden)) && (!q || (i.name + i.vendor + i.id + i.room).toLowerCase().includes(q)));
    root.querySelector('#pkGrid').innerHTML = list.map(i => `<button class="lay__pick" type="button" data-pkpick="${i.id}"><img src="${esc(i.local[0])}" alt=""><strong>${esc(i.name)}</strong><span>${esc(i.vendor)} · ${i.id}${i.geom ? ` · ${i.geom.w}×${i.geom.h}"` : ''}</span><span class="op__fit op__fit--${i.fit.level}">${LEVEL[i.fit.level]}</span></button>`).join('') || '<p>Nothing matches.</p>';
  }
  function open(opts) {
    ensure(); state = { items: opts.items, kind: opts.kind || 'all', onPick: opts.onPick };
    root.hidden = false; const s = root.querySelector('#pkSearch'); s.value = ''; render(); s.focus();
  }
  return { open };
})();
