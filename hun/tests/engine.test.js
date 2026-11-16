// Zorunlu doğrulama testleri (şartname §22). Numaralar şartnamedeki sırayı izler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, createScenario, roundLoss, upgradedStat, battleExponent, DEFAULT_RULES } from '../src/engine/battle.js';
import { L, nameOf, setLang } from '../src/i18n.js';
import { optimize, compareHeroModes, clampLimits, findNoLossArmy, maxSafeDefence } from '../src/optimizer/optimizer.js';
import { OPT_UNIT_IDS, ALL_HUN_IDS, HUN_UNITS, HUN_WEAPONS } from '../src/data/units.js';
import { ANIMALS, ANIMAL_IDS, OASIS_TYPES } from '../src/data/nature.js';
import { distance, tripHours } from '../src/engine/travel.js';
import { parseAnimalText, normalizeRecognition, parseCoords, normalizeHero } from '../src/vision/parse.js';
import { REFERENCE_CASES, checkReference } from '../src/data/references.js';
import { descriptorDistance, segmentColumns, classifyIcon, mergeTemplates, decodeDescriptor, encodeDescriptor, bonusToOasisType, parseBonusPercent, parseTitleCoords } from '../src/vision/icons.js';
import { SEED_ICON_TEMPLATES } from '../src/data/icon-templates.js';

const OASIS = { rat: 3, spider: 1, bat: 9 };
const cfg = (animals, extra = {}) => ({ unitIds: OPT_UNIT_IDS, smithy: {}, hero: null, animals, mode: 'raid', ...extra });
const sim = (animals, s, m, r, extra) => simulate(cfg(animals, extra), { steppeRider: s, marksman: m, marauder: r });
const lost = (r, id) => (r.units.find((u) => u.id === id) || { lost: 0 }).lost;
const killed = (r, id) => (r.animals.find((a) => a.id === id) || { killed: 0 }).killed;
const HERO = { strength: 1460, offBonusPct: 0, health: 65, mounted: true, speed: 14, weaponId: 'none', armorReduction: 0 };

test('1. Gerçek oyun simülasyonu 10/2/2 (52|50) birebir', () => {
  const r = sim(OASIS, 10, 2, 2);
  assert.equal(r.off, 1780); assert.equal(r.def, 560);
  assert.deepEqual([lost(r, 'steppeRider'), lost(r, 'marksman'), lost(r, 'marauder')], [1, 0, 0]);
  assert.deepEqual([killed(r, 'rat'), killed(r, 'spider'), killed(r, 'bat')], [3, 1, 8]);
  assert.equal(r.lossCost, 895); assert.equal(r.bountyNominal, 1920); assert.equal(r.bountyPerResource, 480);
  assert.equal(r.net, 1025);
  assert.equal(r.lossRatio.toFixed(2), '46.61');
});

test('2. Gerçek oyun simülasyonu 15/2/2 birebir', () => {
  const r = sim(OASIS, 15, 2, 2);
  assert.equal(r.off, 2380); assert.equal(r.def, 560);
  assert.deepEqual([lost(r, 'steppeRider'), lost(r, 'marksman'), lost(r, 'marauder')], [2, 0, 0]);
  assert.deepEqual([killed(r, 'rat'), killed(r, 'spider'), killed(r, 'bat')], [3, 1, 8]);
  assert.equal(r.lossCost, 1790); assert.equal(r.bountyNominal, 1920); assert.equal(r.net, 130);
  assert.equal(r.lossRatio.toFixed(2), '93.23');
  // Daha güçlü ordu, 895 hammadde daha az kârlı
  assert.equal(sim(OASIS, 10, 2, 2).net - r.net, 895);
});

test('3. Resmî Hun örneği: 1/1/1, 410 savunmaya kadar kayıpsız', () => {
  for (const animals of [{ rat: 20 }, { bear: 2 }]) {
    const r = sim(animals, 1, 1, 1);
    assert.equal(r.off, 410); assert.equal(r.def, 410);
    assert.equal(r.attLoss, 0.5);
    assert.equal(r.units.reduce((s, u) => s + u.lost, 0), 0, 'saldırgan kayıpsız olmalı');
    assert.equal(r.borderline, true, 'tam 0,5 sınırı işaretlenmeli');
  }
  assert.equal(killed(sim({ rat: 20 }, 1, 1, 1), 'rat'), 10);
  // 410'un üzerinde (21 sıçan = 430) artık kayıp var
  assert.ok(sim({ rat: 21 }, 1, 1, 1).units.reduce((s, u) => s + u.lost, 0) > 0);
});

