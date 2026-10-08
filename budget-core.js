// Shared by budget.js and summary.js so the budget and the one-pager never disagree.
window.BudgetCore = (function () {
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const money2 = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isPoor = i => !!(i && i.fit && i.fit.level === 'poor');
  const defaultOver = it => it ? Math.round((it.overage ?? 0.15) * 100) : 15;
  const qtyLabel = it => it && it.kind === 'liner' ? 'linear ft' : 'sq ft';

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

  function calc(line, byId) {
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
    if (isPoor(it) || it.hidden) warns.push('Marked a poor fit or hidden on the Materials page');
    return { it, need, units, cost, warns, covered: units * it.sqft_per_unit };
  }

  const unitWord = (it, n) => {
    const u = (it.unit || '').split(/[ (]/)[0] || 'unit';
    if (u === 'sq') return 'sq ft';
    if (u === 'm²' || n === 1) return u;
    return u === 'box' ? 'boxes' : u + 's';
  };

  // Frost and slip, read from the typed specs (see REQUIREMENTS.md)
  function frostSlip(it) {
    const s = it && it.specs; if (!s) return { frost: '—', slip: '—' };
    if (it.kind === 'wallcovering') return { frost: 'Indoor', slip: '—' };
    const ft = (s.freeze_thaw || {}).status || 'unknown';
    const frost = (s.check_uses || []).includes('deck')
      ? { pass: 'Frost-rated', fail: 'Not frost-rated', conflict: 'Frost: confirm', unknown: 'Frost: confirm' }[ft]
      : 'Indoor only';
    const sl = s.slip; let slip;
    if (!(s.check_uses || []).some(u => u === 'deck' || u === 'floor')) slip = 'Walls only';
    else if (!sl) slip = 'Slip: confirm';
    else if ('dcof' in sl) slip = `DCOF ${sl.dcof}`;
    else if ('dcof_lt' in sl) slip = `DCOF under ${sl.dcof_lt}`;
    else if ('dcof_pass' in sl) slip = 'Passes DCOF';
    else slip = sl.r;
    return { frost, slip };
  }

  const ORDERERS = ['TBD', 'Me', 'GC', 'Designer'];
  return { money, money2, esc, isPoor, defaultOver, qtyLabel, parseArea, calc, unitWord, frostSlip, ORDERERS };
})();
