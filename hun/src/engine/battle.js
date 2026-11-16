// SAVAŞ MOTORU — hem Simülatör (Modül A) hem Optimizasyon (Modül B) yalnızca bu dosyadaki
// createScenario().evaluate() fonksiyonunu kullanır; ikinci bir savaş hesabı yoktur.
//
// Formüller ve dayanakları:
//  * Saldırı = Σ (demirci(taban) + silah bonusu) × adet + kahraman gücü, × (1 + bonus%)   [Kirilloid]
//  * Savunma = Σ hayvan savunması, saldırganın piyade/süvari saldırı payına göre ağırlıklı, + 10 taban
//      (vahada +10: resmî Hun rehberi "400 defence against cavalry + 10 own defence of oasis";
//       kullanıcının iki gerçek simülasyonu: 550 + 10 = 560)
//  * Yağma: x = (kaybeden/kazanan)^K; kazanan kaybı = x/(1+x), kaybeden kaybı = 1 − o   [Kirilloid]
//  * Normal saldırı: kazanan kaybı = x, kaybeden %100
//  * K = 2·(1.8592 − N^0.015), [1.2578, 1.5] aralığına sıkıştırılır; N = savaştaki toplam birim (≤1000 → 1.5)
//  * Kayıplar HER BİRİM TÜRÜ İÇİN AYRI yuvarlanır.
//  * Tam 0,5 durumu: saldırgan için AŞAĞI (resmî Hun rehberi: 1/1/1, 410 savunmaya karşı kayıpsız —
//    kayıp oranı tam %50, birim başına 0,5 → 0). Savunan için YUKARI (belgelenmemiş; varsayım).
//  * Demirci: taban + (taban + 300·tüketim/7)·(1.007^seviye − 1)   [Kirilloid; yuvarlama belgelenmemiş]
//  * Kahraman can kaybı: MODEL TAHMİNİ — saldırgan kayıp oranı × 100 (resmî: "dost birliklerin ölüm
//    yüzdesine bakarak tahmin edilebilir"). Tek savaşta ≥%90 kayıp veya can ≤ 0 → ölüm (resmî).

import { HUN_UNITS, HUN_WEAPONS } from '../data/units.js';
import { ANIMALS, ANIMAL_IDS, BOUNTY_PER_UPKEEP_PER_RESOURCE } from '../data/nature.js';
import { armySpeed, tripHours } from './travel.js';

export const DEFAULT_RULES = Object.freeze({
  baseDefense: 10,
  attackerTie: 'down', // tam 0,5 → saldırgan kaybı aşağı yuvarlanır (resmî Hun rehberiyle uyumlu)
  defenderTie: 'up',   // tam 0,5 → hayvan kaybı yukarı (doğrulanmamış varsayım)
  kMin: 1.2578,
  kMax: 1.5,
  borderMargin: 0.03,  // kesirli kayıp 0,5'e bu kadar yakınsa "sınırda" işaretlenir (birim cinsinden)
  heroDeathLossPct: 90,
  loneUnitMinAttack: 83, // tek başına saldıran, 83'ten az saldırı gücündeki birim her zaman ölür (resmî)
  // Demirci formülü (ayarlanabilir). 't4': taban + (taban + katsayı·tüketim)·(çarpan^seviye − 1)  [Kirilloid]
  //                                'percent': taban · (1 + yüzde/100)^seviye
  smithyFormula: 't4', smithyBase: 1.007, smithyUpkeepCoef: 300 / 7, smithyPercent: 1.5,
  smithyRound: 'none', // 'none' | 'round' | 'floor' — birim başına yükseltilmiş değerin yuvarlanması
  safeMargin: 0.1,     // "en güvenli" seçenek: her kesirli kayıp 0,5 sınırından en az bu kadar uzak olmalı
});

export function upgradedStat(base, upkeep, level, rules = DEFAULT_RULES) {
  if (!level) return base;
  const v = rules.smithyFormula === 'percent'
    ? base * Math.pow(1 + rules.smithyPercent / 100, level)
    : base + (base + rules.smithyUpkeepCoef * upkeep) * (Math.pow(rules.smithyBase, level) - 1);
  return rules.smithyRound === 'round' ? Math.round(v) : rules.smithyRound === 'floor' ? Math.floor(v) : v;
}

