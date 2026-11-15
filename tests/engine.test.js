// Doğrulama testleri — Cermen sürümü. Hun aracındaki 30 maddelik şartname sırasını izler; Hun birimlerine
// özgü sabit sayılar yerine (a) elle hesaplanmış Cermen değerleri ve (b) bu dosyadaki BAĞIMSIZ referans
// hesap (refBattle) kullanılır. Savaş motoru Hun aracıyla aynıdır.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, createScenario, roundLoss, upgradedStat, battleExponent, DEFAULT_RULES } from '../src/engine/battle.js';
import { L, nameOf, setLang } from '../src/i18n.js';
import { optimize, compareHeroModes, clampLimits } from '../src/optimizer/optimizer.js';
import { OPT_UNIT_IDS, OPT_TRIOS, OPT_CANDIDATE_IDS, ALL_UNIT_IDS, UNITS, WEAPONS } from '../src/data/units.js';
import { ANIMALS, ANIMAL_IDS, OASIS_TYPES } from '../src/data/nature.js';
import { distance, tripHours } from '../src/engine/travel.js';
import { parseAnimalText, normalizeRecognition, parseCoords, normalizeHero } from '../src/vision/parse.js';
import { REFERENCE_CASES, checkReference } from '../src/data/references.js';
import { descriptorDistance, segmentColumns, classifyIcon, mergeTemplates, decodeDescriptor, encodeDescriptor, bonusToOasisType, parseBonusPercent, parseTitleCoords } from '../src/vision/icons.js';
import { SEED_ICON_TEMPLATES } from '../src/data/icon-templates.js';

// OASIS: piyadeye karşı 3×25 + 35 + 9×66 = 704 (+10), süvariye karşı 3×20 + 40 + 9×50 = 550 (+10)
const OASIS = { rat: 3, spider: 1, bat: 9 };
// Optimizasyon testleri için küçük/orta vahalar. (OASIS, Cermenlerde ancak ~90+ askerlik karma orduyla
// kârlıdır: ucuz piyade tür başına yuvarlamada kolay kayıp verir; bkz. '25c'.)
const S1 = { rat: 4, spider: 2 }, S2 = { boar: 2, wolf: 1, bear: 1 }, S3 = { rat: 12, spider: 7 };
const M1 = [60, 20, 10], M2 = [60, 20, 14];
const cfg = (animals, extra = {}) => ({ unitIds: OPT_UNIT_IDS, smithy: {}, hero: null, animals, mode: 'raid', ...extra });
/** c: Tokmak Sallayan, a: Balta Sallayan, t: Toton Şövalyesi */
const sim = (animals, c, a, t, extra) => simulate(cfg(animals, extra), { clubswinger: c, axeman: a, teutonicKnight: t });
const lost = (r, id) => (r.units.find((u) => u.id === id) || { lost: 0 }).lost;
const killed = (r, id) => (r.animals.find((a) => a.id === id) || { killed: 0 }).killed;
const HERO = { strength: 1460, offBonusPct: 0, health: 65, mounted: true, speed: 14, weaponId: 'none', armorReduction: 0 };
const COST = { clubswinger: 250, axeman: 490, teutonicKnight: 1525, paladin: 1005 };
const near = (x, y, eps = 1e-9) => Math.abs(x - y) < eps;

/** Motordan bağımsız referans: kahramansız yağma, demirci 0, ≤1000 birim (K = 1,5). */
function refBattle(animals, c, a, t) {
  const inf = 40 * c + 60 * a, cav = 150 * t, off = inf + cav;
  let dI = 0, dC = 0;
  for (const [id, n] of Object.entries(animals)) { dI += ANIMALS[id].defInf * n; dC += ANIMALS[id].defCav * n; }
  const def = (dI * inf + dC * cav) / off + 10;
  const x = Math.pow(def, 1.5) / (Math.pow(off, 1.5) + Math.pow(def, 1.5));
  const rnd = (e, tieUp) => { const f = Math.floor(e), fr = e - f; return Math.abs(fr - 0.5) < 1e-9 ? (tieUp ? f + 1 : f) : fr > 0.5 ? f + 1 : f; };
  const lostU = [rnd(c * x, false), rnd(a * x, false), rnd(t * x, false)];
  let up = 0; const k = {};
  for (const [id, n] of Object.entries(animals)) { k[id] = Math.min(n, rnd(n * (1 - x), true)); up += k[id] * ANIMALS[id].upkeep; }
  const lossCost = lostU[0] * 250 + lostU[1] * 490 + lostU[2] * 1525;
  return { off, def, x, lost: lostU, killed: k, bounty: up * 160, lossCost, net: up * 160 - lossCost };
}

