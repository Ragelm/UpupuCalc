// Сверка точного расчёта с независимой симуляцией, написанной прямо по правилам игры.
const G = require('../ui/core.js');
let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('FAIL', msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`); }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clone = (o) => JSON.parse(JSON.stringify(o));
const D = G.defaults(), EV = D.banners[0], SON = D.banners[1];

// Буквальная симуляция: редкость -> вид предмета (поровну между видами), без дубликатов,
// шанс пустой категории делится поровну, Сургуч действует на категорию с отметкой wax.
function simulate(b, wax0, runs, seed) {
  const rnd = rng(seed);
  const left = (it) => it.copies - it.got - (it.bought || 0);
  const K = b.categories.reduce((s, c) => s + c.items.reduce((q, it) => q + left(it), 0), 0);
  const all = new Float64Array(K + 1), any = new Float64Array(K + 1);
  const tgt = [];
  b.categories.forEach((c, ci) => c.items.forEach((it, ii) => { if (it.want > 0 && left(it) > 0) tgt.push([ci, ii]); }));
  const itemHit = tgt.map(() => new Float64Array(K + 1));
  const sum = b.categories.reduce((s, c) => s + c.chance, 0);
  for (let r = 0; r < runs; r++) {
    const rem = b.categories.map((c) => c.items.map(left));
    const need = b.categories.map((c) => c.items.map((it) => Math.min(it.want, left(it))));
    let wax = wax0;
    for (let k = 0; k <= K; k++) {
      let sat = 0;
      tgt.forEach(([ci, ii], t) => { if (need[ci][ii] <= 0) { sat++; itemHit[t][k]++; } });
      if (sat === tgt.length && tgt.length) all[k]++;
      if (sat > 0) any[k]++;
      if (k === K) break;
      const alive = rem.map((a) => a.some((x) => x > 0));
      const n = alive.filter(Boolean).length;
      let dead = 0;
      b.categories.forEach((c, ci) => { if (!alive[ci]) dead += c.chance; });
      let u = rnd(), ci = -1;
      for (let c = 0; c < rem.length; c++) {
        if (!alive[c]) continue;
        const p = (b.categories[c].chance + dead / n) / sum;
        ci = c;
        if (u < p) break;
        u -= p;
      }
      let ii = -1;
      if (wax > 0 && b.categories[ci].wax) {
        let bestNeed = 1e9;   // игрок берёт цель, которой меньше всего осталось до выполнения
        need[ci].forEach((q, i) => { const w0 = Math.min(b.categories[ci].items[i].want, left(b.categories[ci].items[i])); if (q > 0 && rem[ci][i] > 0 && w0 < bestNeed) { bestNeed = w0; ii = i; } });
        if (ii >= 0) wax--;
      }
      if (ii < 0) { const idx = []; rem[ci].forEach((x, i) => { if (x > 0) idx.push(i); }); ii = idx[Math.floor(rnd() * idx.length)]; }
      rem[ci][ii]--; need[ci][ii]--;
    }
  }
  for (let k = 0; k <= K; k++) { all[k] /= runs; any[k] /= runs; itemHit.forEach((a) => a[k] /= runs); }
  return { all, any, itemHit, K };
}
function compare(name, b, wax, runs = 150000) {
  const ex = G.bannerCalc(b, { wax }), sim = simulate(b, wax, runs, 12345);
  ok(ex.K === sim.K, name + ': число оставшихся круток');
  let worst = 0;
  for (let k = 0; k <= ex.K; k++) {
    worst = Math.max(worst, Math.abs(ex.pAll[k] - sim.all[k]), Math.abs(ex.pAny[k] - sim.any[k]));
    ex.itemP.forEach((it, t) => { worst = Math.max(worst, Math.abs(it.p[k] - sim.itemHit[t][k])); });
    let s = 0; for (const v of ex.dist[k]) s += v;
    near(s, 1, 1e-9, name + ' сумма распределения k=' + k);
  }
  const tol = 4.5 * Math.sqrt(0.25 / runs);
  ok(worst < tol, `${name}: расхождение с симуляцией ${worst.toFixed(5)} (допуск ${tol.toFixed(5)})`);
  console.log(`  ${name}: макс. расхождение ${worst.toFixed(5)}${ex.approx ? ' (приближённо)' : ''}`);
  return ex;
}
const first = (r) => { for (let k = 0; k <= r.K; k++) if (r.pAll[k] >= 1 - 1e-9) return k; return null; };

// 1. Стоимость круток
{
  const r = G.bannerCalc(EV, {});
  near(r.costCum[25], 187, 1e-9, 'весь событийный баннер = 187 писем');
  near(r.costCum[3], 3, 1e-9, 'первые 3 крутки'); near(r.costCum[6], 9, 1e-9, '6 круток'); near(r.costEach[25], 16, 0, '25-я крутка');
  ok(r.K === 25 && r.total === 25, 'всего 25 предметов');
  ok(G.attemptsForSpins(r.costCum, 30) === 10 && G.attemptsForSpins(r.costCum, 8) === 5, 'круток на бюджет');
  const s = G.bannerCalc(SON, {});
  ok(s.K === 20, '«Первая соната»: 20 предметов');
  near(s.costCum[20], 7200, 1e-9, '«Первая соната»: весь баннер = 7200 Shinri монет');
  near(s.costCum[4], 400, 0, 'соната 4 крутки'); near(s.costEach[5], 200, 0, 'соната 5-я'); near(s.costEach[13], 500, 0, 'соната 13-я'); near(s.costEach[20], 700, 0, 'соната 20-я');
  // последняя строка таблицы действует на все оставшиеся крутки
  const b = clone(EV); b.categories[2].items.push({ copies: 3, got: 0, bought: 0, want: 0 });
  const r2 = G.bannerCalc(b, {});
  ok(r2.K === 28 && r2.costEach[28] === 16, 'хвост таблицы цен');
}
// 2. Простые значения
{
  const b = clone(EV); b.categories[0].items[0].want = 1;
  let r = G.bannerCalc(b, {});
  near(r.pAll[1], 0.02 / 4, 1e-12, 'первая крутка, 1 из 4 легендарок');
  near(r.pAll[25], 1, 1e-9, 'после 25 круток предмет гарантирован');
  near(G.bannerCalc(b, { wax: 1 }).pAll[1], 0.02, 1e-12, 'первая крутка с Сургучом');
  b.categories[0].wax = false; b.categories[1].wax = true;
  near(G.bannerCalc(b, { wax: 1 }).pAll[1], 0.02 / 4, 1e-12, 'Сургуч не действует без отметки на категории');
}
// 3. Перенос шанса: эпики закончились -> легендарка 21%, редкая 79%
{
  const b = clone(EV); b.categories[1].items.forEach((it) => it.got = 1);
  const r = G.bannerCalc(b, {});
  near(r.nextChance[0], 0.21, 1e-12, 'легендарка после эпиков'); near(r.nextChance[2], 0.79, 1e-12, 'редкая после эпиков');
  ok(r.done === 4 && r.costEach[1] === 2, 'после 4 выбитых следующая крутка стоит 2 письма');
}
// 4. Лайфхаки из задания: купленные в магазине предметы цену не двигают
{
  const b = clone(EV);
  b.categories[1].items[0].bought = 1; b.categories[2].items[0].bought = 1;
  b.categories[0].items[0].want = 1;
  let r = G.bannerCalc(b, {});
  ok(r.K === 23 && r.done === 0, 'два купленных предмета: 23 крутки, цена с первой ступени');
  near(r.costCum[23], 157, 1e-9, 'весь баннер без двух предметов = 157 писем');
  ok(first(r) === 23, 'без Сургуча гарант на последней крутке');
  r = G.bannerCalc(b, { wax: 1 });
  ok(first(r) === 20, 'с Сургучом гарант на 20-й крутке (' + first(r) + ')');
  near(r.costCum[first(r)], 117, 1e-9, 'Сургуч + два купленных = 117 писем до гаранта');
  const g = clone(EV); g.categories[1].items[0].got = 1; g.categories[2].items[0].got = 1;
  near(G.bannerCalc(g, {}).costCum[23], 185, 1e-9, 'выбитые предметы цену двигают (185)');
}
// 5. Сверка с симуляцией
console.log('Сверка с симуляцией:');
{
  let b = clone(EV); b.categories[0].items[0].want = 1;
  compare('1 легендарка', b, 0);
  compare('1 легендарка + Сургуч', b, 1);
  b = clone(EV); b.categories[0].items[0].want = 1; b.categories[0].items[2].want = 1; b.categories[1].items[1].want = 1; b.categories[2].items[5].want = 1;
  compare('2 лег. + эпик + редкая', b, 0);
  compare('то же + 1 Сургуч', b, 1);
  b.categories[1].items[0].bought = 1; b.categories[2].items[3].got = 1; b.categories[0].items[3].bought = 1;
  compare('то же + купленные и выбитые', b, 2);
  // «Первая соната»: виды с несколькими копиями
  let s = clone(SON); s.categories[0].items[1].want = 1; s.categories[1].items[0].want = 1;
  compare('соната: скин + портрет', s, 0);
  compare('соната: скин + портрет + Сургуч', s, 1);
  s = clone(SON); s.categories[1].items[1].want = 3; s.categories[1].items[2].want = 6; s.categories[1].items[1].got = 1; s.categories[2].items[0].want = 2;
  compare('соната: копии', s, 0);
  const allb = clone(EV); allb.categories.forEach((c) => c.items.forEach((it) => it.want = 1));
  const ra = compare('собрать всё', allb, 0, 40000);
  near(ra.pAll[24], 0, 1e-12, 'всё нельзя собрать раньше 25-й крутки'); near(ra.expSpins, 187, 1e-9, 'ожидание = полная стоимость');
}
// 6. Большая категория: запасной расчёт симуляцией
{
  const b = clone(EV);
  b.categories[2].items = Array.from({ length: 16 }, (_, i) => ({ copies: 2 + (i % 9), got: 0, bought: 0, want: i < 4 ? 1 + (i % 2) : 0 }));
  b.categories[0].items[0].want = 1;
  let t0 = Date.now();
  const r2 = G.bannerCalc(b, {});
  console.log('  очень большая категория: приближённо =', r2.approx, ', круток =', r2.K, ',', Date.now() - t0, 'мс');
  ok(r2.approx, 'запасная симуляция включилась');
  const sim = simulate(b, 0, 30000, 99);
  let worst = 0; for (let k = 0; k <= r2.K; k++) worst = Math.max(worst, Math.abs(r2.pAll[k] - sim.all[k]), Math.abs(r2.pAny[k] - sim.any[k]));
  ok(worst < 0.02, 'запасная симуляция близка к прямой: ' + worst.toFixed(4));
}
// 7. Фиксированный шанс
{
  let r = G.fixedCalc({ items: [{ chance: 2, want: 1 }, { chance: 10, want: 0 }] }, 50);
  near(r.pAll[50], 1 - Math.pow(0.98, 50), 1e-12, 'фикс: 1-(1-p)^n'); near(r.exp, 50, 1e-9, 'фикс: ожидание 1/p');
  ok(r.q50 === 35, 'фикс: 50% на 35-й крутке');
  r = G.fixedCalc({ items: [1, 2, 3, 4].map(() => ({ chance: 25, want: 1 })) }, 10);
  near(r.exp, 4 * (1 + 1 / 2 + 1 / 3 + 1 / 4), 1e-9, 'фикс: сборщик купонов');
  let ie = 0; for (let j = 0; j <= 4; j++) ie += [1, -4, 6, -4, 1][j] * Math.pow(1 - j / 4, 10);
  near(r.pAll[10], ie, 1e-12, 'фикс: включения-исключения');
  r = G.fixedCalc({ items: [{ chance: 5, want: 3 }, { chance: 1, want: 1 }] }, 100);
  const rnd = rng(7); let hit = 0, any = 0; const R = 200000;
  for (let i = 0; i < R; i++) { let a = 0, b2 = 0; for (let n = 0; n < 100; n++) { const u = rnd(); if (u < 0.05) a++; else if (u < 0.06) b2++; } if (a >= 3 && b2 >= 1) hit++; if (a >= 3 || b2 >= 1) any++; }
  near(r.pAll[100], hit / R, 0.005, 'фикс: все цели против симуляции'); near(r.pAny[100], any / R, 0.005, 'фикс: хотя бы одна против симуляции');
}
// 8. Время и начисления
{
  const t = (s) => new Date(s).getTime();
  ok(G.resetsBetween(t('2026-11-15T23:36:00'), t('2026-11-18T04:41:00'), '00:00') === 3, 'три обновления за 2 д 5 ч');
  ok(G.resetsBetween(t('2026-11-15T10:00:00'), t('2026-11-15T23:59:00'), '00:00') === 0, 'в тот же день обновлений нет');
  ok(G.resetsBetween(t('2026-11-15T03:00:00'), t('2026-11-16T05:00:00'), '04:00') === 2, 'обновление в 04:00');
  ok(G.resetsBetween(5, 3, '00:00') === 0, 'время назад');
  const S = clone(D); S.wallet = { letters: 2, coins: 250, fragments: 100, shards: 130, wax: 0 }; S.income.subDaysLeft = 2;
  const now = t('2026-11-15T12:00:00'), end = t('2026-11-25T12:00:00');
  let st = G.stockOf(S, { unit: 'letters' }, { stock: 'now', now, end });
  ok(st.units === 2 + 2 + 1 + 1, 'запас сейчас: каждая валюта отдельно');
  st = G.stockOf(S, { unit: 'letters' }, { stock: 'end', now, end });
  ok(st.resets === 10 && st.am.fragments === 100 + 600 + 180, 'запас к концу: дейлики и 2 дня подписки');
  S.income.dailiesOn = false; S.income.subOn = false;
  ok(G.stockOf(S, { unit: 'letters' }, { stock: 'end', now, end }).am.fragments === 100, 'начисления выключены');
  ok(G.stockOf(S, { unit: 'coins' }, { stock: 'now', now, end }).units === 250, 'баннер за монеты: считаются только монеты');
  ok(G.stockOf(S, { unit: 'letters' }, { stock: 'none', now, end }).units === 0, 'запас не учитывается');
  const key = { unit: 'keys', key: { letters: { on: true, price: 2 }, coins: { on: true, price: 150 }, fragments: { on: false, price: 1 }, shards: { on: false, price: 1 } } };
  const e = G.effPrices(key, S.rates);
  ok(e.letters === 2 && e.coins === 150 && e.fragments === 160 && e.shards === 240, 'ключи: прямая цена или через письма');
}
// 9. Магазин: подбор против полного перебора
{
  const S = clone(D), L = { unit: 'letters' };
  S.bundles = [];   // здесь проверяются только паки монет
  const reg = S.packs.map((p) => [p.coins + p.bonus, p.price]), fst = S.packs.map((p) => [p.coins + p.firstBonus, p.price]);
  function brute(need) {
    let best = Infinity;
    for (let mask = 0; mask < 64; mask++) {
      let a = 0, pr = 0; for (let t = 0; t < 6; t++) if (mask & (1 << t)) { a += fst[t][0]; pr += fst[t][1]; }
      const rec = (i, got, cost) => { if (cost >= best) return; if (got >= need) { best = cost; return; } if (i < 0) return; const mx = Math.ceil((need - got) / reg[i][0]); for (let k = mx; k >= 0; k--) rec(i - 1, got + k * reg[i][0], cost + k * reg[i][1]); };
      rec(5, a, pr);
    }
    return best;
  }
  S.sub.allow = false;
  let eco = G.makeEconomy(S, L, { stock: 'none', maxUnits: 600 });
  for (const need of [1, 4, 10, 18, 25, 50, 99, 187, 300, 520]) {
    const q = eco.cost(need);
    near(q.price, brute(need * 100), 1e-9, 'магазин: минимум для ' + need + ' писем');
    ok(q.units >= need, 'магазин: писем хватает для ' + need);
  }
  // с остатками в кошельке: 50 монет и 40 фрагментов не складываются в письмо
  S.wallet.coins = 50; S.wallet.fragments = 40;
  eco = G.makeEconomy(S, L, { stock: 'now', maxUnits: 200 });
  ok(eco.own.units === 0, 'остатки разных валют не складываются');
  for (const need of [1, 2, 9, 20, 187]) near(eco.cost(need).price, brute(need * 100 - 50), 1e-9, 'магазин с остатком монет: ' + need);
  S.wallet.coins = 0; S.wallet.fragments = 0; S.sub.allow = true;
  // подписка выгодна, когда до конца баннера много дней
  const now = new Date('2026-11-15T12:00:00').getTime();
  eco = G.makeEconomy(S, L, { stock: 'end', now, end: now + 30 * 86400000, maxUnits: 200 });
  ok(eco.own.units === Math.floor(30 * 60 / 80), 'дейлики за 30 дней = 22 письма');
  let c = eco.cost(60);
  ok(c.price === 450 && c.subs === 1 && c.units >= 60, 'до 60 писем дешевле всего подписка (' + c.price + ')');
  eco = G.makeEconomy(S, L, { stock: 'none', maxUnits: 200 });
  c = eco.cost(187);
  near(c.price, 4690, 1e-9, 'весь баннер с нуля: 4690 ₽');
  // прямая и обратная задачи согласованы
  const m = eco.maxFor(1000);
  ok(m.price <= 1000 && eco.cost(m.units + 1).price > 1000, 'максимум писем на 1000 ₽: ' + m.units + ' за ' + m.price);
  near(m.units, 31, 0, 'на 1000 ₽ с нуля 31 письмо');
  // наборы: дешёвый набор с письмами и Сургучом берётся первым, лимит соблюдается
  S.bundles = [{ id: 'b1', name: 'Акция', on: true, price: 100, letters: 10, coins: 0, fragments: 0, shards: 0, wax: 1, limit: 2 },
    { id: 'b2', name: 'Выключен', on: false, price: 1, letters: 999, coins: 0, fragments: 0, shards: 0, wax: 0, limit: 1 },
    { id: 'b3', name: 'Смешанный', on: true, price: 60, letters: 0, coins: 150, fragments: 120, shards: 60, wax: 0, limit: 1 }];
  eco = G.makeEconomy(S, L, { stock: 'none', maxUnits: 200 });
  c = eco.cost(20);
  ok(c.price === 200 && c.buys.length === 1 && c.buys[0].kind === 'bundle' && c.buys[0].count === 2 && c.gain.wax === 2, 'два набора по лимиту: ' + JSON.stringify(c.buys.map((b) => [b.kind, b.idx, b.count])));
  c = eco.cost(24);
  ok(c.units >= 24 && c.price === 299, 'сверх лимита добирается паком (' + c.price + ')');
  ok(c.buys.filter((b) => b.kind === 'bundle' && b.idx === 0)[0].count === 2, 'лимит набора не превышен');
  // смешанный набор: 150 монет + 120 фрагментов + 60 остатков = 1 + 1 + 0 писем
  c = eco.cost(2);
  ok(c.units >= 2 && c.price <= 99, 'смешанный набор считается честно по валютам: ' + c.price + ' ₽, ' + c.units);
  // полный перебор по всем предложениям для небольших целей
  const offers = G.shopOffers(S);
  function bruteAll(target) {
    let best = Infinity;
    const rec = (i, am, price) => {
      if (price >= best) return;
      if (eco.unitsOf(am) >= target) { best = price; return; }
      if (i >= offers.length) return;
      const of = offers[i], mx = of.limit === Infinity ? (of.price > 0 ? 6 : 0) : of.limit;
      for (let k = 0; k <= mx; k++) {
        const a2 = Object.assign({}, am);
        for (const cu in of.am) a2[cu] = (a2[cu] || 0) + of.am[cu] * k;
        rec(i + 1, a2, price + of.price * k);
      }
    };
    rec(0, { letters: 0, coins: 0, fragments: 0, shards: 0 }, 0);
    return best;
  }
  S.sub.allow = false;
  eco = G.makeEconomy(S, L, { stock: 'none', maxUnits: 60 });
  let worstGap = 0;
  for (let tgt = 1; tgt <= 40; tgt++) { const q = eco.cost(tgt), bf = bruteAll(tgt); ok(q.units >= tgt, 'наборы: хватает для ' + tgt); ok(q.price <= bf + 100, 'наборы: близко к перебору для ' + tgt + ': ' + q.price + ' / ' + bf); worstGap = Math.max(worstGap, q.price - bf); }
  console.log('  наборы и паки против перебора: худшая переплата', worstGap, '₽');
  // баннер за Shinri монеты
  const eC = G.makeEconomy(clone(D), { unit: 'coins' }, { stock: 'none', maxUnits: 7200 });
  c = eC.cost(7200);
  ok(c.units >= 7200 && c.price === 1839, '«Первая соната» целиком с нуля: ' + c.price + ' ₽ ' + JSON.stringify(c.buys.map((b) => [b.kind, b.idx, b.count])));
  ok(G.makeEconomy(clone(D), { unit: 'shards' }, { stock: 'none', maxUnits: 100 }).cost(50) === null, 'за Остатки Отчаяния в магазине купить нечего');
}
// 10. Перенос настроек первой версии
{
  const old = { version: 1, page: 'wallet', rates: { coins: 100, fragments: 80, shards: 120 }, wallet: { spins: 3, coins: 1250, fragments: 10, shards: 5 },
    income: { days: 5, dailiesOn: true, dailyFragments: 60, subDaysLeft: 0 }, sub: { price: 450, coins: 900, fragPerDay: 90, days: 30, allow: true, max: 1 }, packs: D.packs,
    banner: { redistribution: 'equal', pick: 'kinds', wax: { count: 2, categoryId: 'a' }, categories: [{ id: 'a', name: 'Легендарная', color: '#f5c451', chance: 2, open: true, items: [{ id: 'x', name: 'Легендарка 1', copies: 1, got: 0, want: 1 }] }, { id: 'b', name: 'Редкая', color: '#5fa5f5', chance: 98, open: true, items: [{ id: 'y', name: 'Редкий 1', copies: 2, got: 1, want: 0 }] }],
      costs: [{ count: 3, cost: 1 }, { count: 1, cost: 5 }], budgetMode: 'attempts', spins: 7, attempts: 2, rubles: 500 },
    fixed: { items: [{ id: 'f', name: 'A', chance: 3, want: 1 }], costPerAttempt: 2, budgetMode: 'spins', attempts: 9, spins: 11, rubles: 12 }, tools: { spins: 5, rubles: 6 } };
  const m = G.migrate(old, 1000);
  ok(m.version === 4 && m.page === 'eco' && m.wallet.letters === 3 && m.wallet.wax === 2 && m.wallet.coins === 1250, 'перенос: кошелёк');
  const b = m.banners[0];
  ok(b.categories.length === 2 && b.categories[0].wax && b.categories[0].leg && !b.categories[1].wax && b.categories[1].items[0].got === 1 && b.budgetMode === 'pulls' && b.end === 1000 + 5 * 86400000, 'перенос: баннер');
  ok(!m.fixed && m.flats.length === 2 && m.flats[0].costPerPull === 2 && m.flats[0].budgetMode === 'units' && m.flats[0].units === 11 && m.flats[0].items[0].chance === 3 && m.flats[1].tpl === 'stroke' && m.banners.length === 2, 'перенос: фикс. шанс стал Flat-rate баннером');
  // настройки версии 2.0
  const v2 = { version: 2, page: 'fixed', income: { resetTime: '00:00' }, fixed: { items: [{ id: 'q', name: 'Z', chance: 7, want: 2 }], costPerPull: 3, pay: { unit: 'coins' }, end: 5, budgetMode: 'rubles', pulls: 1, units: 2, rubles: 3, stock: 'none', goal: 'q50' },
    banners: [{ tpl: 'sonata', categories: [{ nk: 'cat.leg', chance: 2, wax: false }, { nk: 'cat.epic', chance: 38, wax: true }, { nk: 'cat.rare', chance: 60 }] }, { tpl: 'event', categories: [{ nk: 'cat.leg', chance: 2, wax: true }, { nk: 'cat.epic', chance: 38 }] }] };
  const m2 = G.migrate(v2, 0);
  ok(m2.version === 4 && m2.page === 'flat' && m2.flats[0].items[0].want === 2 && m2.flats[0].pay.unit === 'coins' && m2.flats[0].stock === 'none' && m2.flats[0].pity.hardOn === false && m2.income.resetTime === '', 'перенос 2.0: Flat-rate и время');
  ok(m2.banners[0].categories[1].chance === 60 && m2.banners[0].categories[2].chance === 38 && m2.banners[0].categories[0].leg && !m2.banners[0].categories[1].leg && !m2.banners[0].categories[1].wax && m2.banners[1].categories[0].leg && m2.banners[1].categories[1].chance === 38, 'перенос 2.0: шансы сонаты и легендарная категория');
  ok(G.bannerCalc(b, { wax: m.wallet.wax }).K === 2, 'перенос: расчёт работает');
  ok(G.migrate(D) === D, 'новые настройки не трогаются');
}
// 11. Flat-rate гача: гарант, софт-гарант, обмен
{
  console.log('Flat-rate против симуляции:');
  // буквальная симуляция по правилам
  function simFlat(fl, ns, runs, seed) {
    const rnd = rng(seed), items = fl.items.map((it) => ({ p: it.chance / 100, need: it.want, pity: !!it.pity, exch: !!it.exch }));
    const pt = fl.pity, ex = fl.exch, Q = items.reduce((q, it) => q + (it.pity ? it.p : 0), 0);
    const all = ns.map(() => 0), any = ns.map(() => 0), last = ns[ns.length - 1];
    const tg = items.map((it, i) => i).filter((i) => items[i].need > 0);
    for (let r = 0; r < runs; r++) {
      const got = items.map(() => 0);
      let c = pt.count || 0, ni = 0;
      for (let n = 0; n <= last; n++) {
        if (n === ns[ni]) {
          const e = ex.on ? Math.floor(((ex.count || 0) + n) / ex.every) : 0;
          let sumD = 0, okN = true, a = false;
          for (const i of tg) { const d = Math.max(0, items[i].need - got[i]); if (d === 0) a = true; if (items[i].exch) { sumD += d; if (d <= e) a = true; } else if (d > 0) okN = false; }
          if (okN && sumD <= e) all[ni]++;
          if (a) any[ni]++;
          ni++;
        }
        if (n === last) break;
        const k = c + 1;
        let q = Q;
        if (pt.softOn && k >= pt.softStart) q = Math.min(1, Q + pt.softInc / 100 * (k - pt.softStart + 1));
        if (pt.hardOn && k >= pt.hardN) q = 1;
        let u = rnd(), hit = -1;
        for (let i = 0; i < items.length; i++) {
          const p = items[i].p * (Q > 0 && Q < 1 ? (items[i].pity ? q / Q : (1 - q) / (1 - Q)) : 1);
          if (u < p) { hit = i; break; }
          u -= p;
        }
        if (hit >= 0) got[hit]++;
        if (hit >= 0 && items[hit].pity) c = 0; else c++;
      }
    }
    return { all: all.map((x) => x / runs), any: any.map((x) => x / runs) };
  }
  function cmp(name, fl, ns, runs = 120000) {
    const sim = simFlat(fl, ns, runs, 4242), R = G.flatCalc(fl, ns[ns.length - 1]);
    let worst = 0;
    ns.forEach((n, i) => { worst = Math.max(worst, Math.abs(R.pAll[n] - sim.all[i]), Math.abs(R.pAny[n] - sim.any[i])); });
    const tol = 4.5 * Math.sqrt(0.25 / runs);
    ok(worst < tol, `${name}: расхождение ${worst.toFixed(5)} (допуск ${tol.toFixed(5)})`);
    console.log(`  ${name}: макс. расхождение ${worst.toFixed(5)}`);
    return R;
  }
  const mk = (items, pity, exch) => G.flatBase({ items: items.map((x) => G.fitem({ chance: x[0], want: x[1], pity: !!x[2], exch: x[3] !== false })), pity: Object.assign({ hardOn: false, hardN: 90, softOn: false, softStart: 74, softInc: 6, count: 0 }, pity), exch: Object.assign({ on: false, every: 300, count: 0 }, exch) });
  // без гарантов совпадает со старым расчётом
  const plain = mk([[2, 1], [10, 0], [5, 2]]);
  const A = G.flatCalc(plain, 80), B = G.fixedCalc(plain, 80);
  let dmax = 0; for (let n = 0; n <= 80; n++) dmax = Math.max(dmax, Math.abs(A.pAll[n] - B.pAll[n]), Math.abs(A.pAny[n] - B.pAny[n]));
  ok(dmax < 1e-12 && A.q100 === null, 'без гарантов совпадает с прежним расчётом');
  near(A.itemSel[1].p, B.itemSel[1].p, 1e-12, 'шанс отдельного предмета');
  // «Первый штрих»: одна граффити с шансом 2,05%
  const st = G.FLAT_TEMPLATES.stroke(); st.items[0].want = 1;
  const RS = G.flatCalc(st, 50);
  near(RS.pAll[50], 1 - Math.pow(1 - 0.0205, 50), 1e-12, '«Первый штрих»: 1-(1-p)^n'); near(RS.exp, 1 / 0.0205, 1e-9, '«Первый штрих»: в среднем 1/p');
  // гарант: единственный предмет в пуле гарантирован на крутке hardN
  let R = cmp('гарант на 90-й, один предмет в пуле', mk([[0.6, 1, true], [5, 0]], { hardOn: true, hardN: 90 }), [10, 50, 89, 90, 120]);
  ok(R.q100 === 90 && R.pAll[90] === 1 && R.pAll[89] < 1, 'гарант: 100% ровно на 90-й крутке');
  near(R.pAll[89], 1 - Math.pow(0.994, 89), 1e-12, 'до гаранта шанс обычный');
  R = cmp('гарант + софт-гарант (0,6%, с 74-й +6%)', mk([[0.6, 1, true], [5, 0]], { hardOn: true, hardN: 90, softOn: true, softStart: 74, softInc: 6 }), [40, 73, 76, 80, 85, 90]);
  ok(R.q100 === 90, 'софт-гарант не отменяет жёсткий');
  near(R.exp, R.pAll.reduce((sx, v) => sx + (1 - v), 0), 1e-9, 'среднее = сумма хвостов');
  ok(R.exp > 60 && R.exp < 64, 'среднее около 62 круток, как в играх с такой схемой (' + R.exp.toFixed(2) + ')');
  R = cmp('только софт-гарант', mk([[1, 1, true], [3, 1]], { softOn: true, softStart: 20, softInc: 10 }), [5, 19, 22, 26, 29, 60]);
  // два предмета в пуле 50/50: гарантии на конкретный нет
  R = cmp('пул из двух предметов, нужен один', mk([[0.3, 1, true], [0.3, 0, true], [4, 0]], { hardOn: true, hardN: 90 }), [60, 90, 180, 270]);
  ok(R.q100 === null, 'при двух предметах в пуле гарантии на нужный нет');
  R = cmp('пул из двух, нужны 2 копии + обычный предмет', mk([[0.5, 2, true], [0.5, 0, true], [3, 1]], { hardOn: true, hardN: 40, softOn: true, softStart: 30, softInc: 5, count: 12 }), [10, 28, 40, 80, 150], 80000);
  // обмен: каждые 100 круток предмет на выбор
  R = cmp('обмен каждые 100 круток', mk([[1, 1], [1, 1], [2, 0]], {}, { on: true, every: 100, count: 30 }), [20, 69, 70, 120, 169, 170]);
  ok(R.q100 === 170, 'обмен: два предмета гарантированы за 2×100−30 круток (' + R.q100 + ')');
  R = cmp('обмен + предмет вне обмена', mk([[1, 2], [2, 1, false, false]], {}, { on: true, every: 50 }), [30, 50, 99, 100, 160]);
  ok(R.q100 === null, 'предмет вне обмена не гарантируется');
  R = cmp('гарант + обмен вместе', mk([[0.6, 1, true], [0.6, 1, true], [5, 0]], { hardOn: true, hardN: 90, softOn: true, softStart: 74, softInc: 6 }, { on: true, every: 300 }), [80, 150, 299, 300, 450], 60000);
  ok(R.q100 !== null && R.q100 <= 600, 'гарант + обмен: гарантия не позже 600-й крутки (' + R.q100 + ')');
  // предмет с шансом 0 можно получить только обменом
  R = G.flatCalc(mk([[0, 1], [5, 0]], {}, { on: true, every: 10 }), 20);
  ok(!R.impossible && R.pAll[9] === 0 && R.pAll[10] === 1 && R.q100 === 10, 'предмет с шансом 0 берётся обменом');
  ok(G.flatCalc(mk([[0, 1], [5, 0]]), 20).impossible, 'без обмена предмет с шансом 0 недостижим');
  let s0 = 0; for (const v of G.flatCalc(mk([[1, 1], [1, 1], [2, 2]], { hardOn: true, hardN: 30 }, { on: true, every: 40 }), 77).distSel) s0 += v;
  near(s0, 1, 1e-9, 'распределение числа предметов суммируется в 1');
}
// 12. Время обновления по умолчанию привязано к GMT+3
{
  const u = (s) => Date.parse(s);
  ok(G.resetCount(u('2026-11-15T20:59:00Z'), u('2026-11-15T21:00:00Z'), '', G.DAILY_UTC) === 1, 'дейлики: 00:00 GMT+3 = 21:00 UTC');
  ok(G.resetCount(u('2026-11-15T21:00:00Z'), u('2026-11-16T20:59:00Z'), '', G.DAILY_UTC) === 0, 'дейлики: до следующей полуночи GMT+3 ничего');
  ok(G.resetCount(u('2026-11-15T23:59:00Z'), u('2026-11-18T00:00:00Z'), '', G.PASS_UTC) === 3, 'пропуск: 03:00 GMT+3 = 00:00 UTC');
  ok(G.resetCount(u('2026-03-28T12:00:00Z'), u('2026-03-30T12:00:00Z'), '', G.DAILY_UTC) === 2, 'перевод часов на авто-время не влияет');
  ok(G.resetCount(5, 3, '', 0) === 0, 'время назад');
  const S = clone(D); S.income.subDaysLeft = 5; S.wallet.fragments = 0;
  const now = u('2026-11-15T20:30:00Z'), end = u('2026-11-17T22:00:00Z');
  const st = G.stockOf(S, { unit: 'letters' }, { stock: 'end', now, end });
  ok(st.resets === 3 && st.resetsP === 2 && st.am.fragments === 3 * 60 + 2 * 90, 'дейлики и пропуск считаются каждый по своему времени');
  // Сургуч: сколько уйдёт
  const b = clone(EV); b.categories[0].items[0].want = 1; b.categories[0].items[1].want = 1;
  let r = G.bannerCalc(b, { wax: 5 });
  ok(r.waxOn && r.waxNeed === 2 && r.waxUsed === 2, 'Сургуч: уйдёт столько, сколько выбрано легендарок');
  ok(G.bannerCalc(b, { wax: 1 }).waxUsed === 1, 'Сургуч: не больше, чем есть');
  b.categories[0].wax = false;
  r = G.bannerCalc(b, { wax: 5 });
  ok(!r.waxOn && r.waxUsed === 0, 'Сургуч выключен на категории');
  const son = G.bannerCalc(SON, {});
  near(son.nextChance[1], 0.60, 1e-12, '«Первая соната»: эпик 60%'); near(son.nextChance[2], 0.38, 1e-12, '«Первая соната»: редкий 38%');
}
// 13. Сервер Global, наборы по умолчанию, «Первый штрих», перенос 3.0
{
  const S = clone(D);
  ok(S.bundles.length === 6 && S.bundles.every((b) => b.limit === 1 && b.on), 'шесть наборов по умолчанию, по одной покупке');
  const ru = G.makeEconomy(S, { unit: 'letters' }, { stock: 'none', maxUnits: 200 });
  let c = ru.cost(2);
  ok(c.price === 89 && c.buys[0].kind === 'bundle', 'Ru: 2 письма дешевле всего набором «Первый Шаг Надежды» за 89 ₽');
  c = ru.cost(100);
  ok(c.units >= 100 && c.price <= 3499, 'Ru: 100 писем не дороже «Точки невозврата»: ' + c.price);
  const SG = G.forServer(S, true);
  ok(SG.packs[0].price === 0.99 && SG.sub.price === 4.99 && SG.bundles[5].price === 34.99 && S.packs[0].price === 99, 'Global: цены в евро, исходные не тронуты');
  const gl = G.makeEconomy(SG, { unit: 'letters' }, { stock: 'none', maxUnits: 300 });
  c = gl.cost(2);
  near(c.price, 0.89, 1e-9, 'Global: 2 письма за €0.89');
  const m = gl.maxFor(10);
  ok(m.price <= 10 + 1e-9 && gl.cost(m.units + 1).price > 10, 'Global: максимум писем на €10 — ' + m.units + ' за €' + m.price.toFixed(2));
  // «Первый штрих»: 65 Фрагментов Надежды или 199 Shinri монет за крутку
  const st = G.FLAT_TEMPLATES.stroke(), e = G.effPrices(st.pay, S.rates);
  ok(st.pay.unit === 'keys' && st.costPerPull === 1 && e.fragments === 65 && e.coins === 199 && e.letters === Infinity && e.shards === Infinity, '«Первый штрих»: цена крутки');
  const W = clone(S); W.wallet = { letters: 5, coins: 400, fragments: 140, shards: 999, wax: 0 };
  ok(G.stockOf(W, st.pay, { stock: 'now' }).units === 2 + 2, '«Первый штрих»: запас 400 монет и 140 фрагментов = 4 крутки, письма и остатки не подходят');
  // перенос настроек 3.0
  const v3 = { version: 3, sub: { price: 450 }, packs: [{ coins: 900, bonus: 90, price: 449 }, { coins: 777, price: 300 }], bundles: [{ name: 'Моя акция', price: 199, letters: 3 }],
    flats: [{ tpl: 'stroke', pay: { unit: 'letters' }, costPerPull: 1 }, { tpl: 'stroke', pay: { unit: 'letters' }, costPerPull: 2 }] };
  const m3 = G.migrate(v3, 0);
  ok(m3.version === 4 && m3.packs[0].priceEu === 4.99 && m3.packs[1].priceEu === 3 && m3.sub.priceEu === 4.99, 'перенос 3.0: цены в евро');
  ok(m3.bundles.length === 7 && m3.bundles[0].name === 'Моя акция' && m3.bundles[0].priceEu === 1.99 && m3.bundles[1].nk === 'bd.firstStep', 'перенос 3.0: свои наборы сохранены, добавлены стандартные');
  ok(m3.flats[0].pay.unit === 'keys' && m3.flats[1].pay.unit === 'letters', 'перенос 3.0: цена «Первого штриха» обновлена, если её не меняли');
  ok(G.migrate(G.migrate(clone(v3), 0), 0).bundles.length === 7, 'повторный перенос не дублирует наборы');
}
console.log(`\n${checks - fails}/${checks} проверок пройдено`);
process.exit(fails ? 1 : 0);
