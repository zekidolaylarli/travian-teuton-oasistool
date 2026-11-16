// OPTİMAL HUN ORDUSU BULUCU (Modül B)
// Savaş hesabı yapmaz: her aday için battle.js → createScenario().evaluate() çağırır.
//
// Yöntem: sınırlar içinde EKSİKSİZ tarama (brute-force). Her aday filtrelerden geçirilir; geçenler
// "asker sayısı" kovalarında baskınlık (dominance) elemesiyle tutulur, sonunda küresel Pareto sınırı
// çıkarılır. Baskınlık elemesi yalnızca her ölçütte eşit-veya-daha-iyi bir aday varken eler; bu yüzden
// aşağıdaki bütün seçimler (en yüksek kâr, en az sermaye, en az asker…) taramanın tam sonucudur.
// Arama uzayı maxCombos'u aşarsa sınırlar orantılı küçültülür ve sonuç "sınırlı arama" diye işaretlenir.

import { createScenario } from '../engine/battle.js';

export const DEFAULT_PREFS = Object.freeze({
  maxLossRatio: 50,        // % — hayvan ödülüne göre asker kayıp maliyeti; null → filtre kapalı
  requireProfit: true,     // net kâr > 0 şartı
  profitThresholdPct: 90,  // dengeli öneri: maksimum net kârın en az bu yüzdesi
  minHeroHealth: 30,       // savaş sonrası asgari kahraman sağlığı (%)
  maxCombos: 6_000_000,
});

// Kovada tutulan aday: [c0,c1,c2, net, armyValue, lossCost, perHour, heroDmg, border, troops]
const NET = 3, AV = 4, LC = 5, PH = 6, HD = 7, BD = 8, TR = 9;

function dominates(a, b, withTroops) {
  if (a[NET] < b[NET] || a[AV] > b[AV] || a[LC] > b[LC] || a[PH] < b[PH] || a[HD] > b[HD] || a[BD] > b[BD]) return false;
  if (withTroops && a[TR] > b[TR]) return false;
  return true; // eşitse de baskın sayılır (kopyaları eler)
}

export function clampLimits(max, maxCombos) {
  const lim = max.map((v) => Math.max(0, Math.floor(v || 0)));
  const size = () => lim.reduce((p, v) => p * (v + 1), 1);
  let limited = false;
  while (size() > maxCombos) {
    limited = true;
    const f = Math.pow(maxCombos / size(), 1 / lim.filter((v) => v > 0).length);
    for (let i = 0; i < lim.length; i++) if (lim[i] > 0) lim[i] = Math.max(1, Math.floor((lim[i] + 1) * f) - 1);
  }
  return { lim, limited, size: size() };
}

/**
 * @param config  createScenario config'i (unitIds tam 3 birim olmalı)
 * @param max     her birimden kullanılabilir azami adet [a,b,c]
 * @param prefsIn DEFAULT_PREFS üzerine yazılır
 * @param onProgress (0..1) isteğe bağlı
 */