test('1-2. Elle hesaplanmış Cermen savaşları: saldırı, piyade/süvari ağırlıklı savunma', () => {
  const clubs = sim(OASIS, 10, 0, 0);
  assert.equal(clubs.off, 400); assert.equal(clubs.def, 714, 'yalnız piyade → piyade savunması + 10');
  const tk = sim(OASIS, 0, 0, 10);
  assert.equal(tk.off, 1500); assert.equal(tk.def, 560, 'yalnız süvari → süvari savunması + 10');
  const mix = sim(OASIS, 20, 0, 4); // piyade 800, süvari 600 → (704×800 + 550×600)/1400 + 10 = 648
  assert.equal(mix.off, 1400); assert.ok(near(mix.def, 648));
  const all = sim(OASIS, 10, 5, 2);
  assert.equal(all.off, 400 + 300 + 300);
  assert.ok(near(all.def, (704 * 700 + 550 * 300) / 1000 + 10));
  // Birim maliyetleri
  for (const id of Object.keys(COST)) assert.equal(UNITS[id].cost.reduce((x, y) => x + y), COST[id], id);
  // Bağımsız referansla birebir (geniş tarama)
  for (const animals of [OASIS, { boar: 2, wolf: 1, bear: 1 }, { rat: 12, spider: 7 }, { crocodile: 2, tiger: 1 }, { elephant: 1, snake: 4 }]) {
    for (const [c, a, t] of [[10, 0, 0], [0, 10, 0], [0, 0, 10], [25, 5, 3], [40, 0, 6], [7, 13, 2], [60, 30, 20], [3, 1, 1], [100, 0, 0], [0, 0, 40]]) {
      const r = sim(animals, c, a, t), e = refBattle(animals, c, a, t), tag = JSON.stringify([animals, c, a, t]);
      assert.ok(near(r.off, e.off) && near(r.def, e.def) && near(r.attLoss, e.x, 1e-12), tag);
      assert.deepEqual([lost(r, 'clubswinger'), lost(r, 'axeman'), lost(r, 'teutonicKnight')], e.lost, tag);
      for (const id of Object.keys(animals)) assert.equal(killed(r, id), e.killed[id], tag + id);
      assert.equal(r.bountyNominal, e.bounty, tag); assert.equal(r.lossCost, e.lossCost, tag); assert.equal(r.net, e.net, tag);
    }
  }
});

test('3. Tam 0,5 sınırı: 1 Toton Şövalyesi, 150 savunmaya kadar kayıpsız', () => {
  const r = sim({ rat: 7 }, 0, 0, 1); // 7×20 + 10 = 150
  assert.equal(r.off, 150); assert.equal(r.def, 150); assert.equal(r.attLoss, 0.5);
  assert.equal(lost(r, 'teutonicKnight'), 0, 'saldırgan kayıpsız olmalı');
  assert.equal(r.borderline, true, 'tam 0,5 sınırı işaretlenmeli'); assert.equal(r.margin, 0);
  assert.equal(killed(r, 'rat'), 4, '3,5 → hayvanda yukarı');
  assert.equal(lost(sim({ rat: 8 }, 0, 0, 1), 'teutonicKnight'), 1);
});

test('4. Bütün hayvan türleri: savunma, ödül ve veri bütünlüğü', () => {
  assert.equal(ANIMAL_IDS.length, 10);
  const expectedBounty = { rat: 160, spider: 160, snake: 160, bat: 160, boar: 320, wolf: 320, bear: 480, crocodile: 480, tiger: 480, elephant: 800 };
  for (const id of ANIMAL_IDS) {
    const cav = sim({ [id]: 4 }, 0, 0, 300), inf = sim({ [id]: 4 }, 400, 400, 0);
    assert.equal(cav.def, ANIMALS[id].defCav * 4 + 10, id + ' süvari savunması');
    assert.equal(inf.def, ANIMALS[id].defInf * 4 + 10, id + ' piyade savunması');
    assert.equal(killed(cav, id), 4); assert.equal(killed(inf, id), 4);
    assert.equal(cav.bountyNominal, expectedBounty[id] * 4, id + ' ödülü');
  }
  // Cermen casusu ve Mızrakçı piyadedir; Paladin süvaridir
  assert.equal(UNITS.scout.cavalry, false); assert.equal(UNITS.spearman.cavalry, false); assert.equal(UNITS.paladin.cavalry, true);
  const pal = simulate({ unitIds: ALL_UNIT_IDS, animals: { crocodile: 1 }, mode: 'raid' }, { spearman: 30, paladin: 6 });
  const infOff = 30 * 10, cavOff = 6 * 55;
  assert.ok(near(pal.def, (380 * infOff + 240 * cavOff) / (infOff + cavOff) + 10));
});

test('5-7. Tek, iki ve üç birim türüyle saldırı; türler ayrı yuvarlanır', () => {
  assert.equal(sim(OASIS, 12, 0, 0).off, 480);
  assert.equal(sim(OASIS, 0, 12, 0).off, 720);
  assert.equal(sim(OASIS, 0, 0, 12).off, 1800);
  assert.equal(sim(OASIS, 5, 0, 4).off, 800);
  assert.equal(sim(OASIS, 0, 7, 3).off, 870);
  const r = sim(OASIS, 30, 10, 5);
  assert.equal(r.off, 1200 + 600 + 750);
  const separate = r.units.reduce((s, u) => s + u.lost, 0);
  assert.equal(separate, roundLoss(30 * r.attLoss, 30, 'down') + roundLoss(10 * r.attLoss, 10, 'down') + roundLoss(5 * r.attLoss, 5, 'down'));
});

test('8. Yuvarlama sınırı: 0,5 çevresi ve tam 0,5', () => {
  assert.equal(roundLoss(1.49994, 10, 'down'), 1);
  assert.equal(roundLoss(1.50001, 10, 'down'), 2);
  assert.equal(roundLoss(0.5, 1, 'down'), 0);
  assert.equal(roundLoss(0.5, 1, 'up'), 1);
  assert.equal(roundLoss(2.5, 9, 'up'), 3);
  assert.equal(roundLoss(7.65, 9, 'up'), 8);
  assert.equal(roundLoss(9.7, 9, 'up'), 9, 'kayıp adet sayısını aşamaz');
  // Kesirli kayıp ve "sınırda" işareti rapora yansır
  const r = sim(OASIS, 30, 10, 5);
  for (const u of r.units) assert.ok(near(u.exactLost, u.sent * r.attLoss, 1e-12));
  const dists = [...r.units.map((u) => u.exactLost), ...r.animals.map((a) => a.exactKilled)].map((e) => Math.abs(e - Math.floor(e) - 0.5));
  assert.ok(near(r.margin, Math.min(...dists), 1e-12));
});

