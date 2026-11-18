(function () {
  'use strict';
  const G = window.GachaCore, I18N = window.GachaI18n, LINKS = window.GachaLinks || {};
  let S = G.defaults();
  let info = { path: '', writable: true, server: false };
  let undoFn = null, chartStore = null, addMenu = false, modal = null, lastMin = 0;
  const main = document.getElementById('main');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- язык и числа ---------- */
  const lang = () => (S.lang === 'en' ? 'en' : 'ru');
  function t(k, v) {
    let s = I18N[lang()][k];
    if (s == null) s = I18N.ru[k];
    if (s == null) return k;
    return v ? s.replace(/\{(\w+)\}/g, (m, n) => (v[n] == null ? m : v[n])) : s;
  }
  function W(n, k) {
    const f = I18N[lang()]['w.' + k] || I18N.ru['w.' + k];
    n = Math.abs(n);
    if (lang() === 'en') return n === 1 ? f[0] : f[1];
    if (n % 1) return f[1];
    const a = n % 100, b = n % 10;
    return (a > 10 && a < 20) ? f[2] : b === 1 ? f[0] : (b >= 2 && b <= 4) ? f[1] : f[2];
  }
  const NF = {};
  function fmtN(n, d) { const k = lang() + d; if (!NF[k]) NF[k] = new Intl.NumberFormat(lang() === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: d }); return NF[k].format(n); }
  const fmt = (n) => fmtN(n, 0), fmt1 = (n) => fmtN(n, 1), fmt2 = (n) => fmtN(n, 2);
  function pct(p) {
    if (p == null || !isFinite(p)) return '–';
    if (p <= 0) return '0%';
    if (p >= 1 - 1e-12) return '100%';
    const v = p * 100, sep = lang() === 'en' ? '.' : ',';
    if (v > 99.99) return '>99' + sep + '99%';
    if (v < 0.001) return '<0' + sep + '001%';
    return v.toFixed(v >= 10 ? 1 : v >= 1 ? 2 : 3).replace('.', sep) + '%';
  }
  const cnt = (n, k) => fmt2(n) + ' ' + W(n, k);
  /* Сервер: Ru – русский язык и рубли, Global – английский язык и евро. */
  const isGlobal = () => lang() === 'en';
  const EURF = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rub = (n) => (isGlobal() ? '€' + EURF.format(Math.round(n * 100) / 100) : fmt(Math.round(n)) + ' ₽');
  const MK = () => (isGlobal() ? 'eur' : 'rubles');           // поле суммы денег в бюджете
  const PK = () => (isGlobal() ? 'priceEu' : 'price');        // поле цены в магазине
  const ES = () => G.forServer(S, isGlobal());                 // экономика с ценами выбранного сервера
  const subPrice = () => (isGlobal() ? S.sub.priceEu : S.sub.price);
  const bdName = (b, i) => b.name || (b.nk ? t(b.nk) : t('eco.bNew', { n: i + 1 }));
  const APP_VERSION = '1.0';
  const UW = { letters: 'letter', coins: 'coin', fragments: 'frag', shards: 'shard', keys: 'key' };
  const uc = (n, pay) => cnt(n, UW[pay.unit] || 'letter');
  const pulls = (n) => fmt(n) + ' ' + W(n, 'pull');
  const dateFmt = (ts) => new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  const nowMin = () => Math.floor(Date.now() / 60000) * 60000;

  /* ---------- утилиты ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), S);
  function set(path, v) { const ks = path.split('.'); let o = S; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
  const ci = G.clampInt, nn = (v) => Math.max(0, G.num(v)), str = (v) => String(v == null ? '' : v);
  const SVG = {
    keys: '<svg class="ic key" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="8" cy="12" r="4"/><path d="M12 12h9M17.5 12v3.4M20.8 12v2.4"/></svg>'
  };
  const IC = (c) => SVG[c] || '<img class="ic" src="img/' + c + '.png" alt="">';
  const INFO = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle class="ring" cx="8" cy="8" r="7"/><circle class="gl" cx="8" cy="4.75" r="1.05"/><rect class="gl" x="7.1" y="6.9" width="1.8" height="4.9" rx=".9"/></svg>';
  const II = '<span class="i">' + INFO + '</span>';
  const BULB = '<svg class="bulb" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/></svg>';
  /* Ссылки в текстах советов записаны как [текст](https://адрес) и открываются в обычном браузере. */
  const linkify = (h) => h.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (m, txt, url) => EXT(url, txt));
  const TIP = (key) => '<span class="i" tabindex="0" role="note" data-tip="' + key + '" aria-label="' + esc(t(key).replace(/<[^>]+>/g, ' ')) + '">' + INFO + '</span>';
  const EXT = (url, text) => (url ? '<a href="' + esc(url) + '" data-ext="1" target="_blank" rel="noopener">' + text + '</a>' : text + ' <span class="dim">(' + t('about.soon') + ')</span>');
  const DOT = (text, key) => '<span class="dot" tabindex="0" data-tip="' + key + '">' + text + '</span>';

  function N(path, o) {
    o = o || {};
    return '<input class="num ' + (o.cls || '') + '" type="number" inputmode="decimal" data-b="' + path + '" value="' + esc(get(path)) + '" min="' + (o.min == null ? 0 : o.min) + '"'
      + (o.max != null ? ' max="' + o.max + '"' : '') + ' step="' + (o.step || 1) + '"' + (o.rr ? ' data-rr="1"' : '') + (o.label ? ' aria-label="' + esc(o.label) + '"' : '') + '>';
  }
  const TXT = (path, label, ph) => '<input class="txt" type="text" data-t="text" data-b="' + path + '" value="' + esc(get(path)) + '" aria-label="' + esc(label || '') + '" placeholder="' + esc(ph || '') + '" spellcheck="false">';
  const SW = (path, label) => '<label class="switch"><input type="checkbox" data-b="' + path + '" data-rr="1"' + (get(path) ? ' checked' : '') + '><span>' + label + '</span></label>';
  function SEG(path, opts) {
    const cur = get(path);
    return '<div class="seg" role="group">' + opts.map((o) => '<button type="button" data-a="set" data-b="' + path + '" data-v="' + o[0] + '" class="' + (cur === o[0] ? 'on' : '') + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>').join('') + '</div>';
  }

  /* ---------- баннеры ---------- */
  const bn = () => S.banners.find((b) => b.id === S.activeBanner) || S.banners[0];
  const fl = () => S.flats.find((b) => b.id === S.activeFlat) || S.flats[0];
  const KIND = {
    box: { arr: () => S.banners, act: 'activeBanner', tpl: G.TEMPLATES, cur: () => bn(), path: 'banners', add: [['blank', 'bn.addBlank'], ['event', 'bn.addEvent'], ['sonata', 'bn.addSonata'], ['copy', 'bn.addCopy']] },
    flat: { arr: () => S.flats, act: 'activeFlat', tpl: G.FLAT_TEMPLATES, cur: () => fl(), path: 'flats', add: [['blank', 'bn.addBlank'], ['stroke', 'bn.addStroke'], ['copy', 'bn.addCopy']] }
  };
  const bnName = (b) => b.name || (b.nk ? t(b.nk) : t('bn.new'));
  const catName = (c, i) => c.name || (c.nk ? t(c.nk) : t('cat.new', { n: i + 1 }));
  const itemName = (c, i, it, j) => it.name || (it.nk ? t(it.nk) : t('it.auto', { cat: catName(c, i), n: j + 1 }));
  const fxName = (it, j) => it.name || (it.nk ? t(it.nk) : t('it.item', { n: j + 1 }));

  /* ---------- сохранение ---------- */
  let saveT = null;
  function setSaveState(ok, text) {
    const el = $('#save-state');
    el.className = 'save-state' + (ok ? '' : ' err');
    el.innerHTML = '<i></i><span>' + esc(text) + '</span>';
  }
  function save() { clearTimeout(saveT); saveT = setTimeout(doSave, 150); }
  async function doSave() {
    const body = JSON.stringify(S);
    if (!info.server) {
      try { localStorage.setItem('gacha-calc', body); setSaveState(true, t('save.browser')); } catch (e) { setSaveState(false, t('save.off')); }
      return;
    }
    try {
      const r = await fetch('api/settings', { method: 'PUT', body });
      if (r.ok) setSaveState(true, t('save.ok'));
      else setSaveState(false, t('save.fail', { e: await r.text() }));
    } catch (e) { setSaveState(false, t('save.off')); }
  }
  function merge(dst, src) {
    if (!src || typeof src !== 'object') return dst;
    for (const k of Object.keys(dst)) {
      if (!(k in src)) continue;
      const d = dst[k], s = src[k];
      if (Array.isArray(d)) { if (Array.isArray(s)) dst[k] = s; }
      else if (d && typeof d === 'object') merge(d, s);
      else if (typeof d === typeof s) dst[k] = s;
    }
    return dst;
  }
  function adopt(obj) {
    const base = G.defaults();
    merge(base, G.migrate(obj, Date.now()));
    S = base;
    sanitize();
  }
  function sanePay(p) {
    const d = G.defPay('letters');
    if (!p || typeof p !== 'object') return d;
    if (!['letters', 'coins', 'fragments', 'shards', 'keys'].includes(p.unit)) p.unit = 'letters';
    if (!p.key || typeof p.key !== 'object') p.key = d.key;
    for (const c of G.CUR) { const k = (p.key[c] && typeof p.key[c] === 'object') ? p.key[c] : d.key[c]; k.on = !!k.on; k.price = nn(k.price); p.key[c] = k; }
    return p;
  }
  function saneBudget(o, goals, defGoal) {
    o.pay = sanePay(o.pay); o.end = nn(o.end);
    if (!['units', 'pulls', 'rubles'].includes(o.budgetMode)) o.budgetMode = 'units';
    o.units = nn(o.units); o.pulls = ci(o.pulls, 0, 1e6); o.rubles = nn(o.rubles); o.eur = nn(o.eur == null ? 10 : o.eur);
    if (!['none', 'now', 'end'].includes(o.stock)) o.stock = 'now';
    if (!goals.includes(o.goal)) o.goal = defGoal;
  }
  function saneBanner(b) {
    b.id = b.id || G.newId(); b.name = str(b.name); b.nk = str(b.nk); b.tpl = str(b.tpl);
    saneBudget(b, ['avg', 'q50', 'q90', 'q100', 'all'], 'q100');
    b.categories = (Array.isArray(b.categories) ? b.categories : []).filter((c) => c && typeof c === 'object');
    let wax = false;
    for (const c of b.categories) {
      c.id = c.id || G.newId(); c.name = str(c.name); c.nk = str(c.nk); c.chance = nn(c.chance); c.open = !!c.open;
      c.color = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#9a9282';
      c.leg = !!c.leg && !wax; if (c.leg) wax = true;
      c.items = (Array.isArray(c.items) ? c.items : []).filter((x) => x && typeof x === 'object');
      for (const it of c.items) {
        it.id = it.id || G.newId(); it.name = str(it.name); it.nk = str(it.nk);
        it.copies = ci(it.copies, 0, 1000); it.got = ci(it.got, 0, it.copies); it.bought = ci(it.bought, 0, it.copies - it.got); it.want = ci(it.want, 0, it.copies - it.got - it.bought);
      }
      c.fillN = ci(c.fillN == null ? 4 : c.fillN, 1, 200); c.fillX = ci(c.fillX == null ? 1 : c.fillX, 1, 1000);
    }
    if (!wax && b.categories.length) b.categories[0].leg = true;   // легендарной считается первая категория, если отметки нет
    for (const c of b.categories) c.wax = !!c.wax && c.leg;
    b.costs = (Array.isArray(b.costs) ? b.costs : []).filter((x) => x && typeof x === 'object');
    if (!b.costs.length) b.costs = [{ count: 1, cost: 1 }];
    for (const r of b.costs) { r.count = ci(r.count, 0, 100000); r.cost = nn(r.cost); }
  }
  function saneFlat(f) {
    const d = G.flatBase({});
    f.id = f.id || G.newId(); f.name = str(f.name); f.nk = str(f.nk); f.tpl = str(f.tpl);
    saneBudget(f, ['avg', 'q50', 'q75', 'q90', 'q95', 'q99', 'q100'], 'q90');
    f.items = (Array.isArray(f.items) ? f.items : []).filter((x) => x && typeof x === 'object');
    for (const it of f.items) { it.id = it.id || G.newId(); it.name = str(it.name); it.nk = str(it.nk); it.chance = Math.min(100, nn(it.chance)); it.want = ci(it.want, 0, 50); it.pity = !!it.pity; it.exch = it.exch !== false; }
    f.costPerPull = nn(f.costPerPull);
    const pt = f.pity = Object.assign(d.pity, (f.pity && typeof f.pity === 'object') ? f.pity : {});
    pt.hardOn = !!pt.hardOn; pt.softOn = !!pt.softOn; pt.hardN = ci(pt.hardN, 1, 5000); pt.softStart = ci(pt.softStart, 1, 5000); pt.softInc = Math.min(100, nn(pt.softInc)); pt.count = ci(pt.count, 0, 5000);
    const ex = f.exch = Object.assign(d.exch, (f.exch && typeof f.exch === 'object') ? f.exch : {});
    ex.on = !!ex.on; ex.every = ci(ex.every, 1, 1000000); ex.count = ci(ex.count, 0, 10000000);
  }
  function sanitize() {
    if (!['box', 'flat', 'sandbox', 'eco', 'tech'].includes(S.page)) S.page = 'box';
    if (S.lang !== 'en' && S.lang !== 'ru') S.lang = String(navigator.language || 'ru').toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en';
    S.version = 4;
    S.ui.tipsOpen = !!S.ui.tipsOpen; S.ui.tip = ci(S.ui.tip, 0, TIPS - 1);
    S.banners = (Array.isArray(S.banners) ? S.banners : []).filter((b) => b && typeof b === 'object');
    if (!S.banners.length) S.banners = [G.TEMPLATES.event(), G.TEMPLATES.sonata()];
    S.banners.forEach(saneBanner);
    if (!S.banners.some((b) => b.id === S.activeBanner)) S.activeBanner = S.banners[0].id;
    S.flats = (Array.isArray(S.flats) ? S.flats : []).filter((b) => b && typeof b === 'object');
    if (!S.flats.length) S.flats = [G.FLAT_TEMPLATES.stroke()];
    S.flats.forEach(saneFlat);
    if (!S.flats.some((b) => b.id === S.activeFlat)) S.activeFlat = S.flats[0].id;
    S.packs = (Array.isArray(S.packs) ? S.packs : []).filter((x) => x && typeof x === 'object');
    for (const p of S.packs) { p.id = p.id || G.newId(); p.coins = nn(p.coins); p.bonus = nn(p.bonus); p.firstBonus = nn(p.firstBonus); p.price = nn(p.price); p.priceEu = nn(p.priceEu); p.firstAvail = !!p.firstAvail; }
    S.bundles = (Array.isArray(S.bundles) ? S.bundles : []).filter((x) => x && typeof x === 'object');
    for (const b of S.bundles) { b.id = b.id || G.newId(); b.name = str(b.name); b.nk = str(b.nk); b.on = !!b.on; b.price = nn(b.price); b.priceEu = nn(b.priceEu); b.limit = ci(b.limit, 0, 99); for (const c of ['letters', 'coins', 'fragments', 'shards', 'wax']) b[c] = nn(b[c]); }
    for (const k of ['coins', 'fragments', 'shards']) S.rates[k] = Math.max(1, nn(S.rates[k]));
    for (const k of ['letters', 'coins', 'fragments', 'shards']) S.wallet[k] = nn(S.wallet[k]);
    S.wallet.wax = ci(S.wallet.wax, 0, 9999);
    const inc = S.income;
    inc.dailiesOn = !!inc.dailiesOn; inc.subOn = !!inc.subOn; inc.dailyFragments = nn(inc.dailyFragments); inc.subDaysLeft = ci(inc.subDaysLeft, 0, 3650); inc.lastSync = nn(inc.lastSync);
    for (const k of ['resetTime', 'subResetTime']) if (!/^\d{1,2}:\d{2}$/.test(inc[k])) inc[k] = '';   // пусто = авто по GMT+3
    S.sub.price = nn(S.sub.price); S.sub.priceEu = nn(S.sub.priceEu); S.sub.coins = nn(S.sub.coins); S.sub.fragPerDay = nn(S.sub.fragPerDay); S.sub.days = ci(S.sub.days, 0, 3650); S.sub.max = ci(S.sub.max, 0, 20); S.sub.allow = !!S.sub.allow;
    S.sandbox.letters = nn(S.sandbox.letters); S.sandbox.rubles = nn(S.sandbox.rubles); S.sandbox.eur = nn(S.sandbox.eur == null ? 10 : S.sandbox.eur);
    if (!['none', 'now'].includes(S.sandbox.stock)) S.sandbox.stock = 'now';
  }

  /* ---------- отмена и сообщения ---------- */
  function snap() { const s = JSON.stringify(S); undoFn = () => { S = JSON.parse(s); }; }
  let toastT = null;
  function toast(msg, withUndo) {
    const el = $('#toast');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (withUndo ? '<button class="btn" data-a="undo">' + t('undo') + '</button>' : '');
    el.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { el.hidden = true; }, withUndo ? 9000 : 2500);
  }

  /* ---------- время: начисления за прошедшие дни ---------- */
  function accrue() {
    const now = Date.now(), inc = S.income;
    if (!inc.lastSync || inc.lastSync > now) { inc.lastSync = now; return true; }
    const n1 = G.resetCount(inc.lastSync, now, inc.resetTime, G.DAILY_UTC), n2 = G.resetCount(inc.lastSync, now, inc.subResetTime, G.PASS_UTC);
    if (!n1 && !n2) return false;
    const n = Math.max(n1, n2), m = Math.min(n2, inc.subDaysLeft), prev = { f: S.wallet.fragments, d: inc.subDaysLeft };
    const add = (inc.dailiesOn ? inc.dailyFragments * n1 : 0) + (inc.subOn ? S.sub.fragPerDay * m : 0);
    inc.lastSync = now; inc.subDaysLeft -= m; S.wallet.fragments += add;
    if (add > 0) {
      undoFn = () => { S.wallet.fragments = Math.max(0, S.wallet.fragments - add); S.income.subDaysLeft = prev.d; };
      toast(t('msg.accrued', { d: cnt(n, 'day'), f: cnt(add, 'frag') }), true);
    }
    return true;
  }
  function tick() {
    const changed = accrue(), m = nowMin();
    if (changed) { save(); renderPage(); lastMin = m; return; }
    if (m !== lastMin) { lastMin = m; syncTimers(); update(); }
  }
  function timerParts(end) {
    let mins = end > 0 ? Math.max(0, Math.round((end - Date.now()) / 60000)) : 0;
    const d = Math.floor(mins / 1440); mins -= d * 1440;
    return { d, h: Math.floor(mins / 60), m: mins % 60 };
  }
  function syncTimers() {
    $$('[data-end]', main).forEach((box) => {
      if (box.contains(document.activeElement)) return;
      const p = timerParts(get(box.dataset.end));
      $$('[data-tm]', box).forEach((el) => { el.value = p[el.dataset.tm]; });
    });
  }

  /* ---------- экономика с кэшем ---------- */
  const ecoCache = new Map();
  function ecoFor(pay, o, maxUnits) {
    const mu = Math.ceil(Math.max(1, maxUnits) / 50) * 50;
    const key = JSON.stringify([lang(), pay, o.stock, o.end, o.now, mu, S.rates, S.wallet, S.income, S.sub, S.packs, S.bundles]);
    let e = ecoCache.get(key);
    if (!e) {
      if (ecoCache.size > 12) ecoCache.clear();
      e = G.makeEconomy(ES(), pay, { stock: o.stock, now: o.now, end: o.end, maxUnits: mu });
      ecoCache.set(key, e);
    }
    return e;
  }
  const LET = { unit: 'letters' };

  /* ---------- общие куски ---------- */
  const ICON = {
    box: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    flat: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="17" r="2.6"/></svg>',
    sandbox: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/></svg>',
    eco: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="7" rx="8" ry="3.5"/><path d="M4 7v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V7"/><path d="M4 12v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-5"/></svg>',
    tech: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>'
  };
  const PAGES = ['box', 'flat', 'sandbox', 'eco', 'tech'], TIPS = 9;
  function renderSide() {
    document.documentElement.lang = lang();
    document.title = t('app.title');
    $('#brand').innerHTML = t('app.brand');
    $('#nav').innerHTML = PAGES.map((p) => '<button data-a="nav" data-v="' + p + '" class="' + (S.page === p ? 'on' : '') + '"' + (S.page === p ? ' aria-current="page"' : '') + '>' + ICON[p] + '<span>' + t('nav.' + p) + '</span>' + (p === 'box' || p === 'flat' ? TIP('tip.' + p) : '') + '</button>').join('');
    $('#disc').textContent = t('side.disc');
    $('#about-btn').textContent = t('side.about');
    $('#by').textContent = t('side.by');
    $('#lang').setAttribute('aria-label', t('side.srv'));
    $('#lang').innerHTML = [['ru', 'Ru'], ['en', 'Global']].map((o) => '<button type="button" data-a="lang" data-v="' + o[0] + '" class="' + (lang() === o[0] ? 'on' : '') + '" aria-pressed="' + (lang() === o[0]) + '">' + o[1] + '</button>').join('');
  }

  /* Панель запаса: валюты, срок баннера, прогноз. o: { pay, endPath, wax } */
  function topBar(o) {
    const wf = (c) => { const nm = c === 'wax' ? t('bar.waxName') : t('cur.' + c); return '<label class="wf">' + IC(c) + N('wallet.' + c, { label: nm }) + '<small>' + nm + '</small>' + '<small class="cv' + (c === 'wax' ? ' wx' : '') + '" data-d="' + (c === 'wax' ? 'waxUse' : 'cv.' + c) + '"></small>' + '</label>'; };
    let h = '<section class="stock"><div class="bar-w">' + ['letters', 'coins', 'fragments', 'shards'].concat(o.wax ? ['wax'] : []).map(wf).join('')
      + '<div class="own"><small>' + t('bar.now') + '</small><b data-d="ownNow"></b></div>'
      + (o.endPath ? '<div class="own"><small>' + t('bar.end') + ' ' + TIP('tip.forecast') + '</small><b data-d="ownEnd"></b></div>' : '') + '</div>';
    if (o.endPath) {
      const p = timerParts(get(o.endPath));
      const f = (k) => '<input class="num sm" type="number" min="0" data-tm="' + k + '" value="' + p[k] + '" aria-label="' + t('bar.timer') + ' – ' + t('bar.' + k) + '"><span class="unit">' + t('bar.' + k) + '</span>';
      h += '<div class="bar-t"><span class="lbl">' + t('bar.timer') + ' ' + TIP('tip.timer') + '</span><span class="tm" data-end="' + o.endPath + '">' + f('d') + f('h') + f('m') + '</span>'
        + '<span class="dim" data-d="endAt"></span><span data-d="endClear" data-b="' + o.endPath + '"></span><span class="sp"></span>'
        + SW('income.dailiesOn', t('bar.dailies')) + SW('income.subOn', t('bar.sub')) + N('income.subDaysLeft', { cls: 'sm', label: t('eco.subLeft') }) + '<span class="unit">' + t('bar.subDays') + '</span></div>';
    }
    return h + '</section>';
  }
  function barData(D, pay, end) {
    const now = nowMin(), a = G.stockOf(S, pay, { stock: 'now', now, end }), b = G.stockOf(S, pay, { stock: 'end', now, end });
    D.ownNow = uc(a.units, pay);
    for (const c of G.CUR) D['cv.' + c] = a.parts[c] == null ? '<span class="na">' + t('bar.na') + '</span>' : (c === pay.unit ? '' : '= ' + uc(a.parts[c], pay));
    D.ownEnd = end > now ? uc(b.units, pay) + (b.units > a.units ? ' <span class="dim">+' + fmt(b.units - a.units) + '</span>' : '') : '<span class="dim">' + t('bar.noTimer') + '</span>';
    // крестик для сброса срока виден, только пока таймер идёт
    const ec = $('[data-d="endClear"]', main);
    D.endClear = end > now && ec ? '<button class="x" data-a="clearEnd" data-b="' + ec.dataset.b + '" aria-label="' + t('bar.clear') + '" title="' + t('bar.clear') + '">×</button>' : '';
    D.endAt = end ? (end > now ? t('bar.until', { d: dateFmt(end) }) : '<span class="warn">' + t('bar.ended') + '</span>') : t('bar.noEnd');
  }
  function payBlock(path) {
    const pay = get(path);
    let h = '<div class="row"><span class="lbl">' + t('pay.in') + '</span>' + SEG(path + '.unit', ['letters', 'coins', 'fragments', 'shards', 'keys'].map((c) => [c, IC(c) + t('cur.s.' + c)])) + '</div>';
    if (pay.unit === 'keys') {
      h += '<div class="keys">' + G.CUR.map((c) => '<div class="row">' + SW(path + '.key.' + c + '.on', IC(c) + t('cur.' + c)) + '<span class="sp"></span>' + N(path + '.key.' + c + '.price', { step: 'any', label: t('cur.' + c) }) + '<span class="unit">' + t('pay.perKey') + '</span></div>').join('')
        + '<p class="hint">' + t('pay.keysVia') + '</p></div>';
    }
    return h + '<p class="hint note">' + IC('keys') + '<span>' + t('pay.keysNote') + '</span></p>';
  }
  function budgetCard(path, pay) {
    const o = get(path), m = o.budgetMode;
    const field = m === 'units' ? N(path + '.units', { cls: 'big', step: 'any', label: t('cur.s.' + pay.unit) }) + '<span class="unit">' + IC(pay.unit) + t('cur.s.' + pay.unit) + '</span>'
      : m === 'pulls' ? N(path + '.pulls', { cls: 'big', label: t('bud.pulls') }) + '<span class="unit">' + W(5, 'pull') + '</span>'
        : N(path + '.' + MK(), { cls: 'big', step: 'any', label: t('bud.rub') }) + '<span class="unit">' + t('bud.rubUnit') + '</span>';
    return '<section class="card"><h2>' + t('bud.title') + '</h2>'
      + SEG(path + '.budgetMode', [['units', IC(pay.unit) + t('cur.s.' + pay.unit)], ['pulls', t('bud.pulls')], ['rubles', t('bud.rub')]])
      + '<div class="row" style="margin-top:12px">' + field + '</div>'
      + '<div class="row"><span class="lbl">' + t('bud.stock') + ' ' + TIP('tip.stock') + '</span>' + SEG(path + '.stock', [['none', t('bud.none')], ['now', t('bud.now')], ['end', t('bud.end')]]) + '</div>'
      + '<div class="sum" data-d="budget"></div></section>';
  }
  const amText = (am) => ['letters', 'coins', 'fragments', 'shards', 'wax'].filter((c) => am[c] > 0).map((c) => '<span class="am">' + IC(c) + fmt(am[c]) + '</span>').join(' ');
  function planHtml(c, pay) {
    if (!c) return '<p class="hint">' + t('buy.none') + '</p>';
    if (c.price <= 0 && !c.buys.length && !c.subs) return '<p class="hint">' + t('buy.enough') + '</p>';
    const line = (n, what, price, sub) => '<li><span class="q">' + n + ' ×</span><span class="w">' + what + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="p">' + rub(price * n) + '</span></li>';
    const li = [];
    if (c.subs) li.push(line(c.subs, t('buy.sub'), subPrice(), t('buy.subGives', { coins: amText({ coins: S.sub.coins }), n: amText({ fragments: S.sub.fragPerDay }), d: S.sub.days })));
    for (const b of c.buys) {
      if (b.kind === 'bundle') { const bd = S.bundles[b.idx] || {}; li.push(line(b.count, esc(bdName(bd, b.idx)), b.price, amText(b.am))); }
      else { const p = S.packs[b.idx] || {}; li.push(line(b.count, t('buy.pack', { coins: amText({ coins: p.coins }) }), b.price, t(b.kind === 'first' ? 'buy.first' : 'buy.reg', { total: fmt(b.am.coins), coins: amText({ coins: p.coins }) }))); }
    }
    return '<ul class="plan">' + li.join('') + '</ul><p class="plan-sum"><span>' + t('buy.total') + ' <b>' + rub(c.price) + '</b></span><span class="dim">' + t('buy.after', { u: uc(c.units, pay) }) + (c.gain.wax ? ' · +' + c.gain.wax + ' ' + IC('wax') : '') + '</span></p>'
      + (c.gain.wax ? '<p class="hint">' + t('buy.waxNote') + '</p>' : '');
  }
  const priceCell = (c) => (c ? (c.price > 0 ? rub(c.price) : '<span class="ok">' + t('buy.ok') + '</span>') : '–');
  /* «Что купить»: цели списком, для выбранной – что именно брать в магазине. */
  function buyCard(path, goals, eco, pay, stock, foot) {
    const cur = get(path + '.goal');
    let sel = goals.find((g) => g.id === cur && g.units != null) || goals.slice().reverse().find((g) => g.units != null);
    let h = '<section class="card"><h2>' + t('buy.title') + '<span class="h-note">' + t(stock === 'none' ? 'buy.fromZero' : stock === 'end' ? 'buy.withEnd' : 'buy.withNow') + '</span></h2>'
      + '<table class="goals"><thead><tr><th>' + t('buy.goal') + '</th><th>' + t('bud.pulls') + '</th><th>' + t('cur.s.' + pay.unit) + '</th><th>' + t('buy.price') + '</th></tr></thead><tbody>';
    for (const g of goals) {
      if (g.units == null) { h += '<tr><td><span class="radio off"></span>' + g.label + '</td><td colspan="3" class="dim">' + (g.why || '–') + '</td></tr>'; continue; }
      g.c = eco.cost(g.units);
      h += '<tr class="pick' + (sel === g ? ' sel' : '') + '" data-a="set" data-b="' + path + '.goal" data-v="' + g.id + '" tabindex="0" role="radio" aria-checked="' + (sel === g) + '"><td><span class="radio"></span>' + g.label + (g.tip ? ' ' + TIP(g.tip) : '') + '</td><td>' + g.pulls + '</td><td>' + fmt1(g.units) + '</td><td>' + priceCell(g.c) + '</td></tr>';
    }
    h += '</tbody></table>';
    if (sel) h += '<div class="shop"><p class="shop-h">' + t('buy.for', { goal: sel.label, k: sel.pulls + ' ' + W(sel.pullsN, 'pull'), u: uc(sel.units, pay) }) + '</p>' + planHtml(sel.c, pay) + '</div>';
    return h + (foot ? '<p class="hint" style="margin-top:9px">' + foot + '</p>' : '') + '</section>';
  }

  /* График: xs – подписи по оси X, s1/s2 – ряды вероятностей 0..1 */
  function chart(o) {
    const Wd = 560, H = 236, ml = 40, mr = 12, mt = 10, mb = 26, pw = Wd - ml - mr, ph = H - mt - mb;
    const xmax = Math.max(1, o.xs[o.xs.length - 1]);
    const X = (x) => ml + pw * x / xmax, Y = (p) => mt + ph * (1 - p);
    let g = '';
    for (const p of [0, 0.25, 0.5, 0.75, 1]) g += '<line class="grid" x1="' + ml + '" x2="' + (Wd - mr) + '" y1="' + Y(p) + '" y2="' + Y(p) + '"/><text class="axis" x="' + (ml - 7) + '" y="' + (Y(p) + 3.5) + '" text-anchor="end">' + (p * 100) + '%</text>';
    const raw = xmax / 6, mag = Math.pow(10, Math.floor(Math.log10(raw))), stepX = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw) || 10 * mag);
    for (let x = 0; x <= xmax + 1e-9; x += stepX) g += '<text class="axis" x="' + X(x) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmt(x) + '</text>';
    const path = (ys) => ys.map((y, i) => (i ? 'L' : 'M') + X(o.xs[i]).toFixed(1) + ' ' + Y(y).toFixed(1)).join('');
    let body = '';
    if (o.s2) body += '<path class="l2" d="' + path(o.s2) + '"/>';
    body += '<path class="l1" d="' + path(o.s1) + '"/>';
    if (o.xs.length <= 40) body += o.xs.map((x, i) => '<circle class="d1" r="2.6" cx="' + X(x) + '" cy="' + Y(o.s1[i]) + '"/>').join('');
    if (o.mark != null && o.mark <= xmax) body += '<line class="mark" x1="' + X(o.mark) + '" x2="' + X(o.mark) + '" y1="' + mt + '" y2="' + (mt + ph) + '"/>';
    body += '<line class="guide" id="ch-guide" y1="' + mt + '" y2="' + (mt + ph) + '" x1="-9" x2="-9"/>';
    chartStore = { o, W: Wd, ml, pw, xmax };
    return '<div class="legend"><span><i></i>' + (o.s2 ? t('ch.all') : t('ch.one')) + '</span>' + (o.s2 ? '<span><i class="b"></i>' + t('ch.any') + ' ' + TIP('tip.any') + '</span>' : '') + '<span class="dim hov">' + t('ch.hover') + '</span></div>'
      + '<div class="chart" id="chart"><svg viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="' + t('ch.title') + '">' + g + body + '</svg><div class="tip" id="ch-tip" hidden></div></div>';
  }
  function chartMove(e) {
    const box = $('#chart');
    if (!box || !chartStore) return;
    const svg = $('svg', box), r = svg.getBoundingClientRect(), c = chartStore, sc = r.width / c.W;
    const xv = ((e.clientX - r.left) / sc - c.ml) / c.pw * c.xmax;
    let bi = 0, bd = Infinity;
    c.o.xs.forEach((x, i) => { const d = Math.abs(x - xv); if (d < bd) { bd = d; bi = i; } });
    const gx = c.ml + c.pw * c.o.xs[bi] / c.xmax, gl = $('#ch-guide', box), tip = $('#ch-tip', box);
    gl.setAttribute('x1', gx); gl.setAttribute('x2', gx);
    tip.innerHTML = c.o.tip(bi);
    tip.hidden = false;
    const left = gx * sc, tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(r.width - tw, left > r.width / 2 ? left - tw - 10 : left + 10)) + 'px';
    tip.style.top = '8px';
  }
  function chartLeave() { const tp = $('#ch-tip'); if (tp) tp.hidden = true; const g = $('#ch-guide'); if (g) { g.setAttribute('x1', -9); g.setAttribute('x2', -9); } }
  const chartTip = (head, u, a, b, one) => '<b>' + head + '</b> · ' + u + '<br><span class="g">' + (one ? t('ch.chance') : t('ch.allS')) + ': <b>' + pct(a) + '</b></span>' + (one ? '' : '<br><span class="bl">' + t('ch.any') + ': <b>' + pct(b) + '</b></span>');
  function chanceCard(k, names, pa, pany, dist, approx) {
    const T = names.length, one = T === 1;
    let h = '<section class="card"><h2>' + t('res.chanceFor', { k: pulls(k) }) + '</h2><div class="hero"><span class="cap">'
      + (one ? t('res.one', { name: esc(names[0].name) }) + (names[0].need > 1 ? ' × ' + names[0].need : '') : T === 2 ? t('res.both') : t('res.all', { n: T + ' ' + W(T, 'sel') })) + '</span>'
      + '<span class="big' + (pa <= 0 ? ' zero' : '') + '">' + pct(pa) + '</span>'
      + (one ? '' : '<span class="sub">' + t('res.any') + ' ' + TIP('tip.any') + ': <b>' + pct(pany) + '</b></span>') + '</div>';
    if (!one) {
      h += '<div class="sep"></div><div class="bars">' + names.map((n) => '<div class="bar" style="--c:' + esc(n.color || '#f2c65c') + '"><span class="nm"><i></i>' + esc(n.name) + (n.need > 1 ? ' × ' + n.need : '') + '</span><span class="tr"><span style="width:' + (n.p * 100).toFixed(2) + '%"></span></span><span class="v">' + pct(n.p) + '</span></div>').join('') + '</div>';
      if (T <= 12 && dist) {
        h += '<div class="sep"></div><p class="hint" style="margin-top:8px">' + t('res.howMany') + '</p><div class="bars">';
        for (let j = 0; j <= T; j++) h += '<div class="bar"><span class="nm">' + (j === 0 ? t('res.none') : j === T ? t('res.allN', { n: T }) : t('res.exactly', { n: j })) + '</span><span class="tr"><span style="width:' + (dist[j] * 100).toFixed(2) + '%"></span></span><span class="v">' + pct(dist[j]) + '</span></div>';
        h += '</div>';
      }
    }
    if (approx) h += '<p class="warn" style="margin-top:10px">' + t('res.approx') + '</p>';
    return h + '</section>';
  }
  const emptyCard = (key) => '<section class="card"><h2>' + t('res.chance') + '</h2><p class="empty">' + t(key) + '</p></section>';

  /* ---------- страница: бокс-гача ---------- */
  /* Вкладки баннеров и карточка с именем – общие для Box-гачи и Flat-rate гачи. */
  function tabsHtml(kind) {
    const K = KIND[kind], cur = K.cur();
    return '<div class="bn-tabs">' + K.arr().map((x) => '<button class="bn' + (x === cur ? ' on' : '') + '" data-a="bn" data-k="' + kind + '" data-v="' + esc(x.id) + '"' + (x === cur ? ' aria-current="true"' : '') + '>' + esc(bnName(x)) + '</button>').join('')
      + '<span class="menu-wrap"><button class="bn add" data-a="addMenu" data-k="' + kind + '" aria-expanded="' + (addMenu === kind) + '">' + t('bn.add') + '</button>'
      + (addMenu === kind ? '<div class="menu">' + K.add.map((o) => '<button data-a="newBanner" data-k="' + kind + '" data-v="' + o[0] + '">' + t(o[1]) + '</button>').join('') + '</div>' : '') + '</span></div>';
  }
  function nameCard(kind, P, b) {
    return '<section class="card"><h2>' + t('bn.card') + '</h2>' + TXT(P + '.name', t('bn.name'), bnName(Object.assign({}, b, { name: '' })))
      + '<div class="row" style="margin-top:9px"><button class="btn" data-a="newBanner" data-k="' + kind + '" data-v="copy">' + t('bn.dup') + '</button>' + (KIND[kind].tpl[b.tpl] ? '<button class="btn" data-a="resetTpl" data-k="' + kind + '">' + t('bn.reset') + '</button>' : '')
      + (KIND[kind].arr().length > 1 ? '<button class="btn danger" data-a="delBanner" data-k="' + kind + '">' + t('bn.del') + '</button>' : '') + '</div><p class="hint" style="margin-top:9px">' + t('bn.hint') + '</p></section>';
  }
  function pageBox() {
    const b = bn(), bi = S.banners.indexOf(b), P = 'banners.' + bi;
    const tabs = tabsHtml('box');
    let tips = '';
    if (S.ui.tipsOpen) {
      let dots = '';
      for (let i = 0; i < TIPS; i++) dots += '<button class="tdot' + (i === S.ui.tip ? ' on' : '') + '" data-a="tipGo" data-v="' + i + '" aria-label="' + t('tips.go', { n: i + 1 }) + '"' + (i === S.ui.tip ? ' aria-current="true"' : '') + '></button>';
      tips = '<section class="card tips"><div class="tips-h">' + BULB + '<b>' + t('tips.n', { a: S.ui.tip + 1, b: TIPS }) + '</b><span class="tdots">' + dots + '</span><span class="sp"></span>'
        + '<button class="x" data-a="tip" data-v="-1" aria-label="' + t('tips.prev') + '">‹</button><button class="x" data-a="tip" data-v="1" aria-label="' + t('tips.next') + '">›</button><button class="x" data-a="tips" aria-label="' + t('tips.hide') + '">×</button></div>'
        + '<p>' + linkify(t('tips.' + (S.ui.tip + 1), { boosty: EXT(LINKS.boosty, t('tips.boosty')) })) + '</p></section>';
    }
    const cats = b.categories.map((c, i) => {
      const p = P + '.categories.' + i;
      let body = '';
      if (c.open) {
        const anyMulti = c.items.some((it) => it.copies > 1);
        body = '<div class="cat-body' + (anyMulti ? ' multi' : '') + '"><div class="items-head"><span></span><span>' + t('it.col') + '</span><span>' + DOT(t('it.total'), 'tip.total') + '</span><span>' + DOT(t('it.got'), 'tip.got') + '</span>' + (anyMulti ? '<span>' + DOT(t('it.need'), 'tip.need') + '</span>' : '') + '<span></span></div>'
          + c.items.map((it, j) => {
            const ip = p + '.items.' + j, rem = it.copies - it.got - it.bought, multi = it.copies > 1, st = it.bought ? 2 : it.got ? 1 : 0;
            return '<div class="item' + (it.want > 0 ? ' is-want' : '') + (rem <= 0 ? ' is-got' : '') + '">'
              + '<button class="star' + (it.want > 0 ? ' on' : '') + '" data-a="want" data-c="' + i + '" data-i="' + j + '"' + (rem <= 0 ? ' disabled' : '') + ' aria-pressed="' + (it.want > 0) + '" aria-label="★">★</button>'
              + TXT(ip + '.name', t('it.name'), itemName(c, i, it, j))
              + N(ip + '.copies', { rr: 1, max: 1000, label: t('it.total') })
              + (multi ? N(ip + '.got', { rr: 1, max: it.copies, label: t('it.got') }) : '<button class="chk st' + st + '" data-a="cyc" data-c="' + i + '" data-i="' + j + '">' + t(['st.none', 'st.got', 'st.bought'][st]) + '</button>')
              + (anyMulti ? (multi ? N(ip + '.want', { rr: 1, max: rem, label: t('it.need') }) : '<span></span>') : '')
              + '<button class="x" data-a="delItem" data-c="' + i + '" data-i="' + j + '" aria-label="' + t('it.del') + '">×</button></div>';
          }).join('')
          + '<div class="cat-tools"><button class="btn" data-a="addItem" data-c="' + i + '">' + t('it.add') + '</button>'
          + '<button class="btn ghost" data-a="selAll" data-c="' + i + '" data-v="1">' + t('it.selAll') + '</button><button class="btn ghost" data-a="selAll" data-c="' + i + '" data-v="0">' + t('it.selNone') + '</button>'
          + '<span class="sp"></span><button class="btn ghost danger" data-a="delCat" data-c="' + i + '">' + t('cat.del') + '</button></div>'
          + '<div class="cat-tools plain"><span class="hint">' + t('fill.label') + '</span>' + N(p + '.fillN', { min: 1 }) + '<span class="hint">' + t('fill.kinds') + '</span>' + N(p + '.fillX', { min: 1 }) + '<span class="hint">' + t('fill.pcs') + '</span>'
          + '<button class="btn" data-a="fill" data-c="' + i + '">' + t('fill.btn') + '</button></div></div>';
      }
      return '<div class="cat" style="--c:' + esc(c.color) + '"><div class="cat-head">'
        + '<button class="chev" data-a="toggleCat" data-c="' + i + '" aria-expanded="' + !!c.open + '">' + (c.open ? '▼' : '▶') + '</button>'
        + '<input type="color" data-t="text" data-rr="1" data-b="' + p + '.color" value="' + esc(c.color) + '" aria-label="color">'
        + TXT(p + '.name', t('cat.name'), catName(c, i)) + '<span class="lbl">' + t('cat.chance') + '</span>' + N(p + '.chance', { step: 'any', max: 100 }) + '<span class="unit">%</span>'
        + (c.leg ? '<button class="waxb' + (c.wax ? ' on' : '') + '" data-a="waxCat" data-c="' + i + '" aria-pressed="' + !!c.wax + '">' + IC('wax') + t('cat.wax') + '</button>' + TIP('tip.wax') : '')
        + '<span class="cat-sum" data-d="cat' + i + '"></span></div>' + body + '</div>';
    }).join('');
    const last = b.costs.length - 1;
    const left = tabs
      + '<div class="page-head"><h1>' + t('box.h1') + '</h1><p>' + t('box.desc') + '</p>'
      + '<div class="links"><button class="link" data-a="where">' + II + t('box.where') + '</button><button class="link' + (S.ui.tipsOpen ? ' on' : '') + '" data-a="tips" aria-expanded="' + S.ui.tipsOpen + '">' + BULB + t('box.tips') + '</button></div></div>'
      + tips
      + nameCard('box', P, b)
      + '<section class="card"><h2>' + t('box.comp') + '<span class="h-note" data-d="chanceSum"></span></h2>' + cats
      + '<div class="row" style="margin-top:10px"><button class="btn" data-a="addCat">' + t('cat.add') + '</button></div></section>'
      + '<section class="card costs"><h2>' + t('cost.title') + '<span class="h-note" data-d="costSum"></span></h2>' + payBlock(P + '.pay') + '<div class="sep"></div><div style="margin-top:10px">'
      + b.costs.map((r, i) => '<div class="row cost-row">' + (i < last ? N(P + '.costs.' + i + '.count', { rr: 1, label: t('bud.pulls') }) + '<span class="lbl">' + W(r.count, 'pull') + ' ' + t('cost.by') + '</span>' : '<span class="lbl rest" data-d="costLast"></span><span class="lbl">' + t('cost.by') + '</span>')
        + N(P + '.costs.' + i + '.cost', { step: 'any', label: t('tb.price') }) + '<span class="cu">' + IC(b.pay.unit) + ',</span><span class="hint grow" data-d="costRange' + i + '"></span>'
        + (b.costs.length > 1 ? '<button class="x" data-a="delCost" data-i="' + i + '" aria-label="' + t('cost.del') + '">×</button>' : '') + '</div>').join('')
      + '</div><div class="row" style="margin-top:8px"><button class="btn" data-a="addCost">' + t('cost.add') + '</button><span class="hint grow">' + t('cost.hint') + '</span></div></section>';
    return topBar({ pay: b.pay, endPath: P + '.end', wax: true })
      + '<div class="cols"><div class="col">' + left + '</div><div class="col col-r">' + budgetCard(P, b.pay) + '<div data-d="results" style="display:contents"></div></div></div>';
  }

  function updateBox() {
    const b = bn(), bi = S.banners.indexOf(b), P = 'banners.' + bi, pay = b.pay, D = {};
    barData(D, pay, b.end);
    let R;
    try { R = G.bannerCalc(b, { wax: S.wallet.wax }); } catch (e) { D.results = '<section class="card"><p class="err">' + t('err.tooMany') + '</p></section>'; return D; }
    const total = R.costCum[R.K], now = nowMin();
    if (R.waxOn) D.waxUse = !R.waxNeed ? '<span class="wb idle">' + t('wax.none') + '</span>' : S.wallet.wax >= R.waxNeed ? '<span class="wb">' + t('wax.use', { n: R.waxUsed, m: S.wallet.wax - R.waxUsed }) + '</span>' : '<span class="wb short">' + t('wax.short', { n: R.waxNeed, m: R.waxNeed - S.wallet.wax }) + '</span>';
    const stock = (b.stock === 'end' && !(b.end > now)) ? 'now' : b.stock;
    const o = { stock, now, end: b.end };
    const money = b[MK()];
    const bound = b.budgetMode === 'rubles' ? Math.max(total, G.ecoBound(ES(), pay, o, money)) : total;
    const eco = ecoFor(pay, o, bound + 1), own = eco.own.units;
    let units, k, buy = null;
    if (b.budgetMode === 'pulls') { k = ci(b.pulls, 0, R.K); units = R.costCum[k]; }
    else {
      if (b.budgetMode === 'rubles') { buy = eco.maxFor(money); units = buy ? buy.units : own; }
      else units = b.units + own;
      k = G.attemptsForSpins(R.costCum, units);
    }
    const spent = R.costCum[k], left = units - spent;

    // подписи в форме
    let sumCh = 0;
    b.categories.forEach((c, i) => {
      sumCh += c.chance;
      let tot = 0, want = 0;
      for (const it of c.items) { tot += it.copies; if (it.want > 0) want++; }
      const rem = R.sizes[i], nowP = R.nextChance[i] * 100;
      let s = t('cat.left', { a: rem, b: tot });
      if (rem === 0 && tot > 0) s += ' · ' + t('cat.gone');
      else if (rem > 0 && Math.abs(nowP - c.chance) > 1e-6) s += ' · ' + t('cat.nowChance', { p: fmt2(nowP) });
      if (want) s += ' · ' + t('cat.sel', { n: want });
      D['cat' + i] = s;
    });
    D.chanceSum = Math.abs(sumCh - 100) > 1e-6 ? '<span class="warn">' + t('box.sumFix', { p: fmt2(sumCh) }) + '</span>' : t('box.sum100');
    const costs = G.normCosts(b.costs), last = costs.length - 1;
    let from = 1, full = 0;
    for (let i = 1; i <= R.total; i++) full += G.attemptCost(costs, i);
    costs.forEach((r, i) => {
      const c = i < last ? r.count : Math.max(0, R.total - from + 1), to = Math.min(R.total, from + c - 1);
      if (i === last) D.costLast = t('cost.rest', { n: pulls(c) });
      D['costRange' + i] = (c > 0 && from <= R.total) ? (to === from ? t('cost.range1', { a: from }) : t('cost.range', { a: from, b: to })) : '<span class="warn">' + t('cost.unused') + '</span>';
      from += c;
    });
    D.costSum = t('cost.head', { n: pulls(R.total), m: fmt(R.total) + ' ' + W(R.total, 'item'), sum: uc(full, pay) });

    // что считаем
    let bs;
    if (R.K === 0) bs = t('bud.empty');
    else {
      const tail = t('bud.enough', { k: pulls(k), K: R.K, s: uc(spent, pay), left: left > 1e-9 ? t('bud.left', { n: fmt2(left) }) : '' });
      if (b.budgetMode === 'pulls') bs = t('bud.pullsOf', { k: pulls(k), K: R.K, u: uc(spent, pay) });
      else if (b.budgetMode === 'rubles') bs = buy ? t('bud.forRub', { r: rub(money), u: uc(units, pay), own: own ? t('bud.withOwn') : '' }) + tail : t('bud.tooBig');
      else bs = (own ? t('bud.plus', { a: fmt2(b.units), b: fmt2(own), c: uc(units, pay) }) : '') + tail;
      if (R.done > 0) bs += ' <span class="dim">' + t('bud.done', { n: pulls(R.done) }) + '</span>';
      if (k < R.K) bs += ' <span class="dim">' + t('bud.next', { c: uc(R.costEach[k + 1], pay) }) + '</span>';
    }
    if (b.stock === 'end' && stock !== 'end') bs += '<p class="warn" style="margin-top:6px">' + t('bud.noTimer') + '</p>';
    if (b.budgetMode === 'rubles' && buy) bs += buy.price > 0 || buy.buys.length ? '<p class="shop-h" style="margin-top:10px">' + t('bud.best') + '</p>' + planHtml(buy, pay) : '<p class="hint" style="margin-top:8px">' + t('bud.nothing') + '</p>';
    else if (b.budgetMode !== 'rubles' && spent > own + 1e-9) bs += '<p class="shop-h" style="margin-top:10px">' + t('bud.short') + '</p>' + planHtml(eco.cost(spent), pay);
    D.budget = bs;

    // результаты
    let h = '';
    const names = R.itemP.map((x) => ({ name: itemName(b.categories[x.ci], x.ci, b.categories[x.ci].items[x.ii], x.ii), color: b.categories[x.ci].color, need: x.need, p: x.p[k], arr: x.p }));
    const one = R.T === 1;
    if (R.T === 0) h += emptyCard('res.empty');
    else h += chanceCard(k, names, R.pAll[k], R.pAny[k], R.dist[k], R.approx);
    if (R.K > 0) {
      const goal = (id, label, kk, u, pl) => ({ id, label, units: kk == null ? null : (u == null ? R.costCum[kk] : u), pulls: pl || (kk == null ? '' : fmt(kk)), pullsN: kk || 0 });
      const goals = [];
      if (R.T > 0) {
        goals.push(Object.assign(goal('avg', t('buy.avg'), Math.round(R.expAttempts), Math.ceil(R.expSpins - 1e-9), fmt1(R.expAttempts)), { tip: 'tip.avg' }));
        if (R.q50 != null) goals.push(goal('q50', t('buy.q', { p: 50 }), R.q50));
        if (R.q90 != null) goals.push(goal('q90', t('buy.q', { p: 90 }), R.q90));
        if (R.q100 != null) goals.push(goal('q100', t('buy.guar'), R.q100));
      }
      goals.push(goal('all', t('buy.all'), R.K));
      h += buyCard(P, goals, eco, pay, stock, '');
    }
    if (R.T > 0) {
      const xs = []; for (let i = 0; i <= R.K; i++) xs.push(i);
      h += '<section class="card"><h2>' + t('ch.title') + '</h2>' + chart({
        xs, s1: Array.from(R.pAll), s2: one ? null : Array.from(R.pAny), mark: k,
        tip: (i) => chartTip(t('ch.pull', { n: i }), uc(R.costCum[i], pay), R.pAll[i], R.pAny[i], one)
      }) + '</section>';
    }
    if (R.K > 0) {
      let rows = '';
      for (let i = 1; i <= R.K; i++) {
        rows += '<tr class="' + (i === k ? 'cur' : '') + '"><td>' + (R.done + i) + '</td><td>' + fmt2(R.costEach[i]) + '</td><td>' + fmt2(R.costCum[i]) + '</td><td>' + priceCell(eco.cost(R.costCum[i])) + '</td>'
          + (R.T ? '<td class="p">' + pct(R.pAll[i]) + '</td>' + (R.T > 1 ? '<td>' + pct(R.pAny[i]) + '</td>' : '') : '') + '</tr>';
      }
      h += '<section class="card"><h2>' + t('tb.title') + '</h2><div class="tscroll"><table><thead><tr><th>' + t('tb.pull') + '</th><th>' + t('tb.price') + '</th><th>' + t('tb.total') + ' ' + IC(pay.unit) + '</th><th>' + t('buy.price') + '</th>'
        + (R.T ? '<th>' + (R.T > 1 ? t('tb.all') : t('tb.chance')) + '</th>' + (R.T > 1 ? '<th>' + t('tb.any') + ' ' + TIP('tip.any') + '</th>' : '') : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
    }
    D.results = h;
    return D;
  }

  /* ---------- страница: Flat-rate гача ---------- */
  function pageFlat() {
    const f = fl(), fi = S.flats.indexOf(f), P = 'flats.' + fi, pt = f.pity, ex = f.exch, pool = pt.hardOn || pt.softOn;
    const cols = '30px minmax(120px, 1fr) 68px 54px' + (pool ? ' 54px' : '') + (ex.on ? ' 54px' : '') + ' 26px';
    const tog = (i, key, on) => '<button class="chk' + (on ? ' st1' : '') + '" data-a="ftog" data-i="' + i + '" data-v="' + key + '" aria-pressed="' + on + '">' + (on ? '✓' : '–') + '</button>';
    const left = tabsHtml('flat')
      + '<div class="page-head"><h1>' + t('fx.h1') + '</h1><p>' + t('fx.desc') + '</p>'
      + '<div class="links"><button class="link" data-a="where">' + II + t('box.where') + '</button></div></div>'
      + nameCard('flat', P, f)
      + '<section class="card fx"><h2>' + t('fx.items') + '<span class="h-note" data-d="fxSum"></span></h2>'
      + '<div class="fx-head" style="grid-template-columns:' + cols + '"><span></span><span>' + t('it.col') + '</span><span>' + t('fx.chance') + '</span><span>' + t('fx.need') + '</span>'
      + (pool ? '<span>' + DOT(t('fx.pool'), 'tip.poolCol') + '</span>' : '') + (ex.on ? '<span>' + DOT(t('fx.exch'), 'tip.exchCol') + '</span>' : '') + '<span></span></div>'
      + f.items.map((it, i) => '<div class="list-row item' + (it.want > 0 ? ' is-want' : '') + '" style="grid-template-columns:' + cols + '"><button class="star' + (it.want > 0 ? ' on' : '') + '" data-a="fwant" data-i="' + i + '" aria-pressed="' + (it.want > 0) + '" aria-label="★">★</button>'
        + TXT(P + '.items.' + i + '.name', t('it.name'), fxName(Object.assign({}, it, { name: '' }), i)) + N(P + '.items.' + i + '.chance', { step: 'any', max: 100, label: t('fx.chance') }) + N(P + '.items.' + i + '.want', { rr: 1, max: 50, label: t('fx.need') })
        + (pool ? tog(i, 'pity', it.pity) : '') + (ex.on ? tog(i, 'exch', it.exch) : '')
        + '<button class="x" data-a="delFlat" data-i="' + i + '" aria-label="' + t('it.del') + '">×</button></div>').join('')
      + '<div class="row" style="margin-top:8px"><button class="btn" data-a="addFlat">' + t('it.add') + '</button></div></section>'
      + '<section class="card pity"><h2>' + t('pt.title') + '</h2>'
      + '<div class="row">' + SW(P + '.pity.hardOn', t('pt.hard')) + TIP('tip.hard') + '<span class="sp"></span><span class="lbl">' + t('pt.hardAt') + '</span>' + N(P + '.pity.hardN', { min: 1, label: t('pt.hard') }) + '</div>'
      + '<div class="row">' + SW(P + '.pity.softOn', t('pt.soft')) + TIP('tip.soft') + '</div>'
      + (pt.softOn ? '<div class="row sub"><span class="lbl">' + t('pt.softFrom') + '</span>' + N(P + '.pity.softStart', { min: 1, label: t('pt.softFrom') }) + '<span class="lbl">+</span>' + N(P + '.pity.softInc', { step: 'any', max: 100, label: t('pt.softInc') }) + '<span class="lbl">' + t('pt.softInc') + '</span></div>' : '')
      + (pool ? '<div class="row sub"><span class="lbl grow">' + t('pt.count') + '</span>' + N(P + '.pity.count', { label: t('pt.count') }) + '</div><p class="hint" style="margin-top:6px" data-d="ptNote"></p>' : '')
      + '<div class="sep"></div><div class="row" style="margin-top:12px">' + SW(P + '.exch.on', t('pt.exch')) + TIP('tip.exchange') + '<span class="sp"></span><span class="lbl">' + t('pt.exchEvery') + '</span>' + N(P + '.exch.every', { min: 1, label: t('pt.exchEvery') }) + '<span class="lbl">' + W(5, 'pull') + '</span></div>'
      + (ex.on ? '<div class="row sub"><span class="lbl grow">' + t('pt.exchCount') + '</span>' + N(P + '.exch.count', { label: t('pt.exchCount') }) + '</div>' : '')
      + (!pool && !ex.on ? '<p class="hint" style="margin-top:9px">' + t('pt.off') + '</p>' : '') + '</section>'
      + '<section class="card"><h2>' + t('fx.costTitle') + '</h2>' + payBlock(P + '.pay')
      + '<div class="sep"></div><div class="row" style="margin-top:12px">' + N(P + '.costPerPull', { step: 'any', label: t('fx.costTitle') }) + IC(f.pay.unit) + '<span class="lbl">' + t('fx.costPer') + '</span></div></section>';
    return topBar({ pay: f.pay, endPath: P + '.end', wax: false })
      + '<div class="cols"><div class="col">' + left + '</div><div class="col col-r">' + budgetCard(P, f.pay) + '<div data-d="results" style="display:contents"></div></div></div>';
  }

  function updateFlat() {
    const f = fl(), P = 'flats.' + S.flats.indexOf(f), pay = f.pay, D = {}, cpa = f.costPerPull, now = nowMin();
    barData(D, pay, f.end);
    const stock = (f.stock === 'end' && !(f.end > now)) ? 'now' : f.stock;
    const o = { stock, now, end: f.end };
    let sum = 0;
    for (const it of f.items) sum += it.chance;
    D.fxSum = sum > 100 + 1e-9 ? '<span class="warn">' + t('box.sumFix', { p: fmt2(sum) }) + '</span>' : t('fx.sum', { p: fmt2(sum) }) + (sum < 100 - 1e-9 ? t('fx.rest', { p: fmt2(100 - sum) }) : '');
    const own = G.stockOf(S, pay, o).units, money = f[MK()];
    let n, units = null, buy = null, eco = null;
    if (f.budgetMode === 'pulls') n = ci(f.pulls, 0, 1e6);
    else {
      if (f.budgetMode === 'rubles') { eco = ecoFor(pay, o, G.ecoBound(ES(), pay, o, money)); buy = eco.maxFor(money); units = buy ? buy.units : own; }
      else units = f.units + own;
      n = cpa > 0 ? Math.min(1e6, Math.floor(units / cpa + 1e-9)) : 0;
    }
    let R;
    try { R = G.flatCalc(f, n); } catch (e) { D.budget = ''; D.results = '<section class="card"><p class="err">' + t('err.tooMany') + '</p></section>'; return D; }
    if (f.pity.hardOn || f.pity.softOn) D.ptNote = R.pool ? t('pt.pool', { n: fmt(R.pool) + ' ' + W(R.pool, 'item'), p: fmt2(R.Q * 100) }) : '<span class="warn">' + t('pt.noPool') + '</span>';
    const thr = [50, 75, 90, 95, 99], marks = thr.map((p) => R['q' + p]);
    const far = Math.max(n, marks[4] || 0, R.q100 || 0, R.exp ? Math.ceil(R.exp) : 0);
    const ecoG = ecoFor(pay, o, Math.max(far * cpa, eco ? G.ecoBound(ES(), pay, o, money) : 0) + 1);

    let bs;
    if (f.budgetMode === 'pulls') bs = t('bud.fxPulls', { k: pulls(n), u: uc(n * cpa, pay) });
    else {
      bs = f.budgetMode === 'rubles' ? (buy ? t('bud.forRub', { r: rub(money), u: uc(units, pay), own: own ? t('bud.withOwn') : '' }) : t('bud.tooBig')) : (own ? t('bud.plus', { a: fmt2(f.units), b: fmt2(own), c: uc(units, pay) }) : '');
      bs += cpa > 0 ? t('bud.fxEnough', { k: pulls(n) }) : t('bud.noCost');
    }
    if (f.stock === 'end' && stock !== 'end') bs += '<p class="warn" style="margin-top:6px">' + t('bud.noTimer') + '</p>';
    if (f.budgetMode === 'rubles' && buy) bs += buy.price > 0 || buy.buys.length ? '<p class="shop-h" style="margin-top:10px">' + t('bud.best') + '</p>' + planHtml(buy, pay) : '<p class="hint" style="margin-top:8px">' + t('bud.nothing') + '</p>';
    else if (f.budgetMode !== 'rubles' && n * cpa > own + 1e-9) bs += '<p class="shop-h" style="margin-top:10px">' + t('bud.short') + '</p>' + planHtml(ecoG.cost(n * cpa), pay);
    D.budget = bs;

    let h = '';
    if (!R.T) h = emptyCard('res.empty');
    else if (R.impossible) h = emptyCard('res.zero');
    else {
      const one = R.T === 1;
      const names = R.itemSel.map((x) => ({ name: fxName(f.items[x.i], x.i), need: x.need, p: x.p }));
      h += chanceCard(n, names, R.pAll[n], R.pAny[n], R.distSel, false);
      const goals = [{ id: 'avg', label: t('buy.avg'), tip: 'tip.avg', units: R.exp != null ? Math.ceil(R.exp) * cpa : null, pulls: R.exp != null ? fmt1(R.exp) : '', pullsN: Math.round(R.exp || 0), why: t('buy.tooLong') }]
        .concat(thr.map((p, i) => ({ id: 'q' + p, label: t('buy.q', { p }), units: marks[i] != null ? marks[i] * cpa : null, pulls: marks[i] != null ? fmt(marks[i]) : '', pullsN: marks[i] || 0, why: t('buy.more', { n: pulls(R.nMax) }) })));
      if (R.q100 != null) goals.push({ id: 'q100', label: t('buy.guar'), units: R.q100 * cpa, pulls: fmt(R.q100), pullsN: R.q100 });
      h += buyCard(P, goals, ecoG, pay, stock, R.q100 == null ? t('buy.noGuar') : '');
      const xmax = Math.max(10, n, Math.min(R.nMax, R.q100 != null ? R.q100 : (marks[4] != null ? Math.ceil(marks[4] * 1.08) : R.nMax)));
      const lim = Math.min(xmax, R.nMax), step = Math.max(1, Math.ceil(lim / 280));
      const xs = [], s1 = [], s2 = [];
      for (let i = 0; i <= lim; i += step) { xs.push(i); s1.push(R.pAll[i]); s2.push(R.pAny[i]); }
      if (xs[xs.length - 1] !== lim) { xs.push(lim); s1.push(R.pAll[lim]); s2.push(R.pAny[lim]); }
      h += '<section class="card"><h2>' + t('ch.title') + '</h2>' + chart({ xs, s1, s2: one ? null : s2, mark: n, tip: (i) => chartTip(pulls(xs[i]), uc(xs[i] * cpa, pay), s1[i], s2[i], one) }) + '</section>';
    }
    D.results = h;
    return D;
  }

  /* ---------- страница: песочница ---------- */
  function pageSandbox() {
    return topBar({ pay: LET, endPath: null, wax: false })
      + '<div class="cols one"><div class="col"><div class="wrap"><div class="page-head"><h1>' + t('sb.h1') + '</h1><p>' + t('sb.desc') + '</p></div>'
      + '<section class="card"><div class="row"><span class="lbl">' + t('bud.stock') + '</span>' + SEG('sandbox.stock', [['none', t('bud.none')], ['now', t('bud.now')]]) + '</div></section>'
      + '<div class="two"><section class="card"><h2>' + t('sb.t1') + '</h2><div class="row">' + N('sandbox.' + MK(), { cls: 'big', step: 'any' }) + '<span class="unit">' + (isGlobal() ? '€' : '₽') + '</span></div><div class="sum" data-d="tool2"></div></section>'
      + '<section class="card"><h2>' + t('sb.t2') + '</h2><div class="row">' + N('sandbox.letters', { cls: 'big' }) + '<span class="unit">' + IC('letters') + t('cur.s.letters') + '</span></div><div class="sum" data-d="tool1"></div></section></div>'
      + '</div></div></div>';
  }
  function updateSandbox() {
    const D = {}, sb = S.sandbox, o = { stock: sb.stock, now: nowMin(), end: 0 };
    barData(D, LET, 0);
    const money = sb[MK()], eco = ecoFor(LET, o, Math.max(sb.letters, G.ecoBound(ES(), LET, o, money)) + 1), own = eco.own.units;
    const c = eco.cost(sb.letters);
    D.tool1 = !c ? '<p class="hint">' + t('buy.none') + '</p>' : c.price <= 0 && !c.buys.length ? t('buy.enough') : t('sb.need', { u: uc(sb.letters, LET), r: rub(c.price) }) + planHtml(c, LET);
    const m = eco.maxFor(money);
    D.tool2 = !m ? t('bud.tooBig') : t('sb.get', { u: uc(m.units, LET), own: own ? t('bud.withOwn') : '' }) + (m.price > 0 || m.buys.length ? t('sb.spend', { r: rub(m.price) }) + planHtml(m, LET) : '.');
    return D;
  }

  /* ---------- страница: экономика и магазин ---------- */
  function tzName() {
    const m = -new Date().getTimezoneOffset(), a = Math.abs(m);
    return 'GMT' + (m < 0 ? '−' : '+') + Math.floor(a / 60) + (a % 60 ? ':' + String(a % 60).padStart(2, '0') : '');
  }
  /* Время обновления: пустое значение = авто (привязано к GMT+3), показывается в часах компьютера. */
  function timeField(labelKey, path, utcMin) {
    const v = get(path);
    return '<label>' + t(labelKey) + '<span class="tf"><input class="txt" type="time" data-t="time" data-rr="1" data-b="' + path + '" value="' + esc(v || G.autoLocal(utcMin)) + '">'
      + (v ? '<button type="button" class="btn ghost" data-a="set" data-b="' + path + '" data-v="">' + t('eco.autoBtn') + '</button>' : '<span class="auto">' + t('eco.auto') + '</span>') + '</span></label>';
  }
  function pageEco() {
    const F = (label, input) => '<label>' + label + input + '</label>';
    const bundles = S.bundles.length ? '<div class="b-head"><span>' + t('eco.bOn') + '</span><span>' + t('eco.bName') + '</span><span>' + t('eco.bPrice') + '</span>' + ['letters', 'coins', 'fragments', 'shards', 'wax'].map((c) => '<span class="ich">' + IC(c) + '</span>').join('') + '<span>' + DOT(t('eco.bLimit'), 'tip.limit') + '</span><span></span></div>'
      + S.bundles.map((b, i) => '<div class="b-row"><label class="switch"><input type="checkbox" data-b="bundles.' + i + '.on" data-rr="1"' + (b.on ? ' checked' : '') + ' aria-label="' + t('eco.bOn') + '"><span></span></label>'
        + TXT('bundles.' + i + '.name', t('eco.bName'), bdName(Object.assign({}, b, { name: '' }), i)) + N('bundles.' + i + '.' + PK(), { step: 'any', label: t('eco.bPrice') })
        + ['letters', 'coins', 'fragments', 'shards', 'wax'].map((c) => N('bundles.' + i + '.' + c, { label: t('cur.' + c) })).join('') + N('bundles.' + i + '.limit', { label: t('eco.bLimit'), max: 99 })
        + '<button class="x" data-a="delBundle" data-i="' + i + '" aria-label="' + t('eco.delBundle') + '">×</button><span class="b-note" data-d="bundle' + i + '"></span></div>').join('')
      : '<p class="hint">' + t('eco.bEmpty') + '</p>';
    const h = '<div class="page-head"><h1>' + t('eco.h1') + '</h1><p>' + t('eco.desc') + '</p></div>'
      + '<div class="two"><section class="card"><h2>' + t('eco.rates') + '</h2><div class="fields">' + ['coins', 'fragments', 'shards'].map((c) => F('<span>' + IC(c) + t('cur.' + c) + '</span>', N('rates.' + c, { min: 1 }))).join('') + '</div>'
      + '<p class="hint" style="margin-top:9px">' + t('eco.ratesHint') + '</p></section>'
      + '<section class="card"><h2>' + t('eco.income') + '</h2><div class="fields">' + F(t('eco.daily'), N('income.dailyFragments')) + F(t('eco.subLeft'), N('income.subDaysLeft')) + '</div>'
      + '<div class="fields" style="margin-top:10px">' + timeField('eco.reset', 'income.resetTime', G.DAILY_UTC) + timeField('eco.subReset', 'income.subResetTime', G.PASS_UTC) + '</div>'
      + '<div class="row" style="margin-top:10px">' + SW('income.dailiesOn', t('eco.dailiesOn')) + '</div><div class="row">' + SW('income.subOn', t('eco.subOn')) + '</div>'
      + '<p class="hint" style="margin-top:9px">' + t('eco.tzHint', { tz: tzName() }) + '</p><p class="hint" style="margin-top:6px" data-d="incomeHint"></p></section></div>'
      + '<section class="card"><h2>' + t('eco.sub') + '</h2><div class="fields">' + F(t('eco.subPrice'), N('sub.' + PK(), { step: 'any' })) + F(t('eco.subCoins'), N('sub.coins')) + F(t('eco.subFrag'), N('sub.fragPerDay')) + F(t('eco.subDays'), N('sub.days')) + F(t('eco.subMax'), N('sub.max')) + '</div>'
      + '<div class="row" style="margin-top:10px">' + SW('sub.allow', t('eco.subAllow')) + '</div><p class="hint" style="margin-top:9px" data-d="subNote"></p></section>'
      + '<section class="card packs"><h2>' + t('eco.shop') + '</h2><div class="packs-head"><span>' + t('eco.pCoins') + '</span><span>' + t('eco.pBonus') + '</span><span>' + t('eco.pFirst') + '</span><span>' + t('eco.pPrice') + '</span><span>' + t('eco.pAvail') + '</span><span>' + t('eco.pPer') + '</span><span></span></div>'
      + S.packs.map((p, i) => '<div class="list-row">' + N('packs.' + i + '.coins') + N('packs.' + i + '.bonus') + N('packs.' + i + '.firstBonus') + N('packs.' + i + '.' + PK(), { step: 'any' })
        + SW('packs.' + i + '.firstAvail', p.firstAvail ? t('eco.avail') : t('eco.used')) + '<span class="pack-total" data-d="pack' + i + '"></span><button class="x" data-a="delPack" data-i="' + i + '" aria-label="' + t('eco.delPack') + '">×</button></div>').join('')
      + '<div class="row" style="margin-top:8px"><button class="btn" data-a="addPack">' + t('eco.addPack') + '</button><span class="hint grow">' + t('eco.shopHint') + '</span></div></section>'
      + '<section class="card bundles"><h2>' + t('eco.bundles') + '</h2><p class="hint" style="margin-bottom:10px">' + t('eco.bHint') + '</p>' + bundles
      + '<p class="hint note">' + II + '<span>' + t('eco.bGone') + '</span></p>'
      + '<div class="row" style="margin-top:8px"><button class="btn" data-a="addBundle">' + t('eco.addBundle') + '</button></div></section>';
    return topBar({ pay: LET, endPath: null, wax: true }) + '<div class="cols one"><div class="col"><div class="wrap">' + h + '</div></div></div>';
  }
  function updateEco() {
    const D = {};
    barData(D, LET, 0);
    const per = (price, letters) => (letters > 0 ? rub(price / letters) : '–');
    S.packs.forEach((p, i) => {
      const r = (p.coins + p.bonus) / S.rates.coins, f = (p.coins + p.firstBonus) / S.rates.coins;
      D['pack' + i] = (p.firstAvail ? t('eco.first') + ' ' + per(p[PK()], f) + ' · ' : '') + t('eco.then') + ' ' + per(p[PK()], r);
    });
    S.bundles.forEach((b, i) => {
      const u = b.letters + b.coins / S.rates.coins + b.fragments / S.rates.fragments + b.shards / S.rates.shards;
      D['bundle' + i] = u > 0 ? '≈ ' + cnt(Math.round(u * 100) / 100, 'letter') + ' · ' + t('eco.per', { r: per(b[PK()], u) }) : '';
    });
    const sp = S.sub.coins / S.rates.coins + S.sub.fragPerDay * S.sub.days / S.rates.fragments;
    D.subNote = t('eco.subNote', { u: cnt(Math.round(sp * 10) / 10, 'letter'), r: per(subPrice(), sp) });
    D.incomeHint = t('eco.incomeHint', { d: S.income.lastSync ? dateFmt(S.income.lastSync) : '–' });
    return D;
  }

  /* ---------- страница: тех. настройки ---------- */
  function pageTech() {
    const where = info.server ? (info.writable ? t('tech.file', { p: esc(info.path) }) : t('tech.ro')) : t('tech.browser');
    return '<div class="cols one"><div class="col"><div class="wrap"><div class="page-head"><h1>' + t('tech.h1') + '</h1></div>'
      + '<section class="card"><h2>' + t('tech.lang') + '</h2><div class="seg srv">' + [['ru', 'Ru'], ['en', 'Global']].map((o) => '<button type="button" data-a="lang" data-v="' + o[0] + '" class="' + (lang() === o[0] ? 'on' : '') + '" aria-pressed="' + (lang() === o[0]) + '">' + o[1] + '</button>').join('') + '</div><p class="hint" style="margin-top:9px">' + t('tech.srvHint') + '</p></section>'
      + '<section class="card"><h2>' + t('tech.where') + '</h2><p class="lbl">' + where + '</p><p class="hint" style="margin-top:8px">' + t('tech.noTrace') + '</p></section>'
      + '<section class="card"><h2>' + t('tech.reset') + '</h2><div class="row">' + [['banners', 'tech.rBanners'], ['flats', 'tech.rFlats'], ['eco', 'tech.rEco'], ['wallet', 'tech.rWallet']].map((o) => '<button class="btn" data-a="reset" data-v="' + o[0] + '">' + t(o[1]) + '</button>').join('')
      + '<button class="btn danger" data-a="reset" data-v="all">' + t('tech.rAll') + '</button></div></section>'
      + '<section class="card"><h2>' + t('tech.io') + '</h2><div class="row"><button class="btn" data-a="export">' + t('tech.export') + '</button><button class="btn" data-a="import">' + t('tech.import') + '</button></div>'
      + '<textarea id="io" style="margin-top:10px" placeholder="' + t('tech.ioPh') + '" spellcheck="false"></textarea></section></div></div></div>';
  }

  /* ---------- окна ---------- */
  function renderModal() {
    const el = $('#modal');
    if (!modal) { el.hidden = true; el.innerHTML = ''; return; }
    const body = modal === 'about'
      ? '<h2>' + t('about.title') + '</h2><p class="author"><b>UpupuCalc</b> · ' + t('about.version', { v: APP_VERSION }) + '<br>' + t('about.author') + ': <b>' + esc(LINKS.author || 'Ragelm') + '</b></p>'
        + '<h3>' + t('about.links') + '</h3><ul class="alinks"><li>' + EXT(LINKS.github, t('about.github')) + '</li><li>' + EXT(LINKS.telegram, t('about.tg')) + '</li></ul>'
        + '<h3>' + t('about.how') + '</h3><p>' + t('about.howText') + '</p><h3>' + t('about.app') + '</h3><p>' + t('about.appText') + '</p>'
      : '<h2>' + t('where.title') + '</h2><p>' + t('where.text') + '</p><figure><img src="img/info1.jpg" alt=""><figcaption>' + t('where.c1') + '</figcaption></figure><figure><img src="img/info2.jpg" alt=""><figcaption>' + t('where.c2') + '</figcaption></figure>';
    el.innerHTML = '<div class="modal-box" role="dialog" aria-modal="true"><button class="x" data-a="closeModal" aria-label="' + t('close') + '">×</button>' + body + '</div>';
    el.hidden = false;
    $('.x', el).focus();
  }

  /* ---------- отрисовка ---------- */
  const keyOf = (el) => ['a', 'b', 'c', 'i', 'v', 'k', 'tm'].map((k) => el.dataset[k] || '').join('|');
  function renderPage() {
    const ae = document.activeElement, key = ae && main.contains(ae) ? keyOf(ae) : null;
    const scr = $$('.col', main).map((c) => c.scrollTop);
    const ts = $('.tscroll', main), tsTop = ts ? ts.scrollTop : 0;
    renderSide();
    main.innerHTML = S.page === 'flat' ? pageFlat() : S.page === 'sandbox' ? pageSandbox() : S.page === 'eco' ? pageEco() : S.page === 'tech' ? pageTech() : pageBox();
    update();
    $$('.col', main).forEach((c, i) => { c.scrollTop = scr[i] || 0; });
    const ts2 = $('.tscroll', main); if (ts2) ts2.scrollTop = tsTop;
    if (key) { const el = $$('[data-a],[data-b],[data-tm]', main).find((x) => keyOf(x) === key); if (el) el.focus({ preventScroll: true }); }
  }
  function update() {
    const own = G.stockOf(S, LET, { stock: 'now' }).units;
    $('#stash-n').textContent = fmt2(own);
    $('#stash-l').textContent = t('side.stash', { w: W(own, 'letter') });
    $('#stash-s').textContent = t('side.stashSub');
    let D = {};
    const ts = $('.tscroll', main), tsTop = ts ? ts.scrollTop : 0;
    if (S.page === 'box') D = updateBox(); else if (S.page === 'flat') D = updateFlat(); else if (S.page === 'sandbox') D = updateSandbox(); else if (S.page === 'eco') D = updateEco();
    $$('[data-d]', main).forEach((el) => { const v = D[el.dataset.d]; el.innerHTML = v == null ? '' : v; });
    const ts2 = $('.tscroll', main); if (ts2) ts2.scrollTop = tsTop;
  }
  function syncInputs() {
    $$('input[data-b]', main).forEach((el) => {
      if (el === document.activeElement || el.type === 'checkbox') return;
      const v = get(el.dataset.b);
      if (v != null && String(v) !== el.value) el.value = v;
    });
  }

  /* ---------- подсказки ---------- */
  const tipbox = $('#tipbox');
  function showTip(el) {
    tipbox.innerHTML = t(el.dataset.tip);
    tipbox.hidden = false;
    const r = el.getBoundingClientRect(), w = tipbox.offsetWidth, h = tipbox.offsetHeight;
    tipbox.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    let y = r.bottom + 8;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
    tipbox.style.top = y + 'px';
  }
  const tipTarget = (e) => (e.target.closest ? e.target.closest('[data-tip]') : null);
  document.addEventListener('mouseover', (e) => { const el = tipTarget(e); if (el) showTip(el); else tipbox.hidden = true; });
  document.addEventListener('focusin', (e) => { const el = tipTarget(e); if (el) showTip(el); });
  document.addEventListener('focusout', () => { tipbox.hidden = true; });
  document.addEventListener('scroll', () => { tipbox.hidden = true; }, true);

  /* ---------- события ---------- */
  main.addEventListener('input', (e) => {
    const tm = e.target.closest('[data-tm]');
    if (tm) {
      const box = tm.closest('[data-end]'), v = {};
      $$('[data-tm]', box).forEach((el) => { v[el.dataset.tm] = Math.max(0, parseFloat(el.value) || 0); });
      const ms = Math.round((v.d * 1440 + v.h * 60 + v.m) * 60000);
      set(box.dataset.end, ms > 0 ? Date.now() + ms : 0);
      save(); update();
      return;
    }
    const el = e.target.closest('[data-b]');
    if (!el || el.tagName === 'BUTTON') return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.dataset.t === 'text' || el.dataset.t === 'time') v = el.value;
    else { v = parseFloat(String(el.value).replace(',', '.')); if (!isFinite(v)) v = 0; }
    set(el.dataset.b, v);
    save();
    if (el.type === 'checkbox' || el.tagName === 'SELECT') { sanitize(); renderPage(); } else update();
  });
  main.addEventListener('change', (e) => {
    if (e.target.closest('[data-tm]')) { syncTimers(); return; }
    const el = e.target.closest('[data-b]');
    if (!el || el.tagName === 'BUTTON' || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    sanitize(); save();
    if (el.dataset.rr) renderPage(); else { syncInputs(); update(); }
  });
  main.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches('input.num')) e.target.select(); });
  main.addEventListener('mousemove', (e) => { if (e.target.closest && e.target.closest('#chart')) chartMove(e); else chartLeave(); });
  main.addEventListener('mouseleave', chartLeave);

  const cat = (d) => bn().categories[d.c];
  function setTitle() { if (info.server) fetch('api/title', { method: 'POST', body: t('app.title') }).catch(() => {}); }
  const A = {
    nav: (d) => { S.page = d.v; addMenu = false; },
    set: (d) => { set(d.b, d.v); },
    undo: () => { if (undoFn) { undoFn(); undoFn = null; $('#toast').hidden = true; } },
    lang: (d) => { S.lang = d.v; setTitle(); },
    about: () => { modal = 'about'; renderModal(); return 'keep'; },
    where: () => { modal = 'where'; renderModal(); return 'keep'; },
    closeModal: () => { modal = null; renderModal(); return 'keep'; },
    tips: () => { S.ui.tipsOpen = !S.ui.tipsOpen; },
    tip: (d) => { S.ui.tip = (S.ui.tip + (+d.v) + TIPS) % TIPS; },
    tipGo: (d) => { S.ui.tip = ci(+d.v, 0, TIPS - 1); },
    bn: (d) => { S[KIND[d.k].act] = d.v; addMenu = false; },
    addMenu: (d) => { addMenu = addMenu === d.k ? false : d.k; },
    newBanner: (d) => {
      const K = KIND[d.k];
      let b;
      if (d.v === 'copy') { const src = K.cur(); b = JSON.parse(JSON.stringify(src)); b.id = G.newId(); b.name = t('bn.copy', { name: bnName(src) }); b.tpl = ''; }
      else b = K.tpl[d.v]();
      K.arr().push(b); S[K.act] = b.id; addMenu = false;
    },
    delBanner: (d) => { const K = KIND[d.k]; if (K.arr().length < 2) return; snap(); K.arr().splice(K.arr().indexOf(K.cur()), 1); toast(t('msg.bnDel'), true); },
    resetTpl: (d) => { const K = KIND[d.k], b = K.cur(); if (!K.tpl[b.tpl]) return; snap(); const n = K.tpl[b.tpl](); n.id = b.id; n.name = b.name; n.end = b.end; K.arr()[K.arr().indexOf(b)] = n; toast(t('msg.bnReset'), true); },
    want: (d) => { const it = cat(d).items[d.i]; it.want = it.want > 0 ? 0 : 1; },
    cyc: (d) => { const it = cat(d).items[d.i]; if (it.bought) { it.bought = 0; it.got = 0; } else if (it.got) { it.got = 0; it.bought = it.copies; } else it.got = it.copies; },
    toggleCat: (d) => { const c = cat(d); c.open = !c.open; },
    waxCat: (d) => { const c = cat(d); if (c.leg) c.wax = !c.wax; },
    addItem: (d) => { cat(d).items.push({ id: G.newId(), name: '', nk: '', copies: 1, got: 0, bought: 0, want: 0 }); },
    delItem: (d) => { snap(); cat(d).items.splice(d.i, 1); toast(t('msg.itemDel'), true); },
    selAll: (d) => { for (const it of cat(d).items) it.want = d.v === '1' ? (it.want > 0 ? it.want : (it.copies - it.got - it.bought > 0 ? 1 : 0)) : 0; },
    fill: (d) => {
      snap();
      const c = cat(d);
      c.items = Array.from({ length: c.fillN }, () => ({ id: G.newId(), name: '', nk: '', copies: c.fillX, got: 0, bought: 0, want: 0 }));
      c.open = true;
      toast(t('msg.fill', { n: c.fillN, x: c.fillX }), true);
    },
    addCat: () => { bn().categories.push({ id: G.newId(), name: '', nk: '', color: '#8fd3a8', chance: 0, open: true, leg: false, wax: false, items: [{ id: G.newId(), name: '', nk: '', copies: 1, got: 0, bought: 0, want: 0 }] }); },
    delCat: (d) => { snap(); bn().categories.splice(d.c, 1); toast(t('msg.catDel'), true); },
    addCost: () => {
      const b = bn(), R = G.bannerCalc(b, {}), last = b.costs[b.costs.length - 1];
      let before = 0;
      for (let i = 0; i < b.costs.length - 1; i++) before += b.costs[i].count;
      last.count = Math.max(1, R.total - before);   // бывшая последняя ступень получает своё число круток
      b.costs.push({ count: 0, cost: last.cost });
    },
    delCost: (d) => { const b = bn(); if (b.costs.length < 2) return; snap(); b.costs.splice(d.i, 1); toast(t('msg.costDel'), true); },
    clearEnd: (d) => { set(d.b, 0); },
    addPack: () => { S.packs.push({ id: G.newId(), coins: 1000, bonus: 0, firstBonus: 1000, price: 500, priceEu: 4.99, firstAvail: true }); },
    delPack: (d) => { snap(); S.packs.splice(d.i, 1); toast(t('msg.packDel'), true); },
    addBundle: () => { S.bundles.push({ id: G.newId(), name: '', nk: '', on: true, price: 0, priceEu: 0, letters: 0, coins: 0, fragments: 0, shards: 0, wax: 0, limit: 1 }); },
    delBundle: (d) => { snap(); S.bundles.splice(d.i, 1); toast(t('msg.bundleDel'), true); },
    addFlat: () => { fl().items.push(G.fitem({ chance: 1 })); },
    delFlat: (d) => { snap(); fl().items.splice(d.i, 1); toast(t('msg.itemDel'), true); },
    fwant: (d) => { const it = fl().items[d.i]; it.want = it.want > 0 ? 0 : 1; },
    ftog: (d) => { const it = fl().items[d.i]; it[d.v] = !it[d.v]; },
    reset: (d) => {
      snap();
      const D = G.defaults(), keep = { page: S.page, lang: S.lang, lastSync: S.income.lastSync };
      if (d.v === 'all') { S = D; S.page = keep.page; S.lang = keep.lang; }
      else if (d.v === 'banners') { S.banners = D.banners; S.activeBanner = D.activeBanner; }
      else if (d.v === 'flats') { S.flats = D.flats; S.activeFlat = D.activeFlat; }
      else if (d.v === 'wallet') S.wallet = D.wallet;
      else { S.rates = D.rates; S.income = D.income; S.sub = D.sub; S.packs = D.packs; S.bundles = D.bundles; }
      S.income.lastSync = keep.lastSync;
      toast(t('msg.reset'), true);
    },
    export: () => {
      const tx = JSON.stringify(S), io = $('#io');
      io.value = tx; io.select();
      const done = () => toast(t('msg.copied'), false);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tx).then(done, () => { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
      return 'keep';
    },
    import: () => {
      let obj;
      try { obj = JSON.parse($('#io').value); } catch (e) { toast(t('msg.badImport'), false); return 'keep'; }
      if (!obj || typeof obj !== 'object') { toast(t('msg.badImport'), false); return 'keep'; }
      snap(); const page = S.page; adopt(obj); S.page = page;
      toast(t('msg.imported'), true);
    }
  };
  function act(el) {
    const fn = A[el.dataset.a];
    if (!fn) return;
    if (el.dataset.a !== 'addMenu' && el.dataset.a !== 'newBanner') addMenu = false;
    const r = fn(el.dataset);
    if (r === 'keep') return;
    sanitize(); save(); renderPage();
  }
  document.addEventListener('click', (e) => {
    const ext = e.target.closest && e.target.closest('a[data-ext]');
    if (ext) {   // ссылки автора открываются в обычном браузере, а не в окне программы
      e.preventDefault();
      if (info.server) fetch('api/open', { method: 'POST', body: ext.href }).catch(() => {});
      else window.open(ext.href, '_blank', 'noopener');
      return;
    }
    if (e.target.id === 'modal') { modal = null; renderModal(); return; }
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) { if (addMenu && !e.target.closest('.menu-wrap')) { addMenu = false; renderPage(); } return; }
    act(el);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (modal) { modal = null; renderModal(); } else if (addMenu) { addMenu = false; renderPage(); } tipbox.hidden = true; return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-a]')) { e.preventDefault(); act(e.target); }
  });

  /* ---------- запуск ---------- */
  async function start() {
    try {
      const r = await fetch('api/info');
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) { info = Object.assign({}, await r.json(), { server: true }); }
    } catch (e) { /* открыто как обычная страница */ }
    try {
      if (info.server) { const r = await fetch('api/settings'); if (r.status === 200) adopt(await r.json()); }
      else { const tx = localStorage.getItem('gacha-calc'); if (tx) adopt(JSON.parse(tx)); }
    } catch (e) { /* повреждённые настройки – остаются исходные */ }
    sanitize();
    if (info.server && !info.writable) setSaveState(false, t('save.ro'));
    else setSaveState(true, info.server ? t('save.auto') : t('save.browser'));
    setTitle();
    lastMin = nowMin();
    if (accrue()) save();
    renderPage();
    setInterval(tick, 15000);
    if (info.server && info.keepAlive) { try { new EventSource('api/alive'); } catch (e) { /* не критично */ } }
  }
  window.__gacha = { get state() { return S; }, t };
  start();
})();