export function battleExponent(totalUnits, rules = DEFAULT_RULES) {
  const k = 2 * (1.8592 - Math.pow(Math.max(totalUnits, 1), 0.015));
  return Math.min(rules.kMax, Math.max(rules.kMin, k));
}

const TIE_EPS = 1e-9;
/** Birim türü bazında kayıp yuvarlaması. Math.round kullanılmaz; 0,5 davranışı açıkça seçilir. */
export function roundLoss(exact, count, tie) {
  const f = Math.floor(exact + TIE_EPS * 0); // exact ≥ 0
  const frac = exact - f;
  let lost;
  if (Math.abs(frac - 0.5) < TIE_EPS) lost = tie === 'down' ? f : f + 1;
  else if (Math.abs(frac - 1) < TIE_EPS) lost = f + 1; // 0.999999999 kayan nokta artığı
  else lost = frac > 0.5 ? f + 1 : f;
  return lost > count ? count : lost;
}

const sum4w = (arr, w) => arr[0] * w[0] + arr[1] * w[1] + arr[2] * w[2] + arr[3] * w[3];

/**
 * Bir savaş senaryosu hazırlar. config:
 *  unitIds: string[]            — counts dizisinin sırası
 *  smithy: {id: seviye}
 *  hero: null | { strength, offBonusPct, health, mounted, speed, weaponId, armorReduction }
 *  animals: {id: adet}
 *  mode: 'raid' | 'attack'
 *  otherAttackBonusPct: number  — içecek/ittifak vb. ek saldırı bonusu
 *  loot: { available:[o,k,d,t], lootablePct }  — vahada birikmiş hammadde (normal yağma)
 *  weights: [o,k,d,t]           — hammadde değer ağırlıkları
 *  travel: null | { distance, speedFactor, tsLevel }
 *  extraCost: number            — her saldırıya eklenecek kullanıcı tanımlı gerçek gider
 *  rules: DEFAULT_RULES üzerine yazılacak alanlar
 */