test('4. Bütün hayvan türleri: savunma, ödül ve veri bütünlüğü', () => {
  assert.equal(ANIMAL_IDS.length, 10);
  const expectedBounty = { rat: 160, spider: 160, snake: 160, bat: 160, boar: 320, wolf: 320, bear: 480, crocodile: 480, tiger: 480, elephant: 800 };
  for (const id of ANIMAL_IDS) {
    const r = sim({ [id]: 4 }, 200, 200, 200);
    assert.equal(r.def, ANIMALS[id].defCav * 4 + 10, id + ' süvari savunması');
    assert.equal(killed(r, id), 4);
    assert.equal(r.bountyNominal, expectedBounty[id] * 4, id + ' ödülü');
  }
  // Piyade saldırısında piyade savunması kullanılır
  const inf = simulate({ unitIds: ALL_HUN_IDS, animals: { bat: 2 }, mode: 'raid' }, { mercenary: 50 });
  assert.equal(inf.def, 66 * 2 + 10);
  // Karma: savunma, saldırı payına göre ağırlıklanır
  const mix = simulate({ unitIds: ALL_HUN_IDS, animals: { crocodile: 1 }, mode: 'raid' }, { mercenary: 24, steppeRider: 3 });
  const infOff = 24 * 35, cavOff = 3 * 120;
  assert.ok(Math.abs(mix.def - ((380 * infOff + 240 * cavOff) / (infOff + cavOff) + 10)) < 1e-9);
});

test('5-7. Tek, iki ve üç süvari türüyle saldırı', () => {
  assert.equal(sim(OASIS, 12, 0, 0).off, 1440);
  assert.equal(sim(OASIS, 0, 12, 0).off, 1320);
  assert.equal(sim(OASIS, 0, 0, 12).off, 2160);
  assert.equal(sim(OASIS, 5, 0, 4).off, 1320);
  assert.equal(sim(OASIS, 0, 7, 3).off, 1310);
  const r = sim(OASIS, 3, 1, 1);
  assert.equal(r.off, 650);
  // Her birim türü ayrı yuvarlanır: toplam kayıp, havuzlanmış yuvarlamadan farklı olabilir
  const pooled = Math.round(5 * r.attLoss);
  const separate = r.units.reduce((s, u) => s + u.lost, 0);
  assert.equal(separate, roundLoss(3 * r.attLoss, 3, 'down') + 2 * roundLoss(r.attLoss, 1, 'down'));
  assert.ok(Number.isInteger(pooled));
});

test('8. Yuvarlama sınırı: 0,5 çevresi ve tam 0,5', () => {
  assert.equal(roundLoss(1.49994, 10, 'down'), 1);
  assert.equal(roundLoss(1.50001, 10, 'down'), 2);
  assert.equal(roundLoss(0.5, 1, 'down'), 0);
  assert.equal(roundLoss(0.5, 1, 'up'), 1);
  assert.equal(roundLoss(2.5, 9, 'up'), 3);
  assert.equal(roundLoss(7.65, 9, 'up'), 8);
  assert.equal(roundLoss(9.7, 9, 'up'), 9, 'kayıp adet sayısını aşamaz');
  // 10/2/2: Bozkır kaybı 1,49994 → 1 (sınırda işaretli); 15/2/2: 1,5366 → 2
  const r1 = sim(OASIS, 10, 2, 2), r2 = sim(OASIS, 15, 2, 2);
  assert.ok(Math.abs(r1.units[0].exactLost - 1.49994) < 1e-4); assert.equal(r1.borderline, true);
  assert.ok(Math.abs(r2.units[0].exactLost - 1.5366) < 1e-3);
  // Daha çok asker → daha çok kayıp olabilir
  assert.ok(lost(r2, 'steppeRider') > lost(r1, 'steppeRider'));
});

