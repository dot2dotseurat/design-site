(async function () {
  const { money, esc, calc } = BudgetCore, RC = RoomsCore;
  const [data, rooms] = await Promise.all([fetch('data.json').then(r => r.json()), fetch('rooms.json').then(r => r.json())]);
  const byId = Object.fromEntries(data.items.map(i => [i.id, i]));
  const state = RC.load();
  $ = id => document.getElementById(id);
  $('unitEyebrow').textContent = rooms.unit.name;
  $('unitLede').textContent = rooms.unit.summary;
  $('unitSource').textContent = rooms.unit.source;

  const list = rooms.rooms.map(r => RC.merge(state, r));
  const costOf = r => r.materials.reduce((a, l) => a + calc(l, byId).cost, 0);
  const floors = [...new Set(list.map(r => r.floor))];
  const grand = list.reduce((a, r) => a + costOf(r), 0);
  $('floors').innerHTML = floors.map(f => {
    const rs = list.filter(r => r.floor === f);
    return `<section class="room"><div class="wrap">
      <div class="room__head"><h2>${esc(f)}</h2><span class="room__meta">${rs.length} room${rs.length === 1 ? '' : 's'} · ${money(rs.reduce((a, r) => a + costOf(r), 0))} so far</span></div>
      <div class="rooms__grid">${rs.map(r => {
        const pl = RC.planStyle(rooms.unit, r, 300, 0.25), cost = costOf(r), n = r.materials.length, lay = RC.layoutTotals(r.id);
        return `<a class="rooms__card" href="room.html?room=${r.id}">
          <div class="rooms__plan">${pl ? `<div class="rooms__crop" style="${pl.css}"><span class="rooms__hl" style="left:${pl.box.l}%;top:${pl.box.t}%;width:${pl.box.w}%;height:${pl.box.h}%"></span></div>` : '<span>Floor plan not on this machine</span>'}</div>
          <div class="rooms__body"><h3>${esc(r.name)}</h3>
            <p>${r.h ? `${RC.ftin(r.dims.w)} × ${RC.ftin(r.dims.d)} · ${Math.round(r.dims.w * r.dims.d / 144)} sq ft` : `${RC.ftin(r.dims.w)} × ${RC.ftin(r.dims.d)} · ${Math.round(r.dims.w * r.dims.d / 144)} sq ft`}</p>
            <p class="rooms__stat">${n ? `${n} material${n === 1 ? '' : 's'} · <strong>${money(cost)}</strong>` : 'Nothing chosen yet'}${lay ? ` · layout started` : ''}</p>
            <div class="rooms__thumbs">${r.materials.filter(l => byId[l.item]).slice(0, 5).map(l => `<img src="${esc(byId[l.item].local[0])}" alt="" title="${esc(l.surface)}: ${esc(byId[l.item].name)}">`).join('')}</div>
          </div></a>`; }).join('')}</div></div></section>`;
  }).join('') + `<section class="room"><div class="wrap"><div class="rooms__total"><span>Materials chosen across all rooms</span><strong>${money(grand)}</strong></div></div></section>`;
})();