test('9-10. Sıfır kayıp ve kayıplı sonuçlar', () => {
  const big = sim(OASIS, 0, 0, 60); // 9000 saldırı → kayıp oranı ≈ %1,5 → 0,92 → 1 kayıp
  assert.equal(big.off, 9000);
  const e = refBattle(OASIS, 0, 0, 60);
  assert.equal(lost(big, 'teutonicKnight'), e.lost[2]);
  const zero = sim(OASIS, 0, 0, 30); // 30 × 0,0747 = 2,24 → 2
  assert.equal(lost(zero, 'teutonicKnight'), refBattle(OASIS, 0, 0, 30).lost[2]);
  const safe = sim({ rat: 2 }, 0, 0, 10); // 1500'e karşı 50 → %0,6 → 0,06 → kayıpsız
  assert.equal(safe.lossCost, 0); assert.equal(killed(safe, 'rat'), 2); assert.equal(safe.net, 320);
  assert.ok(sim(OASIS, 10, 0, 0).lossCost > 0);
});

test('11. Saldırganın tüm birliklerini kaybetmesi (normal saldırı) ve ödülün yine verilmesi', () => {
  const r = sim({ elephant: 20 }, 0, 0, 5, { mode: 'attack' });
  assert.equal(lost(r, 'teutonicKnight'), 5); assert.equal(r.attLoss, 1);
  assert.equal(r.lootNominal, 0);
  const r2 = sim({ rat: 40 }, 0, 0, 5, { mode: 'attack' }); // 750 < 810 → saldırgan yok olur, bazı sıçanlar ölür
  assert.equal(lost(r2, 'teutonicKnight'), 5); assert.ok(killed(r2, 'rat') > 0);
  assert.equal(r2.bountyNominal, killed(r2, 'rat') * 160);
});

test('12-13. Hayvanların tamamının ölmesi / bir kısmının hayatta kalması', () => {
  const all = sim(OASIS, 0, 0, 40);
  assert.equal(all.animals.every((a) => a.killed === a.count), true);
  const part = sim(OASIS, 0, 0, 10);
  assert.ok(part.animals.find((a) => a.id === 'bat').count - killed(part, 'bat') >= 1);
  const atk = sim(OASIS, 0, 0, 10, { mode: 'attack' }); // normal saldırıda kazanan hepsini öldürür
  assert.equal(atk.defLoss, 1); assert.equal(killed(atk, 'bat'), 9);
  assert.ok(near(atk.attLoss, Math.pow(560 / 1500, 1.5), 1e-12));
});

test('14. Hayvan bulunmayan vaha: oran "uygulanamaz", sıfıra bölme yok', () => {
  const r = sim({}, 5, 0, 0, { loot: { available: [300, 300, 300, 300] } });
  assert.equal(r.def, 10); assert.equal(r.bountyNominal, 0); assert.equal(r.lossRatio, null);
  assert.equal(r.lootNominal, 300); assert.equal(r.net, 300); assert.equal(r.overallRatio, 0); // 5 × 60 taşıma
  const r0 = sim({}, 5, 0, 0);
  assert.equal(r0.lossRatio, null); assert.equal(r0.overallRatio, null); assert.equal(r0.net, 0);
});

test('15. Kahramanın tek başına saldırısı', () => {
  const r = sim(OASIS, 0, 0, 0, { hero: HERO });
  assert.equal(r.valid, true); assert.equal(r.off, 1460); assert.equal(r.def, 560);
  const expected = Math.pow(560, 1.5) / (Math.pow(1460, 1.5) + Math.pow(560, 1.5)) * 100;
  assert.ok(near(r.heroDamage, expected));
  assert.ok(near(r.heroAfter, 65 - expected)); assert.equal(r.heroDead, false);
  assert.equal(sim(OASIS, 0, 0, 0).valid, false, 'kahramansız sıfır asker geçersiz');
  const foot = sim(OASIS, 0, 0, 0, { hero: { ...HERO, mounted: false } });
  assert.equal(foot.def, 714, 'atsız kahraman piyade sayılır');
});

test('16. Kahraman + ordu: saldırı artar, kayıp azalır; atlı kahraman süvari payına girer', () => {
  const without = sim(OASIS, 30, 0, 0), withHero = sim(OASIS, 30, 0, 0, { hero: HERO });
  assert.equal(withHero.off, 1200 + 1460);
  assert.ok(near(withHero.def, (704 * 1200 + 550 * 1460) / 2660 + 10));
  assert.ok(withHero.attLoss < without.attLoss);
  const foot = sim({ bat: 10 }, 0, 0, 8, { hero: { ...HERO, mounted: false, strength: 1200 } });
  assert.ok(near(foot.def, (660 * 1200 + 500 * 1200) / 2400 + 10));
  const bonus = sim(OASIS, 30, 0, 0, { hero: { ...HERO, offBonusPct: 10 } });
  assert.ok(near(bonus.off, (1200 + 1460) * 1.1));
});