export function optimize(config, max, prefsIn = {}, onProgress) {
  const prefs = { ...DEFAULT_PREFS, ...prefsIn };
  if (config.unitIds.length !== 3) throw new Error('Optimizasyon tam üç birim türüyle çalışır.');
  const sc = createScenario(config);
  const { lim, limited, size } = clampLimits(max, prefs.maxCombos);
  const hasHero = sc.hasHero;
  const buckets = new Map();
  const rejectedBest = []; // filtreyi geçemeyenlerin en iyileri (net kâra göre)
  const stats = { evaluated: 0, feasible: 0, byLoss: 0, byProfit: 0, byHero: 0 };
  const counts = [0, 0, 0];
  const t0 = Date.now();
  const rejectReason = (r) => {
    if (hasHero && (r.heroDead || r.heroAfter < prefs.minHeroHealth)) return 'hero';
    if (prefs.maxLossRatio != null && r.lossCost > 0 &&
      !((r.lossRatio != null ? r.lossRatio : r.overallRatio != null ? r.overallRatio : Infinity) < prefs.maxLossRatio)) return 'loss';
    if (prefs.requireProfit && !(r.net > 0)) return 'profit';
    return null;
  };

  for (let a = 0; a <= lim[0]; a++) {
    counts[0] = a;
    for (let b = 0; b <= lim[1]; b++) {
      counts[1] = b;
      for (let c = 0; c <= lim[2]; c++) {
        counts[2] = c;
        const r = sc.evaluate(counts);
        if (!r.valid) continue;
        stats.evaluated++;
        const reason = rejectReason(r);
        if (reason) {
          stats[reason === 'hero' ? 'byHero' : reason === 'loss' ? 'byLoss' : 'byProfit']++;
          if (rejectedBest.length < 5 || r.net > rejectedBest[rejectedBest.length - 1].net) {
            rejectedBest.push({ counts: [a, b, c], net: r.net, reason });
            rejectedBest.sort((x, y) => y.net - x.net || x.counts[0] + x.counts[1] + x.counts[2] - (y.counts[0] + y.counts[1] + y.counts[2]));
            if (rejectedBest.length > 5) rejectedBest.pop();
          }
          continue;
        }
        stats.feasible++;
        const cand = [a, b, c, r.net, r.armyValue, r.lossCost, r.perHour == null ? 0 : r.perHour, r.heroDamage, r.borderline ? 1 : 0, r.troops];
        let bucket = buckets.get(r.troops);
        if (!bucket) { buckets.set(r.troops, [cand]); continue; }
        let dominated = false;
        for (let i = 0; i < bucket.length; i++) if (dominates(bucket[i], cand, false)) { dominated = true; break; }
        if (dominated) continue;
        let w = 0;
        for (let i = 0; i < bucket.length; i++) if (!dominates(cand, bucket[i], false)) bucket[w++] = bucket[i];
        bucket.length = w; bucket.push(cand);
      }
    }
    if (onProgress && (a & 3) === 0) onProgress((a + 1) / (lim[0] + 1));
  }

  // Küresel Pareto sınırı (asker sayısı da ölçüt)
  const all = [];
  for (const bkt of buckets.values()) for (const c of bkt) all.push(c);
  const pareto = all.filter((c) => !all.some((o) => o !== c && dominates(o, c, true) && !dominates(c, o, true)));
  pareto.sort((x, y) => y[NET] - x[NET] || x[AV] - y[AV]);

  const pick = (list, cmp) => (list.length ? list.slice().sort(cmp)[0] : null);
  const byAV = (x, y) => x[AV] - y[AV] || y[NET] - x[NET] || x[TR] - y[TR];
  const maxProfitC = pick(all, (x, y) => y[NET] - x[NET] || x[AV] - y[AV] || x[TR] - y[TR]);
  const picks = {};
  let threshold = null;
  if (maxProfitC) {
    const maxNet = maxProfitC[NET];
    threshold = maxNet * (prefs.profitThresholdPct / 100);
    const good = all.filter((c) => c[NET] >= threshold - 1e-9);
    picks.maxProfit = maxProfitC;
    picks.balanced = pick(good, byAV);
    picks.minTroops = pick(good, (x, y) => x[TR] - y[TR] || y[NET] - x[NET] || x[AV] - y[AV]);
    const zero = all.filter((c) => c[LC] === 0);
    if (zero.length) {
      const zMax = Math.max(...zero.map((c) => c[NET]));
      picks.zeroLoss = pick(zero.filter((c) => c[NET] >= zMax * (prefs.profitThresholdPct / 100) - 1e-9), byAV);
    }
    const withArmy = all.filter((c) => c[AV] > 0);
    picks.maxEfficiency = pick(withArmy, (x, y) => y[NET] / y[AV] - x[NET] / x[AV] || y[NET] - x[NET]);
    if (hasHero) picks.lowHeroRisk = pick(good, (x, y) => x[HD] - y[HD] || x[AV] - y[AV] || y[NET] - x[NET]);
    if (sc.hasTravel) picks.maxPerHour = pick(all, (x, y) => y[PH] - x[PH] || x[AV] - y[AV]);
    // Denge analizi: kârın ≥%75'i, en kârlı ordunun ≤%20'si kadar askerle
    const small = all.filter((c) => c[NET] >= maxNet * 0.75 && c[TR] <= maxProfitC[TR] * 0.2 && c[TR] < maxProfitC[TR]);
    if (small.length) picks.smallArmy = pick(small, (x, y) => y[NET] - x[NET] || x[TR] - y[TR]);
  }

  // EN GÜVENLİ SEÇENEK (ikinci tam tarama). Baskınlık elemesi "sınıra uzaklık" ölçütünü taşımadığı için ayrı taranır.
  // Kural: kâr eşiğini sağlayan adaylar içinde, bütün kesirli kayıpları 0,5 yuvarlama sınırından en az
  // safeMargin uzakta olan EN UCUZ ordu. Hiçbir aday o kadar uzak değilse hedef, ulaşılabilen en iyi
  // uzaklığın 0,01'lik dilimine indirilir ve yine o dilimdeki en ucuz ordu seçilir. (Yalnızca "en uzak"
  // olanı seçmek, kesirleri sıfıra yaklaştırdığı için gereksiz büyük orduları öne çıkarırdı.)
  let safest = null;
  if (maxProfitC) {
    const safeMargin = sc.rules.safeMargin;
    const cheaper = (av, net, tr, s) => !s || av < s.armyValue || (av === s.armyValue && (net > s.net || (net === s.net && tr < s.troops)));
    const snap = (r, c) => ({ counts: c.slice(), net: r.net, armyValue: r.armyValue, lossCost: r.lossCost, perHour: r.perHour == null ? 0 : r.perHour, heroDamage: r.heroDamage, borderline: r.borderline, troops: r.troops, margin: r.margin });
    let safeBest = null;
    const tiers = new Array(51).fill(null); // tiers[k]: uzaklığı ≥ k/100 olan en ucuz aday
    for (let a = 0; a <= lim[0]; a++) {
      counts[0] = a;
      for (let b = 0; b <= lim[1]; b++) {
        counts[1] = b;
        for (let c = 0; c <= lim[2]; c++) {
          counts[2] = c;
          const r = sc.evaluate(counts);
          if (!r.valid || r.net < threshold - 1e-9 || rejectReason(r)) continue;
          if (r.margin >= safeMargin) { if (cheaper(r.armyValue, r.net, r.troops, safeBest)) safeBest = snap(r, counts); continue; }
          if (safeBest) continue; // güvenli aday bulunduysa yedek dilimlere gerek yok
          const top = Math.floor(r.margin * 100 + 1e-9);
          for (let k = top; k >= 0; k--) { if (cheaper(r.armyValue, r.net, r.troops, tiers[k])) tiers[k] = snap(r, counts); else if (tiers[k] && tiers[k].armyValue < r.armyValue) break; }
        }
      }
    }
    if (safeBest) safest = { ...safeBest, meetsSafeMargin: true, targetMargin: safeMargin };
    else { for (let k = 50; k >= 0; k--) if (tiers[k]) { safest = { ...tiers[k], meetsSafeMargin: false, targetMargin: k / 100 }; break; } }
  }

  const toObj = (c) => c && { counts: [c[0], c[1], c[2]], net: c[NET], armyValue: c[AV], lossCost: c[LC], perHour: c[PH], heroDamage: c[HD], borderline: !!c[BD], troops: c[TR] };
  const outPicks = {};
  for (const k of Object.keys(picks)) if (picks[k]) outPicks[k] = toObj(picks[k]);
  if (safest) outPicks.safest = safest;

  return {
    exhaustive: !limited,
    requested: max.map((v) => Math.max(0, Math.floor(v || 0))),
    limits: lim, searched: size, stats,
    maxNet: maxProfitC ? maxProfitC[NET] : null, threshold, prefs,
    picks: outPicks,
    pareto: pareto.slice(0, 200).map(toObj),
    paretoCount: pareto.length,
    rejectedBest,
    ms: Date.now() - t0,
  };
}