export function createScenario(config) {
  const rules = { ...DEFAULT_RULES, ...(config.rules || {}) };
  const unitIds = config.unitIds;
  const n = unitIds.length;
  const hero = config.hero || null;
  const weapon = hero ? HUN_WEAPONS[hero.weaponId] || HUN_WEAPONS.none : HUN_WEAPONS.none;
  const weights = config.weights || [1, 1, 1, 1];
  const wSum = weights[0] + weights[1] + weights[2] + weights[3];
  const mode = config.mode === 'attack' ? 'attack' : 'raid';

  const uAttack = new Float64Array(n), uCav = new Uint8Array(n), uCost = new Float64Array(n);
  const uCostNominal = new Float64Array(n), uCarry = new Float64Array(n), uSpeed = new Float64Array(n);
  unitIds.forEach((id, i) => {
    const u = HUN_UNITS[id];
    if (!u) throw new Error('Bilinmeyen birim: ' + id);
    const lvl = Math.min(20, Math.max(0, (config.smithy && config.smithy[id]) | 0));
    uAttack[i] = upgradedStat(u.attack, u.upkeep, lvl, rules) + (weapon.unit === id ? weapon.perUnit : 0);
    uCav[i] = u.cavalry ? 1 : 0;
    uCost[i] = sum4w(u.cost, weights);
    uCostNominal[i] = u.cost[0] + u.cost[1] + u.cost[2] + u.cost[3];
    uCarry[i] = u.carry;
    uSpeed[i] = u.speed;
  });

  const aIds = ANIMAL_IDS.filter((id) => (config.animals && config.animals[id]) > 0);
  const m = aIds.length;
  const aCount = new Float64Array(m), aUpkeep = new Float64Array(m);
  let defInf = 0, defCav = 0, nDef = 0;
  aIds.forEach((id, j) => {
    const a = ANIMALS[id];
    const c = Math.floor(config.animals[id]);
    aCount[j] = c; aUpkeep[j] = a.upkeep;
    defInf += a.defInf * c; defCav += a.defCav * c; nDef += c;
  });

  const heroStrength = hero ? Math.max(0, +hero.strength || 0) : 0;
  const mult = (1 + (hero ? (+hero.offBonusPct || 0) : 0) / 100) * (1 + (+config.otherAttackBonusPct || 0) / 100);
  const lootAvail = (config.loot && config.loot.available) || [0, 0, 0, 0];
  const lootPct = config.loot && config.loot.lootablePct != null ? config.loot.lootablePct / 100 : 1;
  const lootRes = lootAvail.map((v) => Math.max(0, +v || 0) * lootPct);
  const lootTotal = lootRes[0] + lootRes[1] + lootRes[2] + lootRes[3];
  const lootWeightedPerUnit = lootTotal > 0 ? sum4w(lootRes, weights) / lootTotal : 0;
  const travel = config.travel && config.travel.distance > 0 ? config.travel : null;
  const extraCost = +config.extraCost || 0;
  const bountyUnit = BOUNTY_PER_UPKEEP_PER_RESOURCE;

  // Yeniden kullanılan çıktı nesnesi (optimizasyonda milyonlarca kez çağrılır; kopyalamadan saklamayın).
  const out = {
    valid: false, off: 0, def: 0, K: 1.5, attLoss: 0, defLoss: 0,
    lost: new Int32Array(n), exactLost: new Float64Array(n),
    killed: new Int32Array(m), exactKilled: new Float64Array(m),
    borderline: false, borderAtt: false, borderDef: false, margin: 0.5,
    troops: 0, bountyNominal: 0, bounty: 0, loot: 0, lootNominal: 0, carry: 0,
    lossCost: 0, lossCostNominal: 0, gross: 0, net: 0, armyValue: 0,
    lossRatio: null, overallRatio: null, efficiency: null, perTroop: null,
    hours: null, perHour: null, speed: null,
    heroDamage: 0, heroAfter: null, heroDead: false,
  };

  function evaluate(counts) {
    let inf = 0, cav = 0, troops = 0;
    for (let i = 0; i < n; i++) {
      const c = counts[i];
      if (c > 0) { troops += c; if (uCav[i]) cav += uAttack[i] * c; else inf += uAttack[i] * c; }
    }
    if (hero) { if (hero.mounted) cav += heroStrength; else inf += heroStrength; }
    const raw = inf + cav;
    out.troops = troops;
    if ((troops === 0 && !hero) || raw <= 0) { out.valid = false; return out; }
    out.valid = true;
    const off = raw * mult;
    const def = (defInf * inf + defCav * cav) / raw + rules.baseDefense;
    const K = battleExponent(troops + (hero ? 1 : 0) + nDef, rules);
    let attLoss, defLoss;
    if (mode === 'raid') {
      const a = Math.pow(off, K), d = Math.pow(def, K);
      attLoss = d / (a + d); defLoss = 1 - attLoss;
    } else if (off > def) { attLoss = Math.pow(def / off, K); defLoss = 1; }
    else { attLoss = 1; defLoss = Math.pow(off / def, K); }
    if (!hero && troops === 1 && off < rules.loneUnitMinAttack) attLoss = 1;
    out.off = off; out.def = def; out.K = K; out.attLoss = attLoss; out.defLoss = defLoss;

    const margin = rules.borderMargin;
    let lossCost = 0, lossNom = 0, armyValue = 0, carry = 0, bAtt = false, minDist = 0.5;
    for (let i = 0; i < n; i++) {
      const c = counts[i];
      if (!(c > 0)) { out.lost[i] = 0; out.exactLost[i] = 0; continue; }
      const exact = c * attLoss;
      const l = roundLoss(exact, c, rules.attackerTie);
      out.lost[i] = l; out.exactLost[i] = exact;
      const frac = exact - Math.floor(exact);
      if (exact < c - 1e-9) { const dd = Math.abs(frac - 0.5); if (dd < minDist) minDist = dd; if (dd < margin) bAtt = true; }
      lossCost += l * uCost[i]; lossNom += l * uCostNominal[i];
      armyValue += c * uCost[i]; carry += (c - l) * uCarry[i];
    }
    let killedUpkeep = 0, bDef = false;
    for (let j = 0; j < m; j++) {
      const exact = aCount[j] * defLoss;
      const k = roundLoss(exact, aCount[j], rules.defenderTie);
      out.killed[j] = k; out.exactKilled[j] = exact;
      const frac = exact - Math.floor(exact);
      if (exact < aCount[j] - 1e-9) { const dd = Math.abs(frac - 0.5); if (dd < minDist) minDist = dd; if (dd < margin) bDef = true; }
      killedUpkeep += k * aUpkeep[j];
    }
    out.borderAtt = bAtt; out.borderDef = bDef; out.borderline = bAtt || bDef; out.margin = minDist;

    // Kahraman (model tahmini)
    let heroDead = false;
    if (hero) {
      const dmg = Math.max(0, attLoss * 100 - (+hero.armorReduction || 0));
      const after = (+hero.health || 0) - dmg;
      heroDead = after <= 0 || dmg >= rules.heroDeathLossPct;
      out.heroDamage = dmg; out.heroAfter = heroDead ? 0 : after; out.heroDead = heroDead;
    } else { out.heroDamage = 0; out.heroAfter = null; out.heroDead = false; }

    // Ekonomi — hayvan ödülü, normal yağma ve asker maliyeti ayrı tutulur.
    const bountyNominal = killedUpkeep * bountyUnit * 4;
    const bounty = killedUpkeep * bountyUnit * wSum;
    const lootNominal = Math.min(carry, lootTotal);
    const loot = lootNominal * lootWeightedPerUnit;
    const gross = bounty + loot;
    const net = gross - lossCost - extraCost;
    out.bountyNominal = bountyNominal; out.bounty = bounty; out.loot = loot; out.lootNominal = lootNominal;
    out.carry = carry; out.lossCost = lossCost; out.lossCostNominal = lossNom;
    out.gross = gross; out.net = net; out.armyValue = armyValue;
    out.lossRatio = bounty > 0 ? (lossCost / bounty) * 100 : null;
    out.overallRatio = gross > 0 ? (lossCost / gross) * 100 : null;
    out.efficiency = armyValue > 0 ? (net / armyValue) * 100 : null;
    out.perTroop = troops > 0 ? net / troops : null;
    if (travel) {
      const sp = armySpeed(counts, uSpeed, uCav, hero, travel);
      const h = tripHours(travel.distance, sp, travel.tsLevel);
      out.speed = sp; out.hours = h; out.perHour = h > 0 ? net / h : null;
    } else { out.speed = null; out.hours = null; out.perHour = null; }
    return out;
  }

  /** Arayüz için ayrıntılı, kopyalanmış sonuç. evaluate() çıktısının birebir aynısını taşır. */
  function report(counts) {
    const r = evaluate(counts);
    const units = unitIds.map((id, i) => ({
      id, tr: HUN_UNITS[id].tr, en: HUN_UNITS[id].en, sent: counts[i] | 0, lost: r.valid ? r.lost[i] : 0,
      exactLost: r.valid ? r.exactLost[i] : 0, attackEach: uAttack[i], costEach: uCostNominal[i],
    })).filter((u) => u.sent > 0);
    const animals = aIds.map((id, j) => ({
      id, tr: ANIMALS[id].tr, en: ANIMALS[id].en, icon: ANIMALS[id].icon, count: aCount[j], killed: r.valid ? r.killed[j] : 0,
      exactKilled: r.valid ? r.exactKilled[j] : 0, upkeep: aUpkeep[j],
    }));
    const copy = {};
    for (const k of Object.keys(r)) if (!ArrayBuffer.isView(r[k])) copy[k] = r[k];
    return {
      ...copy, counts: Array.from(counts), unitIds, units, animals, mode,
      hero: hero ? { ...hero, weaponTr: weapon.tr } : null,
      rules, bountyPerResource: r.valid ? r.bountyNominal / 4 : 0, extraCost,
      uncertain: {
        smithy: unitIds.some((id, i) => counts[i] > 0 && config.smithy && config.smithy[id] > 0),
        hero: !!hero, largeBattle: r.valid && r.K < 1.5, defenderTie: true,
      },
    };
  }

  return { evaluate, report, unitIds, animalIds: aIds, mode, rules, hasHero: !!hero, hasTravel: !!travel };
}

/** Tek seferlik savaş simülasyonu (Modül A giriş noktası). */
export function simulate(config, countsById) {
  const sc = createScenario(config);
  const counts = config.unitIds.map((id) => Math.max(0, Math.floor(countsById[id] || 0)));
  return sc.report(counts);
}