test('17-18. Düşük sağlık ve kahramanın ölümü', () => {
  const low = sim(OASIS, 0, 0, 0, { hero: { ...HERO, health: 10 } });
  assert.equal(low.off, 1460, 'kahraman düşük canla da tam güçle dövüşür');
  assert.equal(low.heroDead, true); assert.equal(low.heroAfter, 0);
  const ok = sim(OASIS, 0, 0, 0, { hero: { ...HERO, health: 25 } });
  assert.equal(ok.heroDead, false);
  const big = sim({ elephant: 30 }, 0, 0, 0, { hero: { ...HERO, health: 100 } }); // ≥%90 kayıp → ölüm
  assert.ok(big.heroDamage >= 90); assert.equal(big.heroDead, true);
  const armor = sim(OASIS, 0, 0, 0, { hero: { ...HERO, armorReduction: 4 } });
  assert.ok(near(armor.heroDamage, sim(OASIS, 0, 0, 0, { hero: HERO }).heroDamage - 4));
});

test('19. Demirci seviyeleri (resmî karşılaştırma tablosundaki seviye-20 değerleriyle uyumlu)', () => {
  assert.equal(upgradedStat(150, 3, 0), 150);
  // support.travian.com "units comparison table": Tokmak 52,4 · Balta 75,4 · Paladin 76,0 · Toton 191,6
  assert.ok(near(upgradedStat(40, 1, 20), 52.4048, 1e-3));
  assert.ok(near(upgradedStat(60, 1, 20), 75.4, 0.06));
  assert.ok(near(upgradedStat(55, 2, 20), 76.0, 0.11));
  assert.ok(near(upgradedStat(150, 3, 20), 191.6, 0.15));
  const r = sim(OASIS, 10, 0, 0, { smithy: { clubswinger: 10 } });
  const each = 40 + (40 + 300 / 7) * (Math.pow(1.007, 10) - 1);
  assert.ok(near(r.off, each * 10)); assert.ok(r.off > 400);
  assert.equal(r.uncertain.smithy, true);
  assert.equal(sim(OASIS, 0, 10, 0, { smithy: { clubswinger: 10 } }).off, 600, 'yalnızca ilgili birim etkilenir');
});

test('20. Kahraman silah bonusu yalnızca kahraman katılırsa ve ilgili birime', () => {
  const h = { ...HERO, strength: 0.0001, weaponId: 'club2' };
  const r = sim(OASIS, 10, 2, 2, { hero: h });
  assert.ok(near(r.off, 10 * 44 + 120 + 300 + 0.0001));
  assert.equal(sim(OASIS, 10, 2, 2).off, 400 + 120 + 300);
  assert.ok(near(sim(OASIS, 0, 5, 5, { hero: { ...h, weaponId: 'tk3' } }).off, 300 + 5 * 165 + 0.0001));
  assert.ok(near(sim(OASIS, 0, 5, 5, { hero: { ...h, weaponId: 'axe1' } }).off, 5 * 63 + 750 + 0.0001));
  assert.equal(WEAPONS.pal2.unit, 'paladin'); assert.equal(WEAPONS.pal2.perUnit, 8); assert.equal(WEAPONS.tk3.strength, 4000);
});

test('21. %50 kayıp filtresi', () => {
  const o = optimize(cfg(S3), M2);
  const sc = createScenario(cfg(S3));
  for (const p of o.pareto) {
    const r = sc.evaluate(p.counts);
    assert.ok(r.lossCost === 0 || r.lossRatio < 50, JSON.stringify(p.counts));
  }
  const open = optimize(cfg(S3), M2, { maxLossRatio: null });
  assert.ok(open.stats.feasible > o.stats.feasible);
  assert.ok(o.stats.byLoss > 0);
  // Hiçbir aday geçemezse: boş öneri + filtre dışı en iyi adaylar
  const none = optimize(cfg({ elephant: 50 }), [3, 3, 3]);
  assert.equal(none.picks.balanced, undefined); assert.ok(none.rejectedBest.length > 0);
});

test('22-24. Minimum asker, maksimum net kâr, Pareto alternatifleri', () => {
  const o = optimize(cfg(S3), M2);
  assert.equal(o.exhaustive, true); assert.equal(o.searched, 61 * 21 * 15);
  const { maxProfit, balanced, minTroops, maxEfficiency } = o.picks;
  assert.ok(maxProfit.net > 0 && maxProfit.net <= 19 * 160, 'en çok: bütün hayvanların ödülü');
  assert.ok(balanced.net >= 0.9 * maxProfit.net); assert.ok(balanced.armyValue <= maxProfit.armyValue);
  assert.ok(minTroops.troops <= balanced.troops); assert.ok(minTroops.net >= o.threshold);
  if (o.picks.zeroLoss) assert.equal(o.picks.zeroLoss.lossCost, 0);
  assert.ok(maxEfficiency.net / maxEfficiency.armyValue >= balanced.net / balanced.armyValue - 1e-12);
  assert.ok(o.pareto.length >= 3);
  const dom = (a, b) => a.net >= b.net && a.armyValue <= b.armyValue && a.lossCost <= b.lossCost && a.troops <= b.troops
    && a.borderline <= b.borderline && (a.net > b.net || a.armyValue < b.armyValue || a.lossCost < b.lossCost || a.troops < b.troops || a.borderline < b.borderline);
  for (const a of o.pareto) for (const b of o.pareto) assert.equal(a !== b && dom(a, b), false);
});