/** Kahramansız / kahramanlı / yalnız kahraman karşılaştırması. heroCfg null ise yalnızca kahramansız. */
export function compareHeroModes(baseConfig, heroCfg, max, prefs, onProgress) {
  const res = {};
  res.noHero = optimize({ ...baseConfig, hero: null }, max, prefs, onProgress && ((p) => onProgress(p * (heroCfg ? 0.5 : 1))));
  if (heroCfg) {
    res.withHero = optimize({ ...baseConfig, hero: heroCfg }, max, prefs, onProgress && ((p) => onProgress(0.5 + p * 0.5)));
    res.heroAlone = createScenario({ ...baseConfig, hero: heroCfg }).report([0, 0, 0]);
  }
  return res;
}

// ============================================================================================
// KAYIPSIZ GARANTİLİ ORDU ("yeniden doğma payı")
// Soru: vahada en kötü durumda `config.animals` kadar hayvan olabilir (şu anki + gece doğabilecekler).
// Hiç asker kaybetmeden yağmalayan EN AZ ASKERLİ ordu hangisi?
//
// Neden en kötü durum yeterli: savunma gücü her hayvan sayısıyla artar (piyade/süvari ağırlıklı toplam),
// savaş üssü K toplam birim arttıkça yalnızca düşer; ikisi de saldırganın kayıp oranını yükseltir.
// Dolayısıyla en kötü duruma karşı kayıpsız olan ordu, daha az hayvan içeren HER duruma karşı da kayıpsızdır.
// (Tek istisna motor kuralında: 83 saldırının altındaki tek asker her zaman ölür — tarama bunu zaten eler.)
//
// Üç seçim döner:
//   guarded  : her türün kesirli kaybı ≤ 0,5 − guard olan en az askerli ordu (eşitlikte en ucuz)   ← öneri
//   cheapest : aynı şartı sağlayan en ucuz ordu (ordu değerine göre)
//   strict   : yalnızca yuvarlama kuralına göre kayıpsız (kesirli kayıp ≤ 0,5) en az askerli ordu
// Eldeki askerle `guarded` bulunamazsa `need`: sınırlar genişletilerek bulunan, gereken en küçük ordu.
// ============================================================================================

