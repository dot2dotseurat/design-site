// Checks of one board item against one use, from its typed `specs` (see REQUIREMENTS.md).
//   FitChecks.checksFor(item, use, rules) -> [[level, text], ...]   level is 'good' | 'caution' | 'poor'
//   use: 'shower' | 'wall' | 'floor' | 'deck' | 'wallpaper'
window.FitChecks = (function () {
  function checksFor(it, use, rules) {
    const s = it.specs || {}, out = [];
    const ok = t => out.push(['good', t]), care = t => out.push(['caution', t]), bad = t => out.push(['poor', t]);
    const rated = s.rated_for || [];
    const slip = () => {
      const sl = s.slip;
      if (!sl) care('No slip rating published');
      else if ('dcof' in sl) (sl.dcof >= rules.dcof_min ? ok : bad)(`DCOF ${sl.dcof} ${sl.dcof >= rules.dcof_min ? 'clears' : 'is under'} ${rules.dcof_min}`);
      else if ('dcof_lt' in sl) bad(`DCOF listed under ${sl.dcof_lt}`);
      else if ('dcof_pass' in sl) ok('Passes the DCOF test (number not published)');
      else (parseInt(sl.r.replace(/\D/g, ''), 10) >= rules.r_min ? ok : care)(`${sl.r} slip rating`);
      if (!rules.slip_safe_finishes.includes(s.finish_class)) care(s.finish_class === 'unknown' ? 'Finish not stated' : `${s.finish_class} finish is slick when wet`);
    };
    if (use === 'wallpaper') {
      const c = s.cleanable || 'unknown';
      if (rules.wallpaper_ok_cleanable.includes(c)) ok(`${c[0].toUpperCase() + c.slice(1)}`); else care(c === 'damp-sponge' ? 'Wipes with a damp sponge only' : 'Cleanability not stated');
    } else if (use === 'shower') {
      rated.includes('shower') ? ok('Listed for shower use') : care('Not listed for shower use: ask the vendor');
    } else if (use === 'wall') {
      rated.includes('wall') ? ok('Listed for walls') : care('Not listed for walls: ask the vendor');
    } else {
      rated.includes('floor') ? ok('Listed for floors') : care('Not listed for floors: ask the vendor');
      slip();
      if (use === 'deck') {
        const ft = s.freeze_thaw || { status: 'unknown' }, src = ft.source ? ` (${ft.source})` : '';
        if (ft.status === 'pass') ok('Passes freeze/thaw' + src);
        else if (ft.status === 'fail') bad('Not freeze/thaw resistant' + src);
        else if (ft.status === 'conflict') care("The vendor's listings disagree on freeze/thaw" + src);
        else care('Freeze/thaw rating not published');
      }
    }
    if (use !== 'wallpaper') {
      if (s.porosity === 'seal-regular') care('Porous: seal before and after grouting, and reseal regularly');
      if (s.porosity === 'etches' && (use === 'floor' || use === 'deck')) care('Etches from soap and cleaners');
    }
    if (it.small_batch_fee) care(`$${it.small_batch_fee.fee} small-batch fee under ${it.small_batch_fee.below_sqft} sq ft`);
    if (it.min_order_sqft) care(`${it.min_order_sqft} sq ft minimum order`);
    if (it.lead_wk == null) care('Ship time not published'); else if (it.lead_wk >= rules.lead_good_below_wk) care(`About ${it.lead_wk} weeks to ship`);
    (s.care_flags || []).forEach(f => care(f));
    const seen = new Set();
    return out.filter(([, t]) => !seen.has(t) && seen.add(t));
  }
  return { checksFor };
})();