test('25. Optimizasyon sonuçları bağımsız brute-force ile aynı', () => {
  for (const [animals, max, prefs] of [
    [S1, M1, {}],
    [S2, M2, { profitThresholdPct: 75 }],
    [S3, M2, { maxLossRatio: 40 }],
  ]) {
    const o = optimize(cfg(animals), max, prefs);
    const P = { maxLossRatio: 50, profitThresholdPct: 90, ...prefs };
    const rows = [];
    for (let a = 0; a <= max[0]; a++) for (let b = 0; b <= max[1]; b++) for (let c = 0; c <= max[2]; c++) {
      if (a + b + c === 0) continue;
      const r = refBattle(animals, a, b, c);
      const armyValue = a * 250 + b * 490 + c * 1525;
      if (r.lossCost > 0 && !(r.lossCost / r.bounty * 100 < P.maxLossRatio)) continue;
      if (!(r.net > 0)) continue;
      rows.push({ net: r.net, armyValue, troops: a + b + c, lossCost: r.lossCost });
    }
    assert.equal(o.stats.feasible, rows.length); assert.ok(rows.length > 5);
    const maxNet = Math.max(...rows.map((r) => r.net));
    assert.equal(o.picks.maxProfit.net, maxNet);
    const good = rows.filter((r) => r.net >= maxNet * P.profitThresholdPct / 100 - 1e-9);
    assert.equal(o.picks.balanced.armyValue, Math.min(...good.map((r) => r.armyValue)));
    assert.equal(o.picks.minTroops.troops, Math.min(...good.map((r) => r.troops)));
    assert.equal(o.picks.maxProfit.armyValue, Math.min(...rows.filter((r) => r.net === maxNet).map((r) => r.armyValue)));
    const eff = Math.max(...rows.map((r) => r.net / r.armyValue));
    assert.ok(near(o.picks.maxEfficiency.net / o.picks.maxEfficiency.armyValue, eff, 1e-12));
    const zero = rows.filter((r) => r.lossCost === 0);
    assert.equal(!!o.picks.zeroLoss, zero.length > 0);
  }
});

test('25b. Bütün birim üçlüleri optimizasyonda çalışır (Paladin dahil)', () => {
  assert.deepEqual(Object.keys(OPT_TRIOS).sort(), ['apt', 'cap', 'cat', 'cpt']);
  for (const ids of Object.values(OPT_TRIOS)) {
    assert.equal(ids.length, 3); for (const id of ids) assert.ok(OPT_CANDIDATE_IDS.includes(id) && UNITS[id].attack > 0);
    const o = optimize(cfg(S1, { unitIds: ids }), [40, 15, 15]);
    assert.ok(o.picks.balanced, ids.join());
    const r = simulate(cfg(S1, { unitIds: ids }), Object.fromEntries(ids.map((id, i) => [id, o.picks.balanced.counts[i]])));
    assert.equal(r.net, o.picks.balanced.net); assert.equal(r.armyValue, o.picks.balanced.armyValue);
  }
});

test('25c. Büyük vaha: Hun aracındaki örnek vaha Cermenlerde küçük orduyla kârsız, büyük karma orduyla kârlı', () => {
  assert.equal(optimize(cfg(OASIS), [40, 20, 20]).picks.balanced, undefined);
  const o = optimize(cfg(OASIS), [150, 50, 40]);
  assert.ok(o.picks.balanced && o.picks.balanced.net > 0);
  const [c, a, t] = o.picks.balanced.counts, e = refBattle(OASIS, c, a, t);
  assert.equal(e.net, o.picks.balanced.net); assert.ok(e.lossCost === 0 || e.lossCost / e.bounty < 0.5);
});

test('26. Taşıma kapasitesi ve normal yağma (hayvan ödülünden ayrı)', () => {
  const loot = { available: [400, 300, 200, 100] };
  const r = sim(OASIS, 30, 10, 5, { loot }), e = refBattle(OASIS, 30, 10, 5);
  const carry = (30 - e.lost[0]) * 60 + (10 - e.lost[1]) * 50 + (5 - e.lost[2]) * 80; // ölenler taşıyamaz
  assert.equal(r.carry, carry); assert.equal(r.lootNominal, Math.min(carry, 1000));
  assert.equal(r.bountyNominal, e.bounty); assert.equal(r.gross, e.bounty + r.lootNominal); assert.equal(r.net, r.gross - e.lossCost);
  const small = sim({}, 2, 0, 0, { loot }); assert.equal(small.lootNominal, 120);
  // Ağırlıklar: tahıl 2 kat değerliyse ödül 5 paya çıkar, asker maliyetinde tahıl iki kez sayılır
  const w = sim(OASIS, 30, 10, 5, { weights: [1, 1, 1, 2] });
  assert.equal(w.bounty, e.bounty / 4 * 5);
  assert.equal(w.lossCost, e.lost[0] * (250 + 40) + e.lost[1] * (490 + 70) + e.lost[2] * (1525 + 80));
});