/** Bir ordunun kayıpsız kaldığı en yüksek savunma gücü (taban savunma dahil). maxCount: en kalabalık tür. */
export function maxSafeDefence(off, maxCount, K, mode, guard = 0) {
  if (!(maxCount > 0)) return null; // yalnız kahraman: asker kaybı söz konusu değil
  const x = Math.min(0.999999, Math.max(0, (0.5 - guard) / maxCount)); // izin verilen kayıp oranı
  return mode === 'raid' ? off * Math.pow(x / (1 - x), 1 / K) : off * Math.pow(x, 1 / K);
}

export function findNoLossArmy(config, max, prefsIn = {}, onProgress) {
  const prefs = { ...DEFAULT_PREFS, needLimit: 150, needCombos: 3_500_000, ...prefsIn };
  if (config.unitIds.length !== 3) throw new Error('Optimizasyon tam üç birim türüyle çalışır.');
  const sc = createScenario(config);
  const guard = prefs.noLossGuard != null ? prefs.noLossGuard : sc.rules.safeMargin;
  const hasHero = sc.hasHero;
  const t0 = Date.now();

  const scan = (limitsIn, maxCombos, progress) => {
    const { lim, limited, size } = clampLimits(limitsIn, maxCombos);
    const counts = [0, 0, 0];
    let guarded = null, cheapest = null, strict = null, evaluated = 0;
    const snap = (r, mx) => {
      const maxCount = Math.max(counts[0], counts[1], counts[2]);
      return {
        counts: counts.slice(), troops: r.troops, armyValue: r.armyValue, off: r.off, def: r.def, K: r.K, attLoss: r.attLoss,
        maxExact: mx, margin: 0.5 - mx, heroDamage: r.heroDamage, heroAfter: r.heroAfter,
        safeDef: maxSafeDefence(r.off, maxCount, r.K, sc.mode, guard), ruleDef: maxSafeDefence(r.off, maxCount, r.K, sc.mode, 0),
      };
    };
    for (let a = 0; a <= lim[0]; a++) {
      counts[0] = a;
      for (let b = 0; b <= lim[1]; b++) {
        counts[1] = b;
        for (let c = 0; c <= lim[2]; c++) {
          counts[2] = c;
          const r = sc.evaluate(counts);
          if (!r.valid) continue;
          evaluated++;
          if (hasHero && (r.heroDead || r.heroAfter < prefs.minHeroHealth)) continue;
          if (r.lost[0] > 0 || r.lost[1] > 0 || r.lost[2] > 0) continue;
          const mx = Math.max(r.exactLost[0], r.exactLost[1], r.exactLost[2]);
          const tr = r.troops, av = r.armyValue;
          if (!strict || tr < strict.troops || (tr === strict.troops && av < strict.armyValue)) strict = snap(r, mx);
          if (mx <= 0.5 - guard + 1e-12) {
            if (!guarded || tr < guarded.troops || (tr === guarded.troops && av < guarded.armyValue)) guarded = snap(r, mx);
            if (!cheapest || av < cheapest.armyValue || (av === cheapest.armyValue && tr < cheapest.troops)) cheapest = snap(r, mx);
          }
        }
      }
      if (progress && (a & 3) === 0) progress((a + 1) / (lim[0] + 1));
    }
    return { guarded, cheapest, strict, limits: lim, exhaustive: !limited, searched: size, evaluated };
  };

  const requested = max.map((v) => Math.max(0, Math.floor(v || 0)));
  const first = scan(requested, prefs.maxCombos, onProgress && ((p) => onProgress(p * 0.5)));
  let need = null;
  if (!first.guarded) {
    const wide = scan(requested.map((v) => Math.max(v, prefs.needLimit)), prefs.needCombos, onProgress && ((p) => onProgress(0.5 + p * 0.5)));
    need = { pick: wide.guarded, strict: wide.strict, limits: wide.limits };
  }
  return {
    guard, mode: sc.mode, hasHero, requested, limits: first.limits, exhaustive: first.exhaustive, searched: first.searched, evaluated: first.evaluated,
    picks: { guarded: first.guarded, cheapest: first.cheapest, strict: first.strict }, need, ms: Date.now() - t0,
  };
}