test('9-10. Sıfır kayıp ve kayıplı sonuçlar; 10/9/10 ile 10/10/10 karşılaştırması', () => {
  const a = sim(OASIS, 10, 9, 10), b = sim(OASIS, 10, 10, 10);
  assert.equal(a.off, 3990); assert.equal(a.lossCost, 0);
  assert.deepEqual([killed(a, 'rat'), killed(a, 'spider'), killed(a, 'bat')], [3, 1, 9]);
  assert.equal(a.bountyNominal, 2080); assert.equal(a.borderline, true, '0,4995 → sınırda');
  assert.equal(b.off, 4100); assert.equal(b.lossCost, 0); assert.equal(b.net, a.net);
  assert.ok(sim(OASIS, 4, 0, 0).lossCost > 0);
});

test('11. Saldırganın tüm birliklerini kaybetmesi (normal saldırı) ve ödülün yine verilmesi', () => {
  const r = sim({ elephant: 20 }, 5, 0, 0, { mode: 'attack' });
  assert.equal(lost(r, 'steppeRider'), 5); assert.equal(r.attLoss, 1);
  assert.equal(r.lootNominal, 0);
  const r2 = sim({ rat: 40 }, 6, 0, 0, { mode: 'attack' }); // 720 < 810 → saldırgan yok olur, bazı sıçanlar ölür
  assert.equal(lost(r2, 'steppeRider'), 6); assert.ok(killed(r2, 'rat') > 0);
  assert.equal(r2.bountyNominal, killed(r2, 'rat') * 160);
});

test('12-13. Hayvanların tamamının ölmesi / bir kısmının hayatta kalması', () => {
  const all = sim(OASIS, 10, 9, 10);
  assert.equal(all.animals.every((a) => a.killed === a.count), true);
  const part = sim(OASIS, 10, 2, 2);
  assert.equal(part.animals.find((a) => a.id === 'bat').count - killed(part, 'bat'), 1);
  const atk = sim(OASIS, 10, 2, 2, { mode: 'attack' }); // normal saldırıda kazanan hepsini öldürür
  assert.equal(atk.defLoss, 1); assert.equal(killed(atk, 'bat'), 9);
  assert.ok(Math.abs(atk.attLoss - Math.pow(560 / 1780, 1.5)) < 1e-12);
});

test('14. Hayvan bulunmayan vaha: oran "uygulanamaz", sıfıra bölme yok', () => {
  const r = sim({}, 5, 0, 0, { loot: { available: [300, 300, 300, 300] } });
  assert.equal(r.def, 10); assert.equal(r.bountyNominal, 0); assert.equal(r.lossRatio, null);
  assert.equal(r.lootNominal, 375); assert.equal(r.net, 375); assert.equal(r.overallRatio, 0);
  const r0 = sim({}, 5, 0, 0);
  assert.equal(r0.lossRatio, null); assert.equal(r0.overallRatio, null); assert.equal(r0.net, 0);
});

test('15. Kahramanın tek başına saldırısı', () => {
  const r = sim(OASIS, 0, 0, 0, { hero: HERO });
  assert.equal(r.valid, true); assert.equal(r.off, 1460); assert.equal(r.def, 560);
  const expected = Math.pow(560, 1.5) / (Math.pow(1460, 1.5) + Math.pow(560, 1.5)) * 100;
  assert.ok(Math.abs(r.heroDamage - expected) < 1e-9);
  assert.ok(Math.abs(r.heroAfter - (65 - expected)) < 1e-9); assert.equal(r.heroDead, false);
  assert.equal(sim(OASIS, 0, 0, 0).valid, false, 'kahramansız sıfır asker geçersiz');
});

test('16. Kahraman + süvari: saldırı artar, kayıp azalır; atsız kahraman piyade sayılır', () => {
  const without = sim(OASIS, 10, 2, 2), withHero = sim(OASIS, 10, 2, 2, { hero: HERO });
  assert.equal(withHero.off, 1780 + 1460); assert.equal(withHero.def, 560);
  assert.ok(withHero.attLoss < without.attLoss); assert.ok(withHero.units[0].exactLost < 0.7);
  const foot = sim({ bat: 10 }, 10, 0, 0, { hero: { ...HERO, mounted: false, strength: 1200 } });
  assert.ok(Math.abs(foot.def - ((660 * 1200 + 500 * 1200) / 2400 + 10)) < 1e-9);
  const bonus = sim(OASIS, 10, 2, 2, { hero: { ...HERO, offBonusPct: 10 } });
  assert.ok(Math.abs(bonus.off - (1780 + 1460) * 1.1) < 1e-9);
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
  assert.ok(Math.abs(armor.heroDamage - (sim(OASIS, 0, 0, 0, { hero: HERO }).heroDamage - 4)) < 1e-9);
});