test('27. Yolculuk süresi, Turnuva Alanı; Cermen kahramanında hız bonusu yok', () => {
  assert.equal(distance({ x: 50, y: 50 }, { x: 52, y: 50 }), 2);
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(distance({ x: -200, y: 0 }, { x: 200, y: 0 }), 1, 'harita sarmalı');
  const t = (extra, c, a, k) => sim(OASIS, c, a, k, extra);
  const tr = { distance: 12, speedFactor: 2, tsLevel: 0 };
  assert.equal(t({ travel: tr }, 10, 2, 2).speed, 12);            // en yavaş: Balta Sallayan 6 × 2
  assert.equal(t({ travel: tr }, 10, 2, 2).hours, 2);             // 12 kare / 12 × 2 yön
  assert.equal(t({ travel: tr }, 10, 0, 0).speed, 14);            // Tokmak Sallayan 7 × 2
  assert.equal(t({ travel: tr }, 0, 0, 10).speed, 18);            // Toton Şövalyesi 9 × 2
  assert.equal(t({ travel: tr }, 10, 2, 2).perHour, t({ travel: tr }, 10, 2, 2).net / 2);
  assert.equal(t({ travel: tr, hero: HERO }, 0, 0, 10).speed, 18, 'kahraman (14) süvariyle giderken bonus eklenmez');
  assert.equal(t({ travel: tr, hero: { ...HERO, mounted: false, speed: 7 } }, 0, 0, 10).speed, 14, 'atsız kahraman orduyu yavaşlatır');
  assert.equal(t({ travel: { ...tr, heroCavBonus: 3 }, hero: HERO }, 0, 0, 10).speed, 24, 'isteğe bağlı bonus parametresi');
  assert.equal(tripHours(30, 10, 0), 6);
  assert.ok(near(tripHours(30, 10, 5), 2 * (2 + 10 / 20), 1e-12), 'TA yalnızca 20 kareden sonrasını hızlandırır');
});

test('28. Screenshot/metin hayvan tanıma', () => {
  const p = parseAnimalText('Birlikler\n3 Sıçan\n1 Örümcek\n9 Yarasa\n(52|50)');
  assert.deepEqual(p.animals.map((a) => [a.id, a.count, a.confidence]), [['rat', 3, 'high'], ['spider', 1, 'high'], ['bat', 9, 'high']]);
  assert.deepEqual(parseCoords('Boş vaha (52|50)'), { x: 52, y: 50 });
  assert.deepEqual(parseCoords('(‭−120‬|‭7‬)'), { x: -120, y: 7 });
  const en = parseAnimalText('12 Wild Boars\n4 Wolves\n2 Bears\n1 Elephant\n7 Yaban domuzları');
  assert.deepEqual(en.animals.map((a) => [a.id, a.count]), [['boar', 12], ['wolf', 4], ['bear', 2], ['elephant', 1]]);
  const ai = normalizeRecognition({ animals: [{ id: 'tiger', count: 5, confidence: 'high' }, { name: 'Timsah', count: 2, confidence: 'low' }], coords: { x: 1, y: -2 } });
  assert.deepEqual(ai.animals.map((a) => [a.id, a.count, a.confidence]), [['tiger', 5, 'high'], ['crocodile', 2, 'low']]);
  assert.deepEqual(ai.coords, { x: 1, y: -2 });
});

test('29. Yanlış/eksik screenshot verisi: uydurma yok, belirsizler işaretli', () => {
  const junk = parseAnimalText('Kaynaklar 300 | 200\nOdun %25');
  assert.equal(junk.empty, true); assert.equal(junk.animals.length, 0);
  const bad = normalizeRecognition({ animals: [{ id: 'dragon', count: 3 }, { id: 'rat', count: -1 }, { id: 'bat', count: 'çok' }, { id: 'wolf', count: 2 }, { id: 'wolf', count: 9 }] });
  assert.deepEqual(bad.animals.map((a) => [a.id, a.count, a.confidence]), [['rat', 0, 'low'], ['bat', 0, 'low'], ['wolf', 2, 'low']]);
  assert.ok(bad.warnings.length >= 4);
  assert.equal(normalizeRecognition(null).empty, true);
  assert.equal(normalizeRecognition({ animals: 'x' }).empty, true);
  const noNum = parseAnimalText('Sıçan\n3 5 Yarasa');
  assert.deepEqual(noNum.animals.map((a) => a.confidence), ['low', 'low']);
  assert.deepEqual(normalizeHero({ strength: 1460, health: 65, level: 'x' }), { strength: 1460, health: 65, level: null, offBonusPct: null, notes: '' });
});

