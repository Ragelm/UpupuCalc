/* Расчётное ядро калькулятора гачи. Без зависимостей: работает и в окне приложения, и в node (тесты). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GachaCore = factory();
})(this, function () {
  'use strict';

  function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : (d || 0); }
  function clampInt(v, lo, hi) {
    v = Math.floor(num(v, lo));
    return v < lo ? lo : (v > hi ? hi : v);
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const LF = [0];
  function logFact(n) {
    for (let i = LF.length; i <= n; i++) LF.push(LF[i - 1] + Math.log(i));
    return LF[n];
  }
  function logC(n, k) { return (k < 0 || k > n) ? -Infinity : logFact(n) - logFact(k) - logFact(n - k); }

  /* ---------- стоимость попыток ---------- */

  function normCosts(costs) {
    const out = [];
    for (const r of (costs || [])) out.push({ count: clampInt(r.count, 0, 100000), cost: Math.max(0, num(r.cost)) });
    return out;
  }
  /* Цена крутки с номером idx (с 1). Последняя строка таблицы действует на все оставшиеся крутки. */
  function attemptCost(costs, idx) {
    let n = 0;
    for (let i = 0; i < costs.length - 1; i++) { n += costs[i].count; if (idx <= n) return costs[i].cost; }
    return costs.length ? costs[costs.length - 1].cost : 0;
  }
  function cumCosts(costs, done, K) {
    const cs = normCosts(costs);
    const cum = new Float64Array(K + 1);
    const each = new Float64Array(K + 1);
    for (let k = 1; k <= K; k++) {
      each[k] = attemptCost(cs, done + k);
      cum[k] = cum[k - 1] + each[k];
    }
    return { cum, each };
  }
  function attemptsForSpins(cum, spins) {
    let k = 0;
    while (k + 1 < cum.length && cum[k + 1] <= spins + 1e-9) k++;
    return k;
  }

  /* ---------- внутри одной категории ---------- */

  /* Случайный порядок экземпляров: каждая оставшаяся копия равновероятна. */
  function randomCopies(kinds) {
    let M = 0, T = 0;
    for (const k of kinds) { M += k.rem; if (k.need > 0) T++; }
    let G = [];
    for (let t = 0; t <= M; t++) G.push(new Float64Array(T + 1));
    G[0][0] = 1;
    let used = 0;
    for (const k of kinds) {
      const r = k.rem, q = k.need;
      const b = new Float64Array(r + 1);
      for (let t = 0; t <= r; t++) b[t] = Math.exp(logC(r, t) - r * Math.LN2);
      const NG = [];
      for (let t = 0; t <= M; t++) NG.push(new Float64Array(T + 1));
      for (let t0 = 0; t0 <= used; t0++) {
        const row = G[t0];
        for (let j = 0; j <= T; j++) {
          const g = row[j];
          if (g === 0) continue;
          for (let t = 0; t <= r; t++) NG[t0 + t][j + ((q > 0 && t >= q) ? 1 : 0)] += g * b[t];
        }
      }
      G = NG; used += r;
    }
    const dist = [];
    for (let n = 0; n <= M; n++) {
      let s = 0;
      for (let j = 0; j <= T; j++) s += G[n][j];
      const row = new Float64Array(T + 1);
      for (let j = 0; j <= T; j++) row[j] = s > 0 ? G[n][j] / s : 0;
      dist.push(row);
    }
    const item = [];
    for (const k of kinds) {
      if (k.need <= 0) continue;
      const arr = new Float64Array(M + 1);
      for (let n = 0; n <= M; n++) {
        let miss = 0; // P(выпало меньше, чем нужно)
        for (let t = 0; t < k.need; t++) miss += Math.exp(logC(k.rem, t) + logC(M - k.rem, n - t) - logC(M, n));
        arr[n] = Math.min(1, Math.max(0, 1 - miss));
      }
      item.push(arr);
    }
    return { dist, item, approx: false };
  }

  /* Цепочка для режима «по видам»: каждый вид, у которого остались копии, равновероятен.
     Возвращает dist[n][j] либо null, если состояний слишком много. */
  function chainKinds(kinds, limit) {
    let M = 0, T = 0, maxRem = 0;
    for (const k of kinds) { M += k.rem; if (k.need > 0) T++; if (k.rem > maxRem) maxRem = k.rem; }
    const B = maxRem + 1;
    const start = kinds.filter(k => k.rem > 0).map(k => k.rem * B + k.need).sort((a, b) => a - b);
    let cur = new Map();
    cur.set(start.join(','), { codes: start, p: 1 });
    const dist = [];
    const push = (map) => {
      const row = new Float64Array(T + 1);
      for (const st of map.values()) {
        let un = 0;
        for (const c of st.codes) if (c % B > 0) un++;
        row[T - un] += st.p;
      }
      dist.push(row);
    };
    push(cur);
    for (let n = 1; n <= M; n++) {
      const next = new Map();
      for (const st of cur.values()) {
        const codes = st.codes, a = codes.length;
        let i = 0;
        while (i < a) {
          let j = i;
          while (j < a && codes[j] === codes[i]) j++;
          const m = j - i, c = codes[i];
          const rem = Math.floor(c / B) - 1, need = Math.max(0, (c % B) - 1);
          const nc = codes.slice(0, i).concat(codes.slice(i + 1));
          if (rem > 0) {
            const v = rem * B + need;
            let pos = 0;
            while (pos < nc.length && nc[pos] < v) pos++;
            nc.splice(pos, 0, v);
          }
          const key = nc.join(',');
          const ex = next.get(key);
          const p = st.p * m / a;
          if (ex) ex.p += p; else next.set(key, { codes: nc, p });
          i = j;
        }
      }
      if (next.size > limit) return null;
      cur = next;
      push(cur);
    }
    return dist;
  }

  function simulateKinds(kinds, runs) {
    let M = 0;
    const tIdx = [];
    kinds.forEach((k, i) => { M += k.rem; if (k.need > 0) tIdx.push(i); });
    const T = tIdx.length;
    const tOf = new Int32Array(kinds.length).fill(-1);
    tIdx.forEach((ki, t) => { tOf[ki] = t; });
    const dist = [], item = [];
    for (let n = 0; n <= M; n++) dist.push(new Float64Array(T + 1));
    for (let t = 0; t < T; t++) item.push(new Float64Array(M + 1));
    const rnd = mulberry32(0xC0FFEE);
    const rem = new Int32Array(kinds.length), got = new Int32Array(kinds.length), alive = new Int32Array(kinds.length);
    for (let r = 0; r < runs; r++) {
      let a = 0, sat = 0;
      const satT = new Uint8Array(T);
      for (let i = 0; i < kinds.length; i++) { rem[i] = kinds[i].rem; got[i] = 0; if (rem[i] > 0) alive[a++] = i; }
      dist[0][0] += 1;
      for (let n = 1; n <= M; n++) {
        const pos = Math.floor(rnd() * a), ki = alive[pos];
        rem[ki]--; got[ki]++;
        if (rem[ki] === 0) alive[pos] = alive[--a];
        if (tOf[ki] >= 0 && got[ki] === kinds[ki].need) { sat++; satT[tOf[ki]] = 1; }
        dist[n][sat] += 1;
        for (let t = 0; t < T; t++) if (satT[t]) item[t][n] += 1;
      }
    }
    for (let n = 0; n <= M; n++) {
      for (let j = 0; j <= T; j++) dist[n][j] /= runs;
      for (let t = 0; t < T; t++) item[t][n] /= runs;
    }
    return { dist, item, approx: true };
  }

  function randomKinds(kinds) {
    const LIMIT = 6000;
    const dist = chainKinds(kinds, LIMIT);
    if (!dist) return simulateKinds(kinds, 40000);
    const item = [];
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i].need <= 0) continue;
      const solo = kinds.map((k, j) => ({ rem: k.rem, need: j === i ? k.need : 0 }));
      const d = chainKinds(solo, LIMIT);
      if (!d) return simulateKinds(kinds, 40000);
      const arr = new Float64Array(d.length);
      for (let n = 0; n < d.length; n++) arr[n] = d[n][1];
      item.push(arr);
    }
    return { dist, item, approx: false };
  }

  /* Категория целиком: сначала срабатывают «выборы» (Сургуч), затем случайные выпадения.
     kinds: [{rem, need}], возвращает dist[d][j] и item[t][d] для d = 0..M выпадений из категории. */
  function withinCategory(kinds, wax, pickMode) {
    let M = 0;
    const tIdx = [];
    kinds.forEach((k, i) => { M += k.rem; if (k.need > 0) tIdx.push(i); });
    const T = tIdx.length;
    const cur = kinds.map(k => ({ rem: k.rem, need: k.need }));
    const order = tIdx.slice().sort((a, b) => kinds[a].need - kinds[b].need);
    const picks = [];
    for (const ki of order) for (let q = 0; q < kinds[ki].need; q++) if (picks.length < wax) picks.push(ki);
    const m = picks.length;
    const dist = [], item = [];
    for (let d = 0; d <= M; d++) dist.push(new Float64Array(T + 1));
    for (let t = 0; t < T; t++) item.push(new Float64Array(M + 1));
    const satisfied = new Uint8Array(kinds.length);
    let sat = 0;
    for (let d = 0; d <= m; d++) {
      dist[d][sat] = 1;
      tIdx.forEach((ki, t) => { item[t][d] = satisfied[ki] ? 1 : 0; });
      if (d < m) {
        const ki = picks[d];
        cur[ki].rem--; cur[ki].need--;
        if (cur[ki].need === 0) { satisfied[ki] = 1; sat++; }
      }
    }
    if (M > m) {
      const R = pickMode === 'copies' ? randomCopies(cur) : randomKinds(cur);
      const left = [];
      cur.forEach((k, i) => { if (k.need > 0) left.push(i); });
      for (let n = 1; n <= M - m; n++) {
        const d = m + n;
        for (let j = 0; j < R.dist[n].length; j++) dist[d][j + sat] = R.dist[n][j];
        tIdx.forEach((ki, t) => {
          const li = left.indexOf(ki);
          item[t][d] = satisfied[ki] ? 1 : R.item[li][n];
        });
      }
      return { dist, item, M, T, approx: R.approx };
    }
    return { dist, item, M, T, approx: false };
  }

  /* ---------- баннер без дубликатов ---------- */

  function categoryChances(base, alive, mode) {
    const C = base.length, out = new Float64Array(C);
    let aliveN = 0, deadSum = 0, aliveSum = 0;
    for (let c = 0; c < C; c++) { if (alive[c]) { aliveN++; aliveSum += base[c]; } else deadSum += base[c]; }
    if (!aliveN) return out;
    for (let c = 0; c < C; c++) {
      if (!alive[c]) continue;
      if (mode === 'proportional') out[c] = aliveSum > 0 ? base[c] / aliveSum : 1 / aliveN;
      else out[c] = base[c] + deadSum / aliveN;
    }
    return out;
  }

  /* opts.wax – сколько Сургучей есть; действует на первую категорию с отметкой wax.
     У предмета: got – выбито крутками (двигает цену), bought – получено вне баннера (цену не двигает). */
  function bannerCalc(b, opts) {
    opts = opts || {};
    const warnings = [];
    const pick = b.pick === 'copies' ? 'copies' : 'kinds';
    const mode = b.redistribution === 'proportional' ? 'proportional' : 'equal';
    const waxCount = clampInt(opts.wax, 0, 100000);
    let legCat = -1;
    (b.categories || []).forEach((c, i) => { if (c.leg && legCat < 0) legCat = i; });
    if (legCat < 0 && (b.categories || []).length) legCat = 0;
    const waxCat = (legCat >= 0 && b.categories[legCat].wax) ? legCat : -1;
    let waxNeed = 0;
    let done = 0, chanceSum = 0, totalCopies = 0;
    const targets = [];
    const cats = (b.categories || []).map((c, ci) => {
      const kinds = [];
      (c.items || []).forEach((it, ii) => {
        const copies = clampInt(it.copies, 0, 1000);
        const got = clampInt(it.got, 0, copies);
        const rem = copies - got - clampInt(it.bought, 0, copies - got);
        const need = clampInt(it.want, 0, rem);
        done += got; totalCopies += copies;
        if (rem > 0) {
          if (need > 0) { targets.push({ ci, ii, need }); if (ci === waxCat) waxNeed += need; }
          kinds.push({ rem, need });
        }
      });
      const chance = Math.max(0, num(c.chance));
      chanceSum += chance;
      let N = 0;
      for (const k of kinds) N += k.rem;
      return { chance, kinds, N };
    });
    const C = cats.length;
    const base = cats.map(c => chanceSum > 0 ? c.chance / chanceSum : 1 / Math.max(1, C));
    if (C && Math.abs(chanceSum - 100) > 1e-6) warnings.push('chanceSum');
    let K = 0, S = 1;
    for (const c of cats) { K += c.N; S *= (c.N + 1); }
    if (S > 4e6) throw new Error('Слишком много предметов для точного расчёта. Уменьшите количество копий или объедините категории.');
    let approx = false;
    const W = cats.map((c, ci) => {
      if (c.N > 1000) throw new Error('В одной категории может быть не больше 1000 экземпляров.');
      const w = withinCategory(c.kinds, ci === waxCat ? waxCount : 0, pick);
      if (w.approx) approx = true;
      return w;
    });
    const T = targets.length;
    const tCats = [];
    for (let c = 0; c < C; c++) if (W[c].T > 0) tCats.push(c);

    const stride = new Array(C);
    let s = 1;
    for (let c = 0; c < C; c++) { stride[c] = s; s *= (cats[c].N + 1); }
    const F = new Float64Array(S);
    F[0] = 1;
    const d = new Int32Array(C);
    const dist = [], marg = [];
    for (let k = 0; k <= K; k++) dist.push(new Float64Array(T + 1));
    for (let c = 0; c < C; c++) {
      const m = [];
      for (let k = 0; k <= K; k++) m.push(new Float64Array(cats[c].N + 1));
      marg.push(m);
    }
    const alive = new Uint8Array(C);
    let conv = new Float64Array(T + 1), tmp = new Float64Array(T + 1);
    for (let idx = 0; idx < S; idx++) {
      const f = F[idx];
      if (f > 0) {
        let k = 0;
        for (let c = 0; c < C; c++) { k += d[c]; alive[c] = d[c] < cats[c].N ? 1 : 0; }
        for (let c = 0; c < C; c++) marg[c][k][d[c]] += f;
        // распределение числа полученных целей: свёртка по категориям
        conv.fill(0); conv[0] = 1;
        let width = 0;
        for (const c of tCats) {
          const row = W[c].dist[d[c]], tc = W[c].T;
          tmp.fill(0);
          for (let a = 0; a <= width; a++) {
            const va = conv[a];
            if (va === 0) continue;
            for (let j = 0; j <= tc; j++) if (row[j] !== 0) tmp[a + j] += va * row[j];
          }
          width += tc;
          const sw = conv; conv = tmp; tmp = sw;
        }
        const dk = dist[k];
        for (let j = 0; j <= T; j++) dk[j] += f * conv[j];
        if (k < K) {
          const p = categoryChances(base, alive, mode);
          for (let c = 0; c < C; c++) if (p[c] > 0) F[idx + stride[c]] += f * p[c];
        }
      }
      for (let c = 0; c < C; c++) { if (d[c] < cats[c].N) { d[c]++; break; } d[c] = 0; }
    }

    const pAll = new Float64Array(K + 1), pAny = new Float64Array(K + 1);
    for (let k = 0; k <= K; k++) {
      pAll[k] = T > 0 ? Math.min(1, dist[k][T]) : 0;
      pAny[k] = T > 0 ? Math.min(1, Math.max(0, 1 - dist[k][0])) : 0;
    }
    const expDraws = cats.map((c, ci) => {
      const arr = new Float64Array(K + 1);
      for (let k = 0; k <= K; k++) { let e = 0; for (let x = 0; x <= c.N; x++) e += marg[ci][k][x] * x; arr[k] = e; }
      return arr;
    });
    const counter = new Array(C).fill(0);
    const itemP = targets.map(t => {
      const wi = counter[t.ci]++;
      const arr = new Float64Array(K + 1);
      const src = W[t.ci].item[wi], mg = marg[t.ci];
      for (let k = 0; k <= K; k++) { let e = 0; for (let x = 0; x <= cats[t.ci].N; x++) e += mg[k][x] * src[x]; arr[k] = Math.min(1, e); }
      return { ci: t.ci, ii: t.ii, need: t.need, p: arr };
    });
    const costs = cumCosts(b.costs, done, K);
    let expSpins = null, expAttempts = null;
    if (T > 0) {
      expSpins = 0; expAttempts = 0;
      for (let k = 0; k < K; k++) { const q = 1 - pAll[k]; expSpins += q * costs.each[k + 1]; expAttempts += q; }
    }
    const firstAt = (thr) => { for (let k = 0; k <= K; k++) if (pAll[k] >= thr) return k; return null; };
    return {
      K, done, total: totalCopies, T, C, dist, pAll, pAny, itemP, legCat, waxOn: waxCat >= 0, waxNeed, waxUsed: Math.min(waxCount, waxNeed), expDraws, costCum: costs.cum, costEach: costs.each,
      expSpins, expAttempts, approx, warnings, chanceSum,
      nextChance: categoryChances(base, cats.map(c => c.N > 0 ? 1 : 0), mode),
      q50: T ? firstAt(0.5) : null, q90: T ? firstAt(0.9) : null, q100: T ? firstAt(1 - 1e-9) : null,
      sizes: cats.map(c => c.N)
    };
  }

  /* ---------- гача с фиксированным шансом (дубликаты возможны) ---------- */

  function fixedCalc(fx, nSel) {
    const warnings = [];
    const items = (fx.items || []).map((it, i) => ({ i, p: Math.max(0, num(it.chance)) / 100, need: clampInt(it.want, 0, 50) }));
    let sum = 0;
    for (const it of items) sum += it.p;
    if (sum > 1 + 1e-9) { warnings.push('chanceOver'); for (const it of items) it.p /= sum; }
    const tg = items.filter(it => it.need > 0 && it.p > 0);
    const dead = items.filter(it => it.need > 0 && it.p <= 0).length;
    const T = tg.length + dead;
    nSel = clampInt(nSel, 0, 1e7);
    if (tg.length === 0 || dead > 0) {
      // целей нет либо среди целей есть предмет с нулевым шансом
      return { T, nSel, nMax: nSel, pAll: null, pAny: null, distSel: null, itemSel: [], exp: null, q50: null, q90: null, q99: null, warnings, impossible: dead > 0 };
    }
    let S = 1;
    const stride = [];
    for (const t of tg) { stride.push(S); S *= (t.need + 1); }
    if (S > 200000) throw new Error('Слишком много целей для точного расчёта. Уменьшите число выбранных предметов или требуемое количество.');
    const digits = new Uint8Array(S * tg.length), satCnt = new Uint8Array(S);
    for (let idx = 0; idx < S; idx++) {
      let r = idx, sc = 0;
      for (let t = 0; t < tg.length; t++) { const dg = r % (tg[t].need + 1); r = (r - dg) / (tg[t].need + 1); digits[idx * tg.length + t] = dg; if (dg === tg[t].need) sc++; }
      satCnt[idx] = sc;
    }
    const zeroSat = [];
    for (let idx = 0; idx < S; idx++) if (satCnt[idx] === 0) zeroSat.push(idx);
    const maxSteps = Math.max(1, Math.min(2000000, Math.floor(1.2e8 / (S * (tg.length + 1)))));
    if (nSel > maxSteps) throw new Error('Слишком много попыток для такого набора целей. Максимум для этого набора: ' + maxSteps + '.');
    const V = new Float64Array(S);
    V[0] = 1;
    const pAll = [0], pAny = [0];
    let distSel = null, tailSum = 1, converged = false;
    const snap = () => { const row = new Float64Array(tg.length + 1); for (let idx = 0; idx < S; idx++) row[satCnt[idx]] += V[idx]; return row; };
    if (nSel === 0) distSel = snap();
    const TL = tg.length;
    let n = 0;
    while (n < maxSteps) {
      n++;
      for (let idx = S - 1; idx >= 0; idx--) {
        const v = V[idx];
        if (v === 0) continue;
        let stay = 1;
        const base = idx * TL;
        for (let t = 0; t < TL; t++) {
          if (digits[base + t] < tg[t].need) { V[idx + stride[t]] += v * tg[t].p; stay -= tg[t].p; }
        }
        V[idx] = v * stay;
      }
      const all = Math.min(1, V[S - 1]);
      let none = 0;
      for (const z of zeroSat) none += V[z];
      pAll.push(all); pAny.push(Math.min(1, Math.max(0, 1 - none)));
      if (n === nSel) distSel = snap();
      tailSum += 1 - all;
      if (1 - all < 1e-12) { converged = true; if (n >= nSel) break; }
    }
    const nMax = pAll.length - 1;
    const itemSel = tg.map(t => {
      // P(Bin(nSel, p) >= need)
      let miss = 0;
      for (let x = 0; x < t.need && x <= nSel; x++) {
        miss += Math.exp(logC(nSel, x) + (x ? x * Math.log(t.p) : 0) + (nSel - x ? (nSel - x) * Math.log1p(-Math.min(t.p, 1 - 1e-16)) : 0));
      }
      return { i: t.i, need: t.need, p: Math.min(1, Math.max(0, 1 - miss)) };
    });
    let exp = null;
    if (tg.every(t => t.need === 1) && tg.length <= 18) {
      exp = 0;
      const lim = 1 << tg.length;
      for (let mask = 1; mask < lim; mask++) {
        let ps = 0, bits = 0;
        for (let t = 0; t < tg.length; t++) if (mask & (1 << t)) { ps += tg[t].p; bits++; }
        exp += (bits % 2 ? 1 : -1) / ps;
      }
    } else if (tg.length === 1) exp = tg[0].need / tg[0].p;
    else if (converged) exp = tailSum;
    const firstAt = (thr) => { for (let k = 0; k <= nMax; k++) if (pAll[k] >= thr) return k; return null; };
    return { T, nSel, nMax, pAll, pAny, distSel, itemSel, exp, q50: firstAt(0.5), q90: firstAt(0.9), q99: firstAt(0.99), warnings, impossible: false };
  }

  /* ---------- Flat-rate гача: фиксированный шанс + гарант, софт-гарант, обмен ----------
     У предмета: pity – входит в пул гаранта, exch – можно взять по обмену.
     fl.pity: { hardOn, hardN, softOn, softStart, softInc, count }, fl.exch: { on, every, count }.
     Счётчик гаранта – сколько круток подряд не выпадал предмет из пула; сбрасывается, когда такой предмет выпал. */
  function flatCalc(fl, nSel) {
    const warnings = [];
    const items = (fl.items || []).map((it, i) => ({ i, p: Math.max(0, num(it.chance)) / 100, need: clampInt(it.want, 0, 50), pity: !!it.pity, exch: !!it.exch }));
    let sum = 0;
    for (const it of items) sum += it.p;
    if (sum > 1 + 1e-9) { warnings.push('chanceOver'); for (const it of items) it.p /= sum; }
    const pt = fl.pity || {}, ex = fl.exch || {};
    const exOn = !!ex.on && clampInt(ex.every, 0, 1e6) >= 1, every = clampInt(ex.every, 1, 1e6), exPre = clampInt(ex.count, 0, 1e7);
    let Q = 0, pool = 0;
    for (const it of items) if (it.pity && it.p > 0) { Q += it.p; pool++; }
    Q = Math.min(1, Q);
    const hardN = clampInt(pt.hardN, 1, 5000), softStart = clampInt(pt.softStart, 1, 5000), softInc = Math.max(0, num(pt.softInc)) / 100;
    const hardOn = !!pt.hardOn && Q > 0 && Q < 1, softOn = !!pt.softOn && softInc > 0 && Q > 0 && Q < 1;
    const pityOn = hardOn || softOn;
    nSel = clampInt(nSel, 0, 1e7);
    const tg = items.filter((it) => it.need > 0);
    const T = tg.length;
    const dead = tg.some((it) => it.p <= 0 && !(exOn && it.exch));
    const base = { T, nSel, nMax: nSel, pAll: null, pAny: null, distSel: null, itemSel: [], exp: null, q50: null, q75: null, q90: null, q95: null, q99: null, q100: null, warnings, impossible: dead, pityOn, exOn, Q, pool };
    if (!T || dead) return base;

    // счётчик гаранта: 0..cMax
    let cMax = 0;
    if (pityOn) {
      let full = Infinity;
      if (softOn) full = softStart - 1 + Math.ceil((1 - Q) / softInc - 1e-9);
      if (hardOn) full = Math.min(full, hardN);
      cMax = Math.max(0, Math.min(5000, full) - 1);
    }
    const C = cMax + 1;
    const fP = new Float64Array(C).fill(1), fN = new Float64Array(C).fill(1), Qc = new Float64Array(C).fill(Q);
    if (pityOn) {
      for (let c = 0; c < C; c++) {
        const k = c + 1;
        let q = Q;
        if (softOn && k >= softStart) q = Math.min(1, Q + softInc * (k - softStart + 1));
        if (hardOn && k >= hardN) q = 1;
        if (q >= 1 - 1e-12) q = 1;
        Qc[c] = q; fP[c] = q / Q; fN[c] = q >= 1 ? 0 : (1 - q) / (1 - Q);
      }
    }
    let S = 1;
    const stride = [];
    for (const t of tg) { stride.push(S); S *= (t.need + 1); }
    if (S * C > 600000) throw new Error('Слишком много целей для точного расчёта. Уменьшите число выбранных предметов или требуемое количество.');
    const TL = T, digits = new Uint8Array(S * TL);
    const sumEx = new Int32Array(S), minEx = new Int32Array(S), nonExOk = new Uint8Array(S), anyZero = new Uint8Array(S);
    for (let idx = 0; idx < S; idx++) {
      let r = idx, se = 0, me = 1e9, ok = 1, az = 0;
      for (let t = 0; t < TL; t++) {
        const dg = r % (tg[t].need + 1); r = (r - dg) / (tg[t].need + 1); digits[idx * TL + t] = dg;
        const d = tg[t].need - dg;
        if (d === 0) az = 1;
        if (tg[t].exch) { se += d; if (d < me) me = d; } else if (d > 0) ok = 0;
      }
      sumEx[idx] = se; minEx[idx] = me; nonExOk[idx] = ok; anyZero[idx] = az;
    }
    // масса «ничего нужного не выпало», отдельно для пула гаранта и для остальных; считается суммой, чтобы нули были точными
    const tOf = new Int32Array(items.length).fill(-1);
    tg.forEach((t, k) => { tOf[t.i] = k; });
    const poolRest = new Float64Array(S), nonRest = new Float64Array(S), other = Math.max(0, 1 - Math.min(1, sum));
    for (let idx = 0; idx < S; idx++) {
      let pr = 0, nr = other;
      for (const it of items) {
        const k = tOf[it.i];
        if (k >= 0 && digits[idx * TL + k] < tg[k].need) continue;
        if (pityOn && it.pity) pr += it.p; else nr += it.p;
      }
      poolRest[idx] = pr; nonRest[idx] = nr;
    }
    const picks = (n) => (exOn ? Math.floor((exPre + n) / every) : 0);
    const maxSteps = Math.max(1, Math.min(2000000, Math.floor(1.2e8 / (S * C * (TL + 2)))));
    if (nSel > maxSteps) throw new Error('Слишком много круток для такого набора целей. Максимум для этого набора: ' + maxSteps + '.');
    // до какой крутки искать гарантию, если она вообще возможна
    let guarBound = 0, needAll = 0;
    for (const t of tg) needAll += t.need;
    if (exOn && tg.every((t) => t.exch)) guarBound = Math.max(0, every * needAll - exPre);
    else if (hardOn && pool === 1 && TL === 1 && tg[0].pity) guarBound = hardN * tg[0].need;
    guarBound = Math.min(guarBound, maxSteps);

    let V = new Float64Array(S * C), V2 = new Float64Array(S * C);
    V[Math.min(clampInt(pt.count, 0, 1e6), cMax)] = 1;
    const mass = new Float64Array(S);
    const pAll = [], pAny = [];
    let distSel = null, itemSel = null, tailSum = 0, converged = false, q100 = null;
    function measure(n) {
      const e = picks(n);
      let all = 0, unsat = 0, none = 0;
      for (let idx = 0; idx < S; idx++) {
        let m = 0;
        const b = idx * C;
        for (let c = 0; c < C; c++) m += V[b + c];
        mass[idx] = m;
        if (nonExOk[idx] && sumEx[idx] <= e) all += m; else unsat += m;
        if (!(anyZero[idx] || (e > 0 && minEx[idx] <= e))) none += m;
      }
      pAll.push(unsat === 0 ? 1 : Math.min(1, all)); pAny.push(none === 0 ? 1 : Math.min(1, Math.max(0, 1 - none)));
      if (q100 == null && unsat === 0) q100 = n;
      if (n === nSel) {
        distSel = new Float64Array(TL + 1);
        itemSel = tg.map((t) => ({ i: t.i, need: t.need, p: 0 }));
        const ds = [];
        for (let idx = 0; idx < S; idx++) {
          const m = mass[idx];
          if (m === 0) continue;
          let cnt = 0; ds.length = 0;
          for (let t = 0; t < TL; t++) {
            const d = tg[t].need - digits[idx * TL + t];
            if (d === 0) cnt++; else if (tg[t].exch) ds.push(d);
            if (d <= (tg[t].exch ? e : 0)) itemSel[t].p += m;
          }
          ds.sort((a, b) => a - b);
          let left = e;
          for (const d of ds) { if (d <= left) { left -= d; cnt++; } else break; }
          distSel[cnt] += m;
        }
        for (const it of itemSel) it.p = Math.min(1, it.p);
      }
      return unsat;
    }
    let unsat = measure(0), n = 0;
    tailSum = unsat;
    while (n < maxSteps) {
      if (n >= nSel && n >= guarBound && (unsat === 0 || unsat < 1e-12)) { converged = true; break; }
      n++;
      V2.fill(0);
      for (let idx = 0; idx < S; idx++) {
        const b = idx * C, db = idx * TL;
        for (let c = 0; c < C; c++) {
          const v = V[b + c];
          if (v === 0) continue;
          const nc = c < cMax ? c + 1 : (pityOn ? cMax : 0);
          const stayP = poolRest[idx] * fP[c], stayN = nonRest[idx] * fN[c];
          for (let t = 0; t < TL; t++) {
            if (digits[db + t] >= tg[t].need) continue;
            const isP = pityOn && tg[t].pity;
            const p = tg[t].p * (pityOn ? (isP ? fP[c] : fN[c]) : 1);
            if (p <= 0) continue;
            V2[(idx + stride[t]) * C + (isP ? 0 : nc)] += v * p;
          }
          if (stayP > 0) V2[b] += v * stayP;
          if (stayN > 0) V2[b + nc] += v * stayN;
        }
      }
      const sw = V; V = V2; V2 = sw;
      unsat = measure(n);
      tailSum += unsat;
    }
    const nMax = pAll.length - 1;
    let exp = null;
    if (!pityOn && !exOn && tg.every((t) => t.need === 1) && TL <= 18) {
      exp = 0;
      for (let mask = 1; mask < (1 << TL); mask++) {
        let ps = 0, bits = 0;
        for (let t = 0; t < TL; t++) if (mask & (1 << t)) { ps += tg[t].p; bits++; }
        exp += (bits % 2 ? 1 : -1) / ps;
      }
    } else if (!pityOn && !exOn && TL === 1) exp = tg[0].need / tg[0].p;
    else if (converged) exp = tailSum;
    const firstAt = (thr) => { for (let k = 0; k <= nMax; k++) if (pAll[k] >= thr) return k; return null; };
    return Object.assign(base, { nMax, pAll, pAny, distSel, itemSel, exp, q50: firstAt(0.5), q75: firstAt(0.75), q90: firstAt(0.9), q95: firstAt(0.95), q99: firstAt(0.99), q100, C });
  }

  /* ---------- время ---------- */

  /* Сколько раз ежедневное обновление (в hh:mm по часам компьютера) попадает в интервал (t0, t1]. */
  function resetsBetween(t0, t1, hhmm) {
    if (!(t1 > t0)) return 0;
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    const h = m ? Math.min(23, +m[1]) : 0, mi = m ? Math.min(59, +m[2]) : 0;
    const d = new Date(t0);
    d.setHours(h, mi, 0, 0);
    if (d.getTime() <= t0) d.setDate(d.getDate() + 1);
    let n = 0;
    while (d.getTime() <= t1 && n < 4000) { n++; d.setDate(d.getDate() + 1); }
    return n;
  }

  /* Обновление по умолчанию привязано к московскому времени (GMT+3) и не зависит от часового пояса компьютера:
     дейлики – 00:00 GMT+3 (21:00 UTC), пропуск поддержки – 03:00 GMT+3 (00:00 UTC).
     spec 'hh:mm' – время, заданное вручную по часам компьютера; пустая строка – авто. */
  const DAILY_UTC = 21 * 60, PASS_UTC = 0;
  function resetCount(t0, t1, spec, utcMin) {
    if (/^\d{1,2}:\d{2}$/.test(String(spec || ''))) return resetsBetween(t0, t1, spec);
    if (!(t1 > t0)) return 0;
    const off = utcMin * 60000, day = 86400000;
    return Math.floor((t1 - off) / day) - Math.floor((t0 - off) / day);
  }
  /* Авто-время в часах компьютера на момент ts, строкой hh:mm. */
  function autoLocal(utcMin, ts) {
    const d = new Date(ts || Date.now());
    d.setUTCHours(Math.floor(utcMin / 60), utcMin % 60, 0, 0);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ---------- экономика ---------- */

  const CUR = ['letters', 'coins', 'fragments', 'shards'];
  const max0 = (v) => Math.max(0, num(v));
  function gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }

  /* Сколько каждой валюты стоит одна единица цены крутки. Infinity – валюта не принимается. */
  function effPrices(pay, rates) {
    const e = { letters: Infinity, coins: Infinity, fragments: Infinity, shards: Infinity };
    const r = { coins: Math.max(1e-9, num(rates && rates.coins, 100)), fragments: Math.max(1e-9, num(rates && rates.fragments, 80)), shards: Math.max(1e-9, num(rates && rates.shards, 120)) };
    const u = pay && pay.unit || 'letters';
    if (u === 'letters') { e.letters = 1; e.coins = r.coins; e.fragments = r.fragments; e.shards = r.shards; }
    else if (u === 'coins' || u === 'fragments' || u === 'shards') e[u] = 1;
    else {
      const k = (pay && pay.key) || {};
      for (const c of CUR) if (k[c] && k[c].on && num(k[c].price) > 0) e[c] = num(k[c].price);
      // если ключ продаётся за письма, остальные валюты можно сначала обменять на письма
      if (isFinite(e.letters)) for (const c of ['coins', 'fragments', 'shards']) e[c] = Math.min(e[c], e.letters * r[c]);
    }
    return e;
  }

  /* Запас в единицах цены. o.stock: 'none' | 'now' | 'end' (с начислениями до o.end). */
  function stockOf(S, pay, o) {
    o = o || {};
    const eff = effPrices(pay, S.rates), inc = S.income || {}, w = S.wallet || {};
    const am = { letters: 0, coins: 0, fragments: 0, shards: 0 };
    if (o.stock === 'now' || o.stock === 'end') for (const c of CUR) am[c] = max0(w[c]);
    const resets = (o.end > o.now) ? resetCount(o.now, o.end, inc.resetTime, DAILY_UTC) : 0;
    const resetsP = (o.end > o.now) ? resetCount(o.now, o.end, inc.subResetTime, PASS_UTC) : 0;
    const subAct = Math.min(clampInt(inc.subDaysLeft, 0, 100000), resetsP);
    let addDaily = 0, addSub = 0;
    if (o.stock === 'end') {
      if (inc.dailiesOn) addDaily = max0(inc.dailyFragments) * resets;
      if (inc.subOn) addSub = max0(S.sub && S.sub.fragPerDay) * subAct;
      am.fragments += addDaily + addSub;
    }
    const parts = {};
    let units = 0;
    for (const c of CUR) { parts[c] = isFinite(eff[c]) ? Math.floor(am[c] / eff[c] + 1e-9) : null; if (parts[c]) units += parts[c]; }
    return { eff, am, units, parts, resets, resetsP, subAct, addDaily, addSub, horizon: o.stock === 'end' ? resetsP : 0 };
  }

  /* Все предложения магазина как наборы валют. */
  function shopOffers(S) {
    const offers = [];
    (S.packs || []).forEach((p, i) => {
      const coins = max0(p.coins), price = max0(p.price);
      const r = coins + max0(p.bonus), f = coins + max0(p.firstBonus);
      if (p.firstAvail && f > 0) offers.push({ kind: 'first', idx: i, price, am: { coins: f }, limit: 1 });
      if (r > 0) offers.push({ kind: 'pack', idx: i, price, am: { coins: r }, limit: Infinity });
    });
    (S.bundles || []).forEach((b, i) => {
      if (!b || !b.on) return;
      const lim = clampInt(b.limit, 0, 99);
      offers.push({ kind: 'bundle', idx: i, price: max0(b.price), limit: lim > 0 ? lim : Infinity,
        am: { letters: max0(b.letters), coins: max0(b.coins), fragments: max0(b.fragments), shards: max0(b.shards), wax: max0(b.wax) } });
    });
    return offers;
  }

  /* Экономика для одного способа оплаты: запас и подбор самой дешёвой покупки.
     o: { stock, now, end, maxUnits } */
  function makeEconomy(S, pay, o) {
    o = o || {};
    const st = stockOf(S, pay, o), eff = st.eff;
    const fin = CUR.filter((c) => isFinite(eff[c]));
    const frac = (am) => { let s = 0; for (const c of fin) s += (am[c] || 0) / eff[c]; return s; };
    const unitsOf = (am) => { let s = 0; for (const c of fin) s += Math.floor((am[c] || 0) / eff[c] + 1e-9); return s; };
    const offers = shopOffers(S).filter((of) => { of.val = frac(of.am); return of.val > 0 && (of.limit !== Infinity || of.price > 0); });
    const sub = S.sub || {};
    const maxSubs = sub.allow ? clampInt(sub.max, 0, 20) : 0;
    const subPrice = max0(sub.price);
    const subAm = (s) => ({ coins: s * max0(sub.coins), fragments: max0(sub.fragPerDay) * Math.min(clampInt(sub.days, 0, 100000) * s, Math.max(0, st.horizon - st.subAct)) });

    const CAP = 2400000;
    const maxU = Math.max(1, Math.ceil(num(o.maxUnits))) + 6;
    const ints = fin.every((c) => Number.isInteger(eff[c]) && eff[c] >= 1);
    let L = 1;
    if (ints) for (const c of fin) { L = L / gcd(L, eff[c]) * eff[c]; if (L > 1e7) break; }
    const res = (ints && L * maxU <= CAP) ? L : Math.max(1, Math.min(1000, Math.floor(CAP / maxU)));
    const Vt = Math.min(CAP, maxU * res);
    let dp = null, ch = null, stages = null, unb = null;

    function build() {
      dp = new Float64Array(Vt + 1).fill(Infinity);
      dp[0] = 0;
      stages = []; unb = [];
      for (const of of offers) {
        const a1 = Math.floor(of.val * res + 1e-9);
        if (a1 <= 0) continue;
        if (of.limit === Infinity) { unb.push({ of, a: a1, price: of.price }); continue; }
        let left = of.limit, c = 1;
        while (left > 0) {               // двоичное разбиение ограниченного количества
          const m = Math.min(c, left); left -= m; c *= 2;
          const a = a1 * m, price = of.price * m, take = new Uint8Array(Vt + 1);
          for (let v = Vt; v >= 1; v--) {
            const cand = dp[v > a ? v - a : 0] + price;
            if (cand < dp[v] - 1e-9) { dp[v] = cand; take[v] = 1; }
          }
          stages.push({ of, m, a, take });
        }
      }
      ch = new Int16Array(Vt + 1).fill(-1);
      for (let v = 1; v <= Vt; v++) {
        for (let r = 0; r < unb.length; r++) {
          const cand = dp[v > unb[r].a ? v - unb[r].a : 0] + unb[r].price;
          if (cand < dp[v] - 1e-9) { dp[v] = cand; ch[v] = r; }
        }
      }
    }
    function reconstruct(v) {
      const cnt = new Map();
      const add = (of, m) => cnt.set(of, (cnt.get(of) || 0) + m);
      while (v > 0 && ch[v] >= 0) { const u = unb[ch[v]]; add(u.of, 1); v = v > u.a ? v - u.a : 0; }
      for (let i = stages.length - 1; i >= 0; i--) {
        const sg = stages[i];
        if (sg.take[v]) { add(sg.of, sg.m); v = v > sg.a ? v - sg.a : 0; }
      }
      const am = { letters: 0, coins: 0, fragments: 0, shards: 0, wax: 0 }, buys = [];
      for (const [of, m] of cnt) {
        for (const c in of.am) am[c] += of.am[c] * m;
        buys.push({ kind: of.kind, idx: of.idx, count: m, price: of.price, am: of.am });
      }
      return { am, buys };
    }
    const sumAm = (a, b) => { const r = { letters: 0, coins: 0, fragments: 0, shards: 0, wax: 0 }; for (const c in r) r[c] = (a[c] || 0) + (b[c] || 0); return r; };

    /* Самая дешёвая покупка, после которой единиц не меньше target. null – купить нечем. */
    function cost(target) {
      target = num(target);
      if (st.units >= target - 1e-9) return { price: 0, subs: 0, buys: [], units: st.units, gain: sumAm({}, {}) };
      if (!dp) build();
      let best = null;
      for (let s = 0; s <= maxSubs; s++) {
        const sp = s * subPrice;
        if (best && sp >= best.price - 1e-9) break;
        const sa = subAm(s), base = sumAm(st.am, sa);
        if (unitsOf(base) >= target - 1e-9) { best = { price: sp, subs: s, buys: [], units: unitsOf(base), gain: sumAm(sa, {}) }; break; }
        let v = Math.max(0, Math.ceil((target - frac(base)) * res - 1e-7));
        for (let it = 0; it < 200; it++) {
          if (v > Vt || dp[v] === Infinity) break;
          const pr = dp[v];
          if (best && sp + pr >= best.price - 1e-9) break;
          let e = v;
          while (e < Vt && dp[e + 1] <= pr + 1e-9) e++;
          const plan = reconstruct(e), tot = sumAm(base, plan.am);
          if (unitsOf(tot) >= target - 1e-9) { best = { price: sp + pr, subs: s, buys: plan.buys, units: unitsOf(tot), gain: sumAm(sa, plan.am) }; break; }
          v = e + 1;
        }
      }
      if (best) best.buys.sort((a, b) => (a.kind === b.kind ? b.price - a.price : (a.kind < b.kind ? -1 : 1)));
      return best;
    }
    /* Максимум единиц на сумму в рублях. */
    function maxFor(budget) {
      budget = max0(budget);
      let lo = st.units, hi = Math.max(lo, Math.floor(num(o.maxUnits)));
      const okAt = (t) => { const c = cost(t); return c && c.price <= budget + 1e-9 ? c : null; };
      let best = okAt(lo);
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2), c = okAt(mid);
        if (c) { lo = mid; best = c; } else hi = mid - 1;
      }
      for (let i = 0; i < 4; i++) { const c = okAt(best.units + 1); if (c) best = c; else break; }
      return best;
    }
    return { own: st, eff, cost, maxFor, unitsOf };
  }

  /* Верхняя оценка: сколько единиц можно получить на сумму budget (для размера таблиц). */
  function ecoBound(S, pay, o, budget) {
    const st = stockOf(S, pay, o || {}), eff = st.eff;
    const fin = CUR.filter((c) => isFinite(eff[c]));
    const frac = (am) => { let s = 0; for (const c of fin) s += (am[c] || 0) / eff[c]; return s; };
    budget = max0(budget);
    let total = frac(st.am), rate = 0;
    for (const of of shopOffers(S)) {
      const v = frac(of.am);
      if (v <= 0) continue;
      if (of.limit === Infinity) { if (of.price > 0) rate = Math.max(rate, v / of.price); }
      else if (of.price <= budget) total += v * of.limit;
    }
    const sub = S.sub || {};
    if (sub.allow && max0(sub.price) <= budget) total += clampInt(sub.max, 0, 20) * frac({ coins: max0(sub.coins), fragments: max0(sub.fragPerDay) * clampInt(sub.days, 0, 100000) });
    return Math.ceil(total + budget * rate) + 3;
  }

  /* Цены для выбранного сервера: на Global берутся цены в евро (priceEu). */
  function forServer(S, global) {
    if (!global) return S;
    const m = (x) => Object.assign({}, x, { price: Math.max(0, num(x && x.priceEu)) });
    return Object.assign({}, S, { packs: (S.packs || []).map(m), bundles: (S.bundles || []).map(m), sub: m(S.sub || {}) });
  }

  /* ---------- значения по умолчанию ---------- */

  let uidN = 0;
  const newId = () => 'i' + Date.now().toString(36) + (uidN++).toString(36);
  const item = (o) => Object.assign({ id: newId(), name: '', copies: 1, got: 0, bought: 0, want: 0 }, o);
  const many = (n) => Array.from({ length: n }, () => item({}));
  const defPay = (unit) => ({ unit: unit || 'letters', key: { letters: { on: true, price: 1 }, coins: { on: false, price: 100 }, fragments: { on: false, price: 80 }, shards: { on: false, price: 120 } } });
  const bannerBase = (o) => Object.assign({ id: newId(), name: '', nk: '', tpl: '', end: 0, budgetMode: 'units', units: 30, pulls: 10, rubles: 1000, eur: 10, stock: 'now', goal: 'q100' }, o);

  const TEMPLATES = {
    /* событийный баннер: 2 / 38 / 60, 25 предметов, цена в письмах */
    event: () => bannerBase({
      nk: 'bn.event', tpl: 'event', pay: defPay('letters'),
      categories: [
        { id: newId(), name: '', nk: 'cat.leg', color: '#f5c451', chance: 2, open: true, leg: true, wax: true, items: many(4) },
        { id: newId(), name: '', nk: 'cat.epic', color: '#e77cf2', chance: 38, open: true, wax: false, items: many(4) },
        { id: newId(), name: '', nk: 'cat.rare', color: '#5fa5f5', chance: 60, open: false, wax: false, items: many(17) }
      ],
      costs: [{ count: 3, cost: 1 }, { count: 3, cost: 2 }, { count: 3, cost: 4 }, { count: 3, cost: 6 }, { count: 3, cost: 8 },
        { count: 3, cost: 10 }, { count: 3, cost: 12 }, { count: 3, cost: 14 }, { count: 1, cost: 16 }]
    }),
    /* «Первая соната»: постоянный баннер, 20 предметов, цена в Shinri монетах */
    sonata: () => bannerBase({
      nk: 'bn.sonata', tpl: 'sonata', pay: defPay('coins'), units: 1000,
      categories: [
        { id: newId(), name: '', nk: 'cat.leg', color: '#f5c451', chance: 2, open: true, leg: true, wax: true,
          items: [item({ nk: 'it.sonataPad' }), item({ nk: 'it.sonataSkin' })] },
        { id: newId(), name: '', nk: 'cat.epic', color: '#e77cf2', chance: 60, open: true, wax: false,
          items: [item({ nk: 'it.bread' }), item({ nk: 'it.shards30', copies: 5 }), item({ nk: 'it.frags50', copies: 6 })] },
        { id: newId(), name: '', nk: 'cat.rare', color: '#5fa5f5', chance: 38, open: true, wax: false,
          items: [item({ nk: 'it.exp150', copies: 6 })] }
      ],
      costs: [{ count: 4, cost: 100 }, { count: 4, cost: 200 }, { count: 4, cost: 300 }, { count: 4, cost: 500 }, { count: 4, cost: 700 }]
    }),
    /* пустая заготовка */
    blank: () => bannerBase({
      nk: 'bn.new', tpl: '', pay: defPay('letters'),
      categories: [
        { id: newId(), name: '', nk: 'cat.leg', color: '#f5c451', chance: 2, open: true, leg: true, wax: true, items: many(1) },
        { id: newId(), name: '', nk: 'cat.epic', color: '#e77cf2', chance: 38, open: true, wax: false, items: many(1) },
        { id: newId(), name: '', nk: 'cat.rare', color: '#5fa5f5', chance: 60, open: true, wax: false, items: many(1) }
      ],
      costs: [{ count: 1, cost: 1 }]
    })
  };

  /* Flat-rate баннеры */
  const fitem = (o) => Object.assign({ id: newId(), name: '', nk: '', chance: 1, want: 0, pity: false, exch: true }, o);
  const flatBase = (o) => Object.assign({ id: newId(), name: '', nk: '', tpl: '', items: [], costPerPull: 1, pay: defPay('letters'), end: 0,
    budgetMode: 'pulls', pulls: 50, units: 50, rubles: 1000, eur: 10, stock: 'now', goal: 'q90',
    pity: { hardOn: false, hardN: 90, softOn: false, softStart: 74, softInc: 6, count: 0 },
    exch: { on: false, every: 300, count: 0 } }, o);
  const STROKE = [['nice', 2.05], ['story', 2.05], ['tea', 3.2], ['n11037', 3.2], ['novels', 3.2], ['pixel', 3.2],
    ['blood1', 5.54], ['blood2', 5.54], ['blood3', 5.54], ['dzAdv', 5.54], ['dzDou', 5.54], ['dzMoral', 5.54],
    ['hBreeder', 5.54], ['hPrincess', 5.54], ['hRuby', 5.54], ['dIbuki', 5.54], ['dKirumi', 5.54], ['dMiu', 5.54], ['uAngie', 5.54], ['uAoi', 5.54], ['uSayaka', 5.54]];
  /* «Первый штрих»: одна крутка = 65 Фрагментов Надежды или 199 Shinri монет */
  const strokePay = () => ({ unit: 'keys', key: { letters: { on: false, price: 1 }, coins: { on: true, price: 199 }, fragments: { on: true, price: 65 }, shards: { on: false, price: 120 } } });
  const FLAT_TEMPLATES = {
    /* «Первый штрих»: 21 граффити, шансы из описания баннера */
    stroke: () => flatBase({ nk: 'fl.stroke', tpl: 'stroke', pay: strokePay(), costPerPull: 1, items: STROKE.map((x) => fitem({ nk: 'gr.' + x[0], chance: x[1] })) }),
    blank: () => flatBase({ nk: 'bn.new', items: [fitem({ chance: 2, want: 1 }), fitem({ chance: 10 })] })
  };
  /* Цены: Ru – рубли, Global – евро. [монет, обычный бонус, цена ₽, цена €] */
  const DEF_PACKS = [[200, 0, 99, 0.99], [900, 90, 449, 4.99], [2780, 310, 1390, 14.99], [5580, 730, 2790, 29.99], [9380, 1700, 4690, 49.99], [17980, 4300, 8990, 99.99]];
  /* Наборы из магазина по умолчанию: [ключ названия, писем, Сургучей, цена ₽, цена €]. Лимит 1: после покупки набор пропадает. */
  const DEF_BUNDLES = [['bd.firstStep', 2, 0, 89, 0.89], ['bd.impulse', 5, 0, 210, 2.1], ['bd.verdict', 10, 0, 425, 4.25], ['bd.dynasty', 10, 0, 375, 3.75], ['bd.seals', 0, 3, 1490, 15.99], ['bd.noReturn', 100, 0, 3499, 34.99]];
  const defBundle = (x) => ({ id: newId(), name: '', nk: x[0], on: true, price: x[3], priceEu: x[4], letters: x[1], coins: 0, fragments: 0, shards: 0, wax: x[2], limit: 1 });
  function defaultEconomy() {
    return {
      rates: { coins: 100, fragments: 80, shards: 120 },
      wallet: { letters: 0, coins: 0, fragments: 0, shards: 0, wax: 0 },
      income: { dailiesOn: true, dailyFragments: 60, subOn: true, subDaysLeft: 0, resetTime: '', subResetTime: '', lastSync: 0 },
      sub: { price: 450, priceEu: 4.99, coins: 900, fragPerDay: 90, days: 30, allow: true, max: 1 },
      packs: DEF_PACKS.map((p) => ({ id: newId(), coins: p[0], bonus: p[1], firstBonus: p[0], price: p[2], priceEu: p[3], firstAvail: true })),
      bundles: DEF_BUNDLES.map(defBundle)
    };
  }
  function defaults() {
    const ev = TEMPLATES.event(), st = FLAT_TEMPLATES.stroke();
    return Object.assign({
      version: 4, lang: '', page: 'box',
      ui: { tipsOpen: false, tip: 0 },
      banners: [ev, TEMPLATES.sonata()], activeBanner: ev.id,
      flats: [st], activeFlat: st.id,
      sandbox: { letters: 50, rubles: 1000, eur: 10, stock: 'now' }
    }, defaultEconomy());
  }

  /* Перенос настроек версии 2.0: фикс. шанс становится первым Flat-rate баннером. */
  function migrate2(o) {
    if (!o || typeof o !== 'object' || o.version >= 3) return o;
    if (o.fixed && typeof o.fixed === 'object') {
      const f = o.fixed;
      const fb = flatBase({ nk: 'fl.mine', items: (Array.isArray(f.items) ? f.items : []).map((it) => fitem({ id: it.id || newId(), name: it.name || '', chance: it.chance, want: it.want })) });
      for (const k of ['costPerPull', 'pay', 'end', 'budgetMode', 'pulls', 'units', 'rubles', 'stock', 'goal']) if (f[k] != null) fb[k] = f[k];
      o.flats = [fb, FLAT_TEMPLATES.stroke()]; o.activeFlat = fb.id;
      delete o.fixed;
    }
    if (o.page === 'fixed') o.page = 'flat';
    for (const b of (Array.isArray(o.banners) ? o.banners : [])) {
      const cs = Array.isArray(b && b.categories) ? b.categories : [];
      if (!cs.some((c) => c && c.leg)) {
        const lg = cs.find((c) => c && c.nk === 'cat.leg') || cs.find((c) => c && c.wax) || cs[0];
        if (lg) lg.leg = true;
      }
      for (const c of cs) if (c && !c.leg) c.wax = false;
      // исправление шансов «Первой сонаты», если их не меняли: 2 / 60 / 38
      if (b && b.tpl === 'sonata') {
        const ep = cs.find((c) => c.nk === 'cat.epic'), ra = cs.find((c) => c.nk === 'cat.rare');
        if (ep && ra && ep.chance === 38 && ra.chance === 60) { ep.chance = 60; ra.chance = 38; }
      }
    }
    if (o.income && o.income.resetTime === '00:00') o.income.resetTime = '';
    o.version = 3;
    return o;
  }

  /* Перенос настроек версии 3.0: цены в евро для сервера Global, наборы по умолчанию, цена «Первого штриха». */
  function migrate3(o) {
    if (!o || typeof o !== 'object' || o.version >= 4) return o;
    const eu = (rub) => Math.round(Math.max(0, Number(rub) || 0)) / 100;
    for (const p of (Array.isArray(o.packs) ? o.packs : [])) {
      if (!p || p.priceEu != null) continue;
      const d = DEF_PACKS.find((x) => x[0] === Number(p.coins) && x[2] === Number(p.price));
      p.priceEu = d ? d[3] : eu(p.price);
    }
    if (o.sub && o.sub.priceEu == null) o.sub.priceEu = Number(o.sub.price) === 450 ? 4.99 : eu(o.sub.price);
    o.bundles = Array.isArray(o.bundles) ? o.bundles : [];
    for (const b of o.bundles) if (b && b.priceEu == null) b.priceEu = eu(b.price);
    for (const x of DEF_BUNDLES) if (!o.bundles.some((b) => b && b.nk === x[0])) o.bundles.push(defBundle(x));
    for (const f of (Array.isArray(o.flats) ? o.flats : [])) {
      if (f && f.tpl === 'stroke' && f.pay && f.pay.unit === 'letters' && Number(f.costPerPull) === 1) f.pay = strokePay();
    }
    o.version = 4;
    return o;
  }

  /* Перенос настроек первой версии программы. */
  function migrate(old, now) {
    if (!old || typeof old !== 'object') return old;
    if (old.version >= 2 || !old.banner) return migrate3(migrate2(old));
    const d = defaults(), ob = old.banner || {}, of = old.fixed || {};
    d.version = 2; d.fixed = { items: [], costPerPull: 1, budgetMode: 'pulls', pulls: 50, units: 50, rubles: 1000 };
    if (old.rates) d.rates = old.rates;
    if (old.sub) d.sub = Object.assign(d.sub, old.sub);
    if (Array.isArray(old.packs)) d.packs = old.packs;
    const w = old.wallet || {};
    d.wallet = { letters: max0(w.spins), coins: max0(w.coins), fragments: max0(w.fragments), shards: max0(w.shards), wax: max0(ob.wax && ob.wax.count) };
    const inc = old.income || {};
    d.income.dailiesOn = inc.dailiesOn !== false;
    if (inc.dailyFragments != null) d.income.dailyFragments = max0(inc.dailyFragments);
    d.income.subDaysLeft = max0(inc.subDaysLeft);
    const b = d.banners[0];
    if (Array.isArray(ob.categories)) {
      b.categories = ob.categories.map((c) => ({ id: c.id || newId(), name: c.name || '', nk: '', color: c.color, chance: c.chance, open: !!c.open,
        wax: !!(ob.wax && ob.wax.categoryId === c.id),
        items: (c.items || []).map((it) => item({ id: it.id || newId(), name: it.name || '', copies: it.copies, got: it.got, want: it.want })) }));
    }
    if (Array.isArray(ob.costs) && ob.costs.length) b.costs = ob.costs;
    b.budgetMode = ob.budgetMode === 'attempts' ? 'pulls' : ob.budgetMode === 'rubles' ? 'rubles' : 'units';
    if (ob.spins != null) b.units = max0(ob.spins);
    if (ob.attempts != null) b.pulls = max0(ob.attempts);
    if (ob.rubles != null) b.rubles = max0(ob.rubles);
    if (max0(inc.days) > 0) { b.end = (now || Date.now()) + max0(inc.days) * 86400000; b.stock = 'end'; }
    if (Array.isArray(of.items)) d.fixed.items = of.items.map((it) => ({ id: it.id || newId(), name: it.name || '', chance: it.chance, want: it.want }));
    if (of.costPerAttempt != null) d.fixed.costPerPull = max0(of.costPerAttempt);
    d.fixed.budgetMode = of.budgetMode === 'attempts' ? 'pulls' : of.budgetMode === 'rubles' ? 'rubles' : 'units';
    if (of.attempts != null) d.fixed.pulls = max0(of.attempts);
    if (of.spins != null) d.fixed.units = max0(of.spins);
    if (of.rubles != null) d.fixed.rubles = max0(of.rubles);
    if (old.tools) { d.sandbox.letters = max0(old.tools.spins); d.sandbox.rubles = max0(old.tools.rubles); }
    d.page = { banner: 'box', fixed: 'fixed', wallet: 'eco', settings: 'tech' }[old.page] || 'box';
    return migrate3(migrate2(d));
  }

  return { bannerCalc, fixedCalc, flatCalc, makeEconomy, ecoBound, forServer, stockOf, effPrices, shopOffers, resetsBetween, resetCount, autoLocal, DAILY_UTC, PASS_UTC,
    attemptsForSpins, attemptCost, normCosts, categoryChances, withinCategory,
    defaults, defaultEconomy, TEMPLATES, FLAT_TEMPLATES, flatBase, fitem, defPay, migrate, newId, clampInt, num, CUR };
});