test('19. Demirci seviyeleri', () => {
  assert.equal(upgradedStat(120, 2, 0), 120);
  assert.ok(Math.abs(upgradedStat(40, 1, 20) - 52.4048) < 1e-3, 'Kirilloid örneği');
  const r = sim(OASIS, 10, 0, 0, { smithy: { steppeRider: 10 } });
  const each = 120 + (120 + 600 / 7) * (Math.pow(1.007, 10) - 1);
  assert.ok(Math.abs(r.off - each * 10) < 1e-9); assert.ok(r.off > 1200);
  assert.equal(r.uncertain.smithy, true);
  assert.equal(sim(OASIS, 0, 10, 0, { smithy: { steppeRider: 10 } }).off, 1100, 'yalnızca ilgili birim etkilenir');
});

test('20. Kahraman silah bonusu yalnızca kahraman katılırsa ve ilgili birime', () => {
  const h = { ...HERO, strength: 0.0001, weaponId: 'step2' };
  const r = sim(OASIS, 10, 2, 2, { hero: h });
  assert.ok(Math.abs(r.off - (10 * 128 + 220 + 360 + 0.0001)) < 1e-9);
  assert.equal(sim(OASIS, 10, 2, 2).off, 1780);
  assert.ok(Math.abs(sim(OASIS, 0, 5, 5, { hero: { ...h, weaponId: 'mara3' } }).off - (550 + 5 * 195 + 0.0001)) < 1e-9);
});

test('21. %50 kayıp filtresi', () => {
  const o = optimize(cfg(OASIS), [15, 2, 2]);
  const sc = createScenario(cfg(OASIS));
  for (const p of o.pareto) {
    const r = sc.evaluate(p.counts);
    assert.ok(r.lossCost === 0 || r.lossRatio < 50, JSON.stringify(p.counts));
  }
  const open = optimize(cfg(OASIS), [15, 2, 2], { maxLossRatio: null });
  assert.ok(open.stats.feasible > o.stats.feasible);
  assert.ok(o.stats.byLoss > 0);
  // Hiçbir aday geçemezse: boş öneri + filtre dışı en iyi adaylar
  const none = optimize(cfg({ elephant: 50 }), [3, 3, 3]);
  assert.equal(none.picks.balanced, undefined); assert.ok(none.rejectedBest.length > 0);
});

test('22-24. Minimum asker, maksimum net kâr, Pareto alternatifleri', () => {
  const o = optimize(cfg(OASIS), [20, 20, 20]);
  assert.equal(o.exhaustive, true); assert.equal(o.searched, 21 ** 3);
  const { maxProfit, balanced, minTroops, zeroLoss, maxEfficiency } = o.picks;
  assert.equal(maxProfit.net, 2080);
  assert.ok(balanced.net >= 0.9 * maxProfit.net); assert.ok(balanced.armyValue <= maxProfit.armyValue);
  assert.ok(minTroops.troops <= balanced.troops); assert.ok(minTroops.net >= o.threshold);
  assert.equal(zeroLoss.lossCost, 0); assert.ok(maxEfficiency.net / maxEfficiency.armyValue >= balanced.net / balanced.armyValue - 1e-12);
  assert.ok(o.pareto.length >= 3);
  // Pareto listesinde hiçbir aday bir diğerine tamamen baskın değil
  const dom = (a, b) => a.net >= b.net && a.armyValue <= b.armyValue && a.lossCost <= b.lossCost && a.troops <= b.troops
    && a.borderline <= b.borderline && (a.net > b.net || a.armyValue < b.armyValue || a.lossCost < b.lossCost || a.troops < b.troops || a.borderline < b.borderline);
  for (const a of o.pareto) for (const b of o.pareto) assert.equal(a !== b && dom(a, b), false);
});