test('28b. İkon tanıma: kümeleme, parmak izi eşleştirme, bonus → vaha türü, koordinat', () => {
  // Gerçek ekran görüntüsündeki (149|152) sütun profili: 4 [ikon+hap] kümesi
  const cols = new Array(924).fill(0);
  for (const [a, b] of [[101, 233], [260, 393], [420, 553], [580, 712]]) for (let x = a; x <= b; x++) cols[x] = 5;
  cols[150] = 0; cols[151] = 0; // küme içi küçük boşluk bölmemeli
  assert.deepEqual(segmentColumns(cols, 5, 10), [[101, 233], [260, 393], [420, 553], [580, 712]]);
  assert.deepEqual(segmentColumns([0, 1, 1, 0, 0, 0, 0, 1], 3, 2), [[1, 2]], 'dar kümeler atılır');
  const tpl = mergeTemplates({});
  assert.deepEqual(Object.keys(SEED_ICON_TEMPLATES).sort(), ['bat', 'bear', 'boar', 'crocodile', 'rat', 'snake', 'spider', 'tiger', 'wolf']);
  for (const id of Object.keys(SEED_ICON_TEMPLATES)) {
    const d = decodeDescriptor(SEED_ICON_TEMPLATES[id][0]);
    assert.equal(d.length, 432);
    assert.deepEqual(classifyIcon(d, tpl).id, id);
    assert.equal(classifyIcon(d, tpl).confidence, 'high');
    // Hafif gürültü (farklı sıkıştırma/ölçek) eşleşmeyi bozmamalı
    const noisy = d.map((v, i) => Math.max(0, Math.min(255, v + ((i * 7) % 13) - 6)));
    assert.equal(classifyIcon(noisy, tpl).id, id);
    assert.equal(encodeDescriptor(d), SEED_ICON_TEMPLATES[id][0]);
  }
  // Bilinmeyen ikon uydurulmaz
  assert.equal(classifyIcon(new Uint8Array(432).fill(128), tpl).id, null);
  assert.equal(classifyIcon(new Uint8Array(432).fill(128), {}).id, null);
  // Cihazda öğrenilen şablon kullanılır
  const custom = new Uint8Array(432).map((_, i) => (i * 37) % 251);
  assert.equal(classifyIcon(custom, mergeTemplates({ elephant: [encodeDescriptor(custom)] })).id, 'elephant');
  // Yerleşik parmak izleri birbirinden yeterince uzak (yanlış eşleşme payı)
  const ids = Object.keys(SEED_ICON_TEMPLATES);
  for (const a of ids) for (const b of ids) if (a < b) assert.ok(descriptorDistance(decodeDescriptor(SEED_ICON_TEMPLATES[a][0]), decodeDescriptor(SEED_ICON_TEMPLATES[b][0])) > 35, a + '/' + b);
  assert.equal(bonusToOasisType([0, 25, 0, 0]), 'clay25'); assert.equal(bonusToOasisType([25, 0, 0, 25]), 'wood25crop');
  assert.equal(bonusToOasisType([0, 0, 50, 0]), 'iron50'); assert.equal(bonusToOasisType([0, 0, 0, 50]), 'crop50');
  assert.equal(bonusToOasisType([0, 0, 0, 25]), 'crop25'); assert.equal(bonusToOasisType([25, 25, 0, 0]), null);
  assert.equal(bonusToOasisType([0, NaN, 0, 0]), null); assert.equal(bonusToOasisType([0, 0, 0, 0]), null);
  assert.equal(parseBonusPercent('%25'), 25); assert.equal(parseBonusPercent('%0'), 0); assert.equal(parseBonusPercent('40'), 0);
  assert.equal(parseBonusPercent('9625'), 25); assert.ok(Number.isNaN(parseBonusPercent('%7'))); assert.ok(Number.isNaN(parseBonusPercent('')));
  assert.deepEqual(parseTitleCoords('Boş vaha (149|152)'), { x: 149, y: 152 });
  assert.deepEqual(parseTitleCoords('(-12|7)'), { x: -12, y: 7 });
  assert.equal(parseTitleCoords('(149152)'), null, 'ayraç okunmadıysa koordinat tahmin edilmez');
});

test('30. Simülatör ve optimizasyon aynı motoru kullanır, aynı sonucu üretir', () => {
  const o = optimize(cfg(S3, { loot: { available: [100, 100, 100, 100] } }), M2);
  for (const p of [...o.pareto, ...Object.values(o.picks)]) {
    const r = sim(S3, p.counts[0], p.counts[1], p.counts[2], { loot: { available: [100, 100, 100, 100] } });
    assert.equal(r.net, p.net); assert.equal(r.lossCost, p.lossCost); assert.equal(r.armyValue, p.armyValue);
  }
  assert.deepEqual(sim(OASIS, 10, 2, 2).units, sim({ ...OASIS }, 10, 2, 2).units);
});

test('Ek: kahramanlı/kahramansız karşılaştırma ve asgari sağlık filtresi', () => {
  const res = compareHeroModes(cfg(S3), HERO, M2, { minHeroHealth: 30 });
  assert.ok(res.noHero.picks.balanced && res.withHero.picks.balanced);
  assert.equal(res.heroAlone.off, 1460);
  const sc = createScenario(cfg(S3, { hero: HERO }));
  for (const p of res.withHero.pareto) { const r = sc.evaluate(p.counts); assert.ok(!r.heroDead && r.heroAfter >= 30); }
  assert.ok(res.withHero.picks.lowHeroRisk.heroDamage <= res.withHero.picks.balanced.heroDamage + 1e-12);
  const strict = optimize(cfg(S3, { hero: HERO }), M2, { minHeroHealth: 64.9 });
  assert.ok(strict.stats.byHero > 0);
});

test('Ek: büyük savaş üssü, tek zayıf birim kuralı, arama sınırı, referans vakalar', () => {
  assert.equal(battleExponent(27), 1.5); assert.equal(battleExponent(1000), 1.5);
  assert.ok(near(battleExponent(3400), 1.459, 1e-3)); assert.equal(battleExponent(1e12), 1.2578);
  const lone = simulate({ unitIds: ALL_UNIT_IDS, animals: {}, mode: 'raid' }, { clubswinger: 1 });
  assert.equal(lone.units[0].lost, 1, '83 saldırının altındaki tek birim ölür (Tokmak Sallayan 40)');
  assert.equal(simulate({ unitIds: ALL_UNIT_IDS, animals: {}, mode: 'raid' }, { teutonicKnight: 1 }).units[0].lost, 0);
  const c = clampLimits([500, 500, 500], 1_000_000);
  assert.equal(c.limited, true); assert.ok(c.size <= 1_000_000); assert.ok(c.lim.every((v) => v >= 90));
  assert.equal(clampLimits([10, 10, 10], 1e6).limited, false);
  for (const ref of REFERENCE_CASES) assert.deepEqual(checkReference(ref).mismatches, [], ref.name);
});