test('25. Optimizasyon sonuçları bağımsız brute-force ile aynı', () => {
  for (const [animals, max, prefs] of [
    [OASIS, [12, 9, 11], {}],
    [{ boar: 2, wolf: 1, bear: 1 }, [14, 10, 9], { profitThresholdPct: 75 }],
    [{ rat: 12, spider: 7 }, [12, 10, 10], { maxLossRatio: 40 }],
  ]) {
    const o = optimize(cfg(animals), max, prefs);
    const P = { maxLossRatio: 50, profitThresholdPct: 90, ...prefs };
    const rows = [];
    for (let a = 0; a <= max[0]; a++) for (let b = 0; b <= max[1]; b++) for (let c = 0; c <= max[2]; c++) {
      if (a + b + c === 0) continue;
      const r = simulate(cfg(animals), { steppeRider: a, marksman: b, marauder: c });
      const armyValue = a * 895 + b * 1050 + c * 1760;
      if (r.lossCost > 0 && !(r.lossCost / r.bountyNominal * 100 < P.maxLossRatio)) continue;
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
    assert.ok(Math.abs(o.picks.maxEfficiency.net / o.picks.maxEfficiency.armyValue - eff) < 1e-12);
    const zero = rows.filter((r) => r.lossCost === 0);
    assert.equal(!!o.picks.zeroLoss, zero.length > 0);
  }
});

test('26. Taşıma kapasitesi ve normal yağma (hayvan ödülünden ayrı)', () => {
  const loot = { available: [400, 300, 200, 100] };
  const r = sim(OASIS, 10, 2, 2, { loot });
  const carry = 9 * 75 + 2 * 105 + 2 * 80; // ölen Bozkır taşıyamaz
  assert.equal(r.carry, carry); assert.equal(r.lootNominal, 1000);
  assert.equal(r.bountyNominal, 1920); assert.equal(r.gross, 2920); assert.equal(r.net, 2920 - 895);
  assert.equal((r.overallRatio).toFixed(2), (895 / 2920 * 100).toFixed(2)); assert.equal(r.lossRatio.toFixed(2), '46.61');
  const small = sim({}, 2, 0, 0, { loot }); assert.equal(small.lootNominal, 150);
  // Ağırlıklar: tahıl 2 kat değerliyse ödül 5×480
  assert.equal(sim(OASIS, 10, 2, 2, { weights: [1, 1, 1, 2] }).bounty, 480 * 5);
  assert.equal(sim(OASIS, 10, 2, 2, { weights: [1, 1, 1, 2] }).lossCost, 895 + 45);
});

test('27. x2 yolculuk süresi, Turnuva Alanı ve Hun kahraman bonusu', () => {
  assert.equal(distance({ x: 50, y: 50 }, { x: 52, y: 50 }), 2);
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(distance({ x: -200, y: 0 }, { x: 200, y: 0 }), 1, 'harita sarmalı');
  const t = (extra, s, m, r) => sim(OASIS, s, m, r, extra);
  const tr = { distance: 14, speedFactor: 2, tsLevel: 0 };
  assert.equal(t({ travel: tr }, 10, 2, 2).speed, 28);            // en yavaş: Yağmacı 14 × 2
  assert.equal(t({ travel: tr }, 10, 2, 2).hours, 1);             // 14 kare / 28 × 2 yön
  assert.equal(t({ travel: tr }, 10, 0, 0).speed, 32);
  assert.equal(t({ travel: tr }, 10, 2, 2).perHour, 1025);
  assert.equal(t({ travel: tr, hero: HERO }, 10, 2, 2).speed, (14 + 3) * 2);
  assert.equal(tripHours(30, 10, 0), 6);
  assert.ok(Math.abs(tripHours(30, 10, 5) - 2 * (2 + 10 / 20)) < 1e-12, 'TA yalnızca 20 kareden sonrasını hızlandırır');
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

test('30. Simülatör ve optimizasyon aynı motoru kullanır, aynı sonucu üretir', () => {
  const o = optimize(cfg(OASIS, { loot: { available: [100, 100, 100, 100] } }), [15, 6, 6]);
  for (const p of [...o.pareto, ...Object.values(o.picks)]) {
    const r = simulate(cfg(OASIS, { loot: { available: [100, 100, 100, 100] } }), { steppeRider: p.counts[0], marksman: p.counts[1], marauder: p.counts[2] });
    assert.equal(r.net, p.net); assert.equal(r.lossCost, p.lossCost); assert.equal(r.armyValue, p.armyValue);
  }
  // Vaha türü savaşı değiştirmez: aynı hayvanlar → aynı sonuç (motor vaha türü parametresi almaz)
  assert.deepEqual(sim(OASIS, 10, 2, 2).units, sim({ ...OASIS }, 10, 2, 2).units);
});

test('Ek: kahramanlı/kahramansız karşılaştırma ve asgari sağlık filtresi', () => {
  const res = compareHeroModes(cfg(OASIS), HERO, [12, 6, 6], { minHeroHealth: 30 });
  assert.ok(res.noHero.picks.balanced && res.withHero.picks.balanced);
  assert.equal(res.heroAlone.off, 1460);
  const sc = createScenario(cfg(OASIS, { hero: HERO }));
  for (const p of res.withHero.pareto) { const r = sc.evaluate(p.counts); assert.ok(!r.heroDead && r.heroAfter >= 30); }
  assert.ok(res.withHero.picks.lowHeroRisk.heroDamage <= res.withHero.picks.balanced.heroDamage + 1e-12);
  const strict = optimize(cfg(OASIS, { hero: HERO }), [12, 6, 6], { minHeroHealth: 64.9 });
  assert.ok(strict.stats.byHero > 0);
});

test('Ek: büyük savaş üssü, tek zayıf birim kuralı, arama sınırı, referans vakalar', () => {
  assert.equal(battleExponent(27), 1.5); assert.equal(battleExponent(1000), 1.5);
  assert.ok(Math.abs(battleExponent(3400) - 1.459) < 1e-3); assert.equal(battleExponent(1e12), 1.2578);
  const lone = simulate({ unitIds: ALL_HUN_IDS, animals: {}, mode: 'raid' }, { mercenary: 1 });
  assert.equal(lone.units[0].lost, 1, '83 saldırının altındaki tek birim ölür');
  const c = clampLimits([500, 500, 500], 1_000_000);
  assert.equal(c.limited, true); assert.ok(c.size <= 1_000_000); assert.ok(c.lim.every((v) => v >= 90));
  assert.equal(clampLimits([10, 10, 10], 1e6).limited, false);
  for (const ref of REFERENCE_CASES) assert.deepEqual(checkReference(ref).mismatches, [], ref.name);
  for (const id of OPT_UNIT_IDS) assert.equal(HUN_UNITS[id].cost.reduce((a, b) => a + b), { steppeRider: 895, marksman: 1050, marauder: 1760 }[id]);
});

test('Ek: performans — 150×150×150 eksiksiz tarama birkaç saniyenin altında', () => {
  const o = optimize(cfg({ boar: 3, wolf: 2, bear: 1 }), [150, 150, 150]);
  assert.equal(o.exhaustive, true); assert.ok(o.ms < 15000, 'süre: ' + o.ms + ' ms');
  assert.ok(o.picks.balanced);
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

test('Ek: en güvenli seçenek — yuvarlama sınırına uzak, kâr eşiğini sağlayan en ucuz ordu (brute-force ile aynı)', () => {
  for (const [animals, max] of [[OASIS, [20, 20, 20]], [{ boar: 2, wolf: 1, bear: 1 }, [14, 10, 9]], [OASIS, [15, 10, 10]]]) {
    const o = optimize(cfg(animals), max);
    const s = o.picks.safest;
    assert.ok(s, 'en güvenli seçenek var');
    const rows = [];
    for (let a = 0; a <= max[0]; a++) for (let b = 0; b <= max[1]; b++) for (let c = 0; c <= max[2]; c++) {
      if (a + b + c === 0) continue;
      const r = simulate(cfg(animals), { steppeRider: a, marksman: b, marauder: c });
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
    // Rapordaki uzaklık, optimizasyonun bildirdiğiyle aynı
    const rep = simulate(cfg(animals), { steppeRider: s.counts[0], marksman: s.counts[1], marauder: s.counts[2] });
    assert.ok(Math.abs(rep.margin - s.margin) < 1e-12);
  }
  // Uzaklık ölçüsü: 10/2/2 → Bozkır kaybı 1,49994 (sınırın dibinde), 1/1/1 vs 410 → tam sınırda
  assert.ok(sim(OASIS, 10, 2, 2).margin < 0.001); assert.equal(sim({ rat: 20 }, 1, 1, 1).margin, 0);
  // Güvenli uzaklık ayarı sonucu değiştirir
  const strict = optimize(cfg(OASIS, { rules: { safeMargin: 0.45 } }), [20, 20, 20]).picks.safest;
  const loose = optimize(cfg(OASIS, { rules: { safeMargin: 0.05 } }), [20, 20, 20]).picks.safest;
  assert.ok(loose.armyValue <= strict.armyValue);
});

test('Ek: demirci formülü yapılandırılabilir', () => {
  const R = (x) => ({ ...DEFAULT_RULES, ...x });
  assert.ok(Math.abs(upgradedStat(120, 2, 5) - (120 + (120 + 600 / 7) * (Math.pow(1.007, 5) - 1))) < 1e-12);
  assert.equal(upgradedStat(120, 2, 5, R({ smithyRound: 'round' })), 127);
  assert.equal(upgradedStat(120, 2, 5, R({ smithyRound: 'floor' })), 127);
  assert.ok(Math.abs(upgradedStat(100, 2, 10, R({ smithyFormula: 'percent', smithyPercent: 1.5 })) - 100 * Math.pow(1.015, 10)) < 1e-12);
  assert.ok(Math.abs(upgradedStat(120, 2, 5, R({ smithyBase: 1.01, smithyUpkeepCoef: 0 })) - 120 * Math.pow(1.01, 5)) < 1e-12);
  // Senaryo, kendisine verilen kuralları kullanır; seviye 0'da formül etkisizdir
  const a = sim(OASIS, 10, 0, 0, { smithy: { steppeRider: 5 }, rules: { smithyRound: 'round' } });
  assert.equal(a.off, 1270);
  const b = sim(OASIS, 10, 0, 0, { smithy: { steppeRider: 5 }, rules: { smithyFormula: 'percent', smithyPercent: 2 } });
  assert.ok(Math.abs(b.off - 1200 * Math.pow(1.02, 5)) < 1e-9);
  assert.equal(sim(OASIS, 10, 2, 2, { rules: { smithyFormula: 'percent', smithyPercent: 9 } }).off, 1780);
});

test('Ek: iki dil — veri adları ve iletiler', () => {
  for (const id of ANIMAL_IDS) { assert.ok(ANIMALS[id].tr && ANIMALS[id].en, id); }
  for (const id of ALL_HUN_IDS) { assert.ok(HUN_UNITS[id].tr && HUN_UNITS[id].en, id); }
  for (const w of Object.values(HUN_WEAPONS)) assert.ok(w.tr && w.en, w.id);
  for (const o of Object.values(OASIS_TYPES)) assert.ok(o.tr && o.en, o.id);
  assert.equal(HUN_WEAPONS.step2.unit, 'steppeRider'); assert.equal(HUN_WEAPONS.step2.perUnit, 8); assert.equal(HUN_WEAPONS.mara3.strength, 4000);
  setLang('en');
  try {
    assert.equal(L('a', 'b'), 'b'); assert.equal(nameOf(ANIMALS.rat), 'Rat'); assert.equal(nameOf(HUN_UNITS.marauder), 'Marauder');
    assert.match(normalizeRecognition({ animals: [{ id: 'dragon', count: 1 }] }).warnings[0], /Unknown unit/);
    assert.match(checkReference({ mode: 'raid', units: { steppeRider: 10, marksman: 2, marauder: 2 }, animals: OASIS, expected: { lost: { steppeRider: 5 } } }).mismatches[0], /engine 1, game 5/);
  } finally { setLang('tr'); }
  assert.equal(nameOf(ANIMALS.rat), 'Sıçan');
});

test('Ek: kayıpsız garantili ordu — en az asker, brute-force ile aynı ve daha az hayvanda da kayıpsız', () => {
  const WORST = { rat: 6, spider: 2, bat: 4 }; // şu anki 3/1/2 + doğabilecek 3/1/2 → süvari savunması 400 + 10
  const max = [30, 30, 30];
  const o = findNoLossArmy(cfg(WORST), max);
  const g = o.picks.guarded, st = o.picks.strict, ch = o.picks.cheapest;
  assert.ok(g && st && ch); assert.equal(o.exhaustive, true); assert.equal(o.need, null);
  assert.equal(o.guard, DEFAULT_RULES.safeMargin);
  // Bağımsız tarama (rapor üzerinden)
  let bg = null, bs = null, bc = null;
  for (let a = 0; a <= max[0]; a++) for (let b = 0; b <= max[1]; b++) for (let c = 0; c <= max[2]; c++) {
    if (a + b + c === 0) continue;
    const r = sim(WORST, a, b, c);
    if (r.units.some((u) => u.lost > 0)) continue;
    const mx = Math.max(...r.units.map((u) => u.exactLost)), row = { tr: a + b + c, av: r.armyValue };
    const less = (x, y) => !y || x.tr < y.tr || (x.tr === y.tr && x.av < y.av);
    if (less(row, bs)) bs = row;
    if (mx <= 0.5 - 0.1 + 1e-12) { if (less(row, bg)) bg = row; if (!bc || row.av < bc.av || (row.av === bc.av && row.tr < bc.tr)) bc = row; }
  }
  assert.deepEqual([g.troops, g.armyValue], [bg.tr, bg.av]);
  assert.deepEqual([st.troops, st.armyValue], [bs.tr, bs.av]);
  assert.deepEqual([ch.troops, ch.armyValue], [bc.tr, bc.av]);
  assert.ok(st.troops <= g.troops); assert.ok(ch.armyValue <= g.armyValue);
  assert.ok(g.maxExact <= 0.4 + 1e-12); assert.ok(Math.abs(g.margin - (0.5 - g.maxExact)) < 1e-12);
  // Garanti: en kötü durumun HER alt kümesinde (daha az hayvan) kayıp sıfır
  for (let r = 0; r <= 6; r++) for (let s = 0; s <= 2; s++) for (let b = 0; b <= 4; b++) {
    const rep = sim({ rat: r, spider: s, bat: b }, g.counts[0], g.counts[1], g.counts[2]);
    assert.equal(rep.lossCost, 0, `${r}/${s}/${b}`); assert.ok(rep.units.every((u) => u.lost === 0));
  }
  // "Kayıpsız kalınan azami savunma": en kötü durum bu sınırın altında; sınırın üstünde garanti bozulur
  assert.ok(g.def <= g.safeDef + 1e-9 && g.safeDef <= g.ruleDef);
  const tooMany = { rat: Math.ceil(g.ruleDef / 20) + 1 }; // 20×n + 10 > kural sınırı
  assert.ok(sim(tooMany, g.counts[0], g.counts[1], g.counts[2]).lossCost > 0);
});

test('Ek: kayıpsız kalınan azami savunma formülü ve "gereken ordu" araması', () => {
  // 2/2/2 → saldırı 820; her türden 2 asker → kayıp oranı ≤ %25 → savunma ≤ 820 × 3^(−2/3) ≈ 394,2
  const lim = maxSafeDefence(820, 2, 1.5, 'raid', 0);
  assert.ok(Math.abs(lim - 820 * Math.pow(3, -2 / 3)) < 1e-9);
  assert.equal(sim({ rat: 19 }, 2, 2, 2).lossCost, 0);        // savunma 390
  assert.ok(sim({ rat: 20 }, 2, 2, 2).lossCost > 0);          // savunma 410
  assert.ok(maxSafeDefence(820, 2, 1.5, 'raid', 0.1) < lim);
  assert.ok(Math.abs(maxSafeDefence(1000, 4, 1.5, 'attack', 0) - 1000 * Math.pow(0.125, 1 / 1.5)) < 1e-9);
  assert.equal(maxSafeDefence(1460, 0, 1.5, 'raid', 0.1), null, 'yalnız kahraman: asker kaybı yok');
  // Eldeki asker yetmezse: gereken en küçük ordu genişletilmiş aramayla bulunur
  const o = findNoLossArmy(cfg(OASIS), [5, 5, 5]);
  assert.equal(o.picks.guarded, null); assert.ok(o.need && o.need.pick);
  const n = o.need.pick, rep = sim(OASIS, n.counts[0], n.counts[1], n.counts[2]);
  assert.equal(rep.lossCost, 0); assert.ok(n.troops > 15); assert.ok(Math.max(...rep.units.map((u) => u.exactLost)) <= 0.4 + 1e-12);
  // Bir asker eksiği artık paylı garantiyi sağlamaz (en az askerli olduğunun kanıtı: aynı sayıda daha iyi yok)
  const again = findNoLossArmy(cfg(OASIS), n.counts);
  assert.deepEqual(again.picks.guarded.counts, n.counts);
  // Kahramanla: kahraman güvenliği süzgeci uygulanır; yalnız kahraman yetiyorsa asker gerekmez
  const h = findNoLossArmy(cfg({ rat: 2 }, { hero: HERO }), [5, 5, 5]);
  assert.equal(h.picks.guarded.troops, 0); assert.equal(h.hasHero, true);
  const weak = findNoLossArmy(cfg(OASIS, { hero: { ...HERO, health: 5 } }), [5, 5, 5], { minHeroHealth: 30 });
  assert.equal(weak.picks.guarded, null);
});