test('Ek: performans — 150×150×150 eksiksiz tarama birkaç saniyenin altında', () => {
  const o = optimize(cfg({ boar: 3, wolf: 2, bear: 1 }), [150, 150, 150]);
  assert.equal(o.exhaustive, true); assert.ok(o.ms < 15000, 'süre: ' + o.ms + ' ms');
  assert.ok(o.picks.balanced);
});

test('Ek: en güvenli seçenek — yuvarlama sınırına uzak, kâr eşiğini sağlayan en ucuz ordu (brute-force ile aynı)', () => {
  for (const [animals, max] of [[S1, M1], [S2, M2], [S3, M2]]) {
    const o = optimize(cfg(animals), max);
    const s = o.picks.safest;
    assert.ok(s, 'en güvenli seçenek var');
    const rows = [];
    for (let a = 0; a <= max[0]; a++) for (let b = 0; b <= max[1]; b++) for (let c = 0; c <= max[2]; c++) {
      if (a + b + c === 0) continue;
      const r = sim(animals, a, b, c);
      if (r.lossCost > 0 && !(r.lossRatio < 50)) continue;
      if (!(r.net > 0) || r.net < o.threshold - 1e-9) continue;
      rows.push({ margin: r.margin, armyValue: r.armyValue, net: r.net });
    }
    const SM = DEFAULT_RULES.safeMargin;
    const safe = rows.filter((r) => r.margin >= SM);
    if (safe.length) {
      assert.equal(s.meetsSafeMargin, true); assert.ok(s.margin >= SM);
      assert.equal(s.armyValue, Math.min(...safe.map((r) => r.armyValue)));
    } else {
      assert.equal(s.meetsSafeMargin, false);
      const tier = Math.floor(Math.max(...rows.map((r) => r.margin)) * 100 + 1e-9) / 100;
      assert.equal(s.targetMargin, tier); assert.ok(s.margin >= tier - 1e-12);
      assert.equal(s.armyValue, Math.min(...rows.filter((r) => r.margin >= tier - 1e-12).map((r) => r.armyValue)));
    }
    assert.ok(s.net >= o.threshold - 1e-9);
    const rep = sim(animals, s.counts[0], s.counts[1], s.counts[2]);
    assert.ok(near(rep.margin, s.margin, 1e-12));
  }
  const strict = optimize(cfg(S3, { rules: { safeMargin: 0.45 } }), M2).picks.safest;
  const loose = optimize(cfg(S3, { rules: { safeMargin: 0.05 } }), M2).picks.safest;
  assert.ok(loose.armyValue <= strict.armyValue);
});

test('Ek: demirci formülü yapılandırılabilir', () => {
  const R = (x) => ({ ...DEFAULT_RULES, ...x });
  assert.ok(near(upgradedStat(150, 3, 5), 150 + (150 + 900 / 7) * (Math.pow(1.007, 5) - 1), 1e-12));
  assert.equal(upgradedStat(150, 3, 5, R({ smithyRound: 'round' })), 160);
  assert.equal(upgradedStat(150, 3, 5, R({ smithyRound: 'floor' })), 159);
  assert.ok(near(upgradedStat(100, 2, 10, R({ smithyFormula: 'percent', smithyPercent: 1.5 })), 100 * Math.pow(1.015, 10), 1e-12));
  assert.ok(near(upgradedStat(150, 3, 5, R({ smithyBase: 1.01, smithyUpkeepCoef: 0 })), 150 * Math.pow(1.01, 5), 1e-12));
  const a = sim(OASIS, 0, 0, 10, { smithy: { teutonicKnight: 5 }, rules: { smithyRound: 'round' } });
  assert.equal(a.off, 1600);
  const b = sim(OASIS, 0, 0, 10, { smithy: { teutonicKnight: 5 }, rules: { smithyFormula: 'percent', smithyPercent: 2 } });
  assert.ok(near(b.off, 1500 * Math.pow(1.02, 5)));
  assert.equal(sim(OASIS, 10, 2, 2, { rules: { smithyFormula: 'percent', smithyPercent: 9 } }).off, 820);
});

test('Ek: iki dil — veri adları ve iletiler', () => {
  for (const id of ANIMAL_IDS) { assert.ok(ANIMALS[id].tr && ANIMALS[id].en, id); }
  for (const id of ALL_UNIT_IDS) { assert.ok(UNITS[id].tr && UNITS[id].en, id); }
  for (const w of Object.values(WEAPONS)) { assert.ok(w.tr && w.en, w.id); assert.ok(w.unit === null || UNITS[w.unit], w.id); }
  for (const o of Object.values(OASIS_TYPES)) assert.ok(o.tr && o.en, o.id);
  setLang('en');
  try {
    assert.equal(L('a', 'b'), 'b'); assert.equal(nameOf(ANIMALS.rat), 'Rat'); assert.equal(nameOf(UNITS.teutonicKnight), 'Teutonic Knight');
    assert.match(normalizeRecognition({ animals: [{ id: 'dragon', count: 1 }] }).warnings[0], /Unknown unit/);
    assert.match(checkReference({ mode: 'raid', units: { teutonicKnight: 10 }, animals: OASIS, expected: { lost: { teutonicKnight: 9 } } }).mismatches[0], /engine \d+, game 9/);
  } finally { setLang('tr'); }
  assert.equal(nameOf(ANIMALS.rat), 'Sıçan'); assert.equal(nameOf(UNITS.clubswinger), 'Tokmak Sallayan');
});
