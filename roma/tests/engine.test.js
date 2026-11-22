// Doğrulama testleri — Romalı sürümü. Savaş motoru Hun/Cermen araçlarıyla aynıdır; burada Romalı birim
// verisi (a) elle hesaplanmış değerlerle ve (b) bu dosyadaki BAĞIMSIZ referans hesapla (refBattle) sınanır.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, createScenario, upgradedStat, DEFAULT_RULES } from '../src/engine/battle.js';
import { L, nameOf, setLang } from '../src/i18n.js';
import { optimize, compareHeroModes, findNoLossArmy, maxSafeDefence } from '../src/optimizer/optimizer.js';
import { OPT_UNIT_IDS, OPT_TRIOS, OPT_CANDIDATE_IDS, ALL_UNIT_IDS, UNITS, WEAPONS } from '../src/data/units.js';
import { ANIMALS, ANIMAL_IDS } from '../src/data/nature.js';
import { tripHours } from '../src/engine/travel.js';
import { parseAnimalText, normalizeRecognition, parseCoords, normalizeHero } from '../src/vision/parse.js';
import { REFERENCE_CASES, checkReference } from '../src/data/references.js';
import { descriptorDistance, segmentColumns, classifyIcon, mergeTemplates, decodeDescriptor, encodeDescriptor, bonusToOasisType, parseBonusPercent, parseTitleCoords } from '../src/vision/icons.js';
import { SEED_ICON_TEMPLATES } from '../src/data/icon-templates.js';

// OASIS: piyadeye karşı 3×25 + 35 + 9×66 = 704 (+10), süvariye karşı 3×20 + 40 + 9×50 = 550 (+10)
const OASIS = { rat: 3, spider: 1, bat: 9 };
const S1 = { rat: 4, spider: 2 }, S2 = { boar: 2, wolf: 1, bear: 1 }, S3 = { rat: 12, spider: 7 };
const cfg = (animals, extra = {}) => ({ unitIds: OPT_UNIT_IDS, smithy: {}, hero: null, animals, mode: 'raid', ...extra });
/** i: Emperyan, e: Equites Imperatoris, c: Equites Caesaris (varsayılan üçlü) */
const sim = (animals, i, e, c, extra) => simulate(cfg(animals, extra), { imperian: i, equitesImperatoris: e, equitesCaesaris: c });
const lost = (r, id) => (r.units.find((u) => u.id === id) || { lost: 0 }).lost;
const killed = (r, id) => (r.animals.find((a) => a.id === id) || { killed: 0 }).killed;
const HERO = { strength: 1460, offBonusPct: 0, health: 65, mounted: true, speed: 14, weaponId: 'none', armorReduction: 0 };
const COST = { legionnaire: 400, praetorian: 460, imperian: 600, equitesLegati: 360, equitesImperatoris: 1410, equitesCaesaris: 2170 };
const near = (x, y, eps = 1e-9) => Math.abs(x - y) < eps;

/** Motordan bağımsız referans: kahramansız yağma, demirci 0, ≤1000 birim (K = 1,5), herhangi bir üçlü. */
function refBattle(animals, counts, ids = OPT_UNIT_IDS) {
  let inf = 0, cav = 0;
  ids.forEach((id, k) => { const v = UNITS[id].attack * counts[k]; if (UNITS[id].cavalry) cav += v; else inf += v; });
  const off = inf + cav;
  let dI = 0, dC = 0;
  for (const [id, n] of Object.entries(animals)) { dI += ANIMALS[id].defInf * n; dC += ANIMALS[id].defCav * n; }
  const def = (dI * inf + dC * cav) / off + 10;
  let x = Math.pow(def, 1.5) / (Math.pow(off, 1.5) + Math.pow(def, 1.5));
  if (counts.reduce((a, b) => a + b, 0) === 1 && off < 83) x = 1;
  const rnd = (e, tieUp) => { const f = Math.floor(e), fr = e - f; return Math.abs(fr - 0.5) < 1e-9 ? (tieUp ? f + 1 : f) : fr > 0.5 ? f + 1 : f; };
  const lostU = counts.map((n) => Math.min(n, rnd(n * x, false)));
  let up = 0; const k = {};
  for (const [id, n] of Object.entries(animals)) { k[id] = Math.min(n, rnd(n * (1 - x), true)); up += k[id] * ANIMALS[id].upkeep; }
  const lossCost = lostU.reduce((t, l, j) => t + l * COST[ids[j]], 0);
  return { off, def, x, lost: lostU, killed: k, bounty: up * 160, lossCost, net: up * 160 - lossCost };
}

test('Birim verisi: maliyet, piyade/süvari, silahlar, üçlüler', () => {
  for (const id of Object.keys(COST)) assert.equal(UNITS[id].cost.reduce((x, y) => x + y), COST[id], id);
  assert.equal(UNITS.legionnaire.cavalry, false); assert.equal(UNITS.imperian.cavalry, false); assert.equal(UNITS.praetorian.cavalry, false);
  assert.equal(UNITS.equitesImperatoris.cavalry, true); assert.equal(UNITS.equitesCaesaris.cavalry, true); assert.equal(UNITS.equitesLegati.cavalry, true);
  assert.deepEqual(OPT_UNIT_IDS, ['imperian', 'equitesImperatoris', 'equitesCaesaris']);
  assert.deepEqual(Object.keys(OPT_TRIOS).sort(), ['iec', 'lec', 'lic', 'lie']);
  for (const ids of Object.values(OPT_TRIOS)) { assert.equal(ids.length, 3); for (const id of ids) assert.ok(OPT_CANDIDATE_IDS.includes(id)); }
  for (const w of Object.values(WEAPONS)) assert.ok(w.unit === null || UNITS[w.unit], w.id);
  assert.equal(WEAPONS.ec3.perUnit, 15); assert.equal(WEAPONS.ei2.perUnit, 8); assert.equal(WEAPONS.leg1.perUnit, 3); assert.equal(WEAPONS.imp3.strength, 4000);
  assert.deepEqual(REFERENCE_CASES, []);
});

test('Elle hesaplanmış Romalı savaşları ve bağımsız referansla birebir uyum', () => {
  const imp = sim(OASIS, 10, 0, 0);
  assert.equal(imp.off, 700); assert.equal(imp.def, 714, 'yalnız piyade → piyade savunması + 10');
  const ei = sim(OASIS, 0, 10, 0);
  assert.equal(ei.off, 1200); assert.equal(ei.def, 560, 'yalnız süvari → süvari savunması + 10');
  const mix = sim(OASIS, 10, 0, 5); // piyade 700, süvari 900
  assert.equal(mix.off, 1600); assert.ok(near(mix.def, (704 * 700 + 550 * 900) / 1600 + 10));
  for (const animals of [OASIS, S1, S2, S3, { crocodile: 2, tiger: 1 }, { elephant: 1, snake: 4 }]) {
    for (const c of [[10, 0, 0], [0, 10, 0], [0, 0, 10], [25, 5, 3], [40, 0, 6], [7, 13, 2], [60, 30, 20], [3, 1, 1], [1, 1, 1], [0, 0, 40]]) {
      const r = sim(animals, ...c), e = refBattle(animals, c), tag = JSON.stringify([animals, c]);
      assert.ok(near(r.off, e.off) && near(r.def, e.def) && near(r.attLoss, e.x, 1e-12), tag);
      assert.deepEqual([lost(r, 'imperian'), lost(r, 'equitesImperatoris'), lost(r, 'equitesCaesaris')], e.lost, tag);
      for (const id of Object.keys(animals)) assert.equal(killed(r, id), e.killed[id], tag + id);
      assert.equal(r.bountyNominal, e.bounty, tag); assert.equal(r.lossCost, e.lossCost, tag); assert.equal(r.net, e.net, tag);
    }
  }
  // Pretoryan, Lejyoner ve keşif birimi Simülatör'de çalışır
  const all = simulate({ unitIds: ALL_UNIT_IDS, animals: { rat: 2 }, mode: 'raid' }, { legionnaire: 5, praetorian: 5, equitesLegati: 2 });
  assert.equal(all.off, 5 * 40 + 5 * 30);
  // Tek zayıf birim kuralı: 83 saldırının altındaki tek birim ölür
  assert.equal(simulate({ unitIds: ALL_UNIT_IDS, animals: {}, mode: 'raid' }, { imperian: 1 }).units[0].lost, 1);
  assert.equal(simulate({ unitIds: ALL_UNIT_IDS, animals: {}, mode: 'raid' }, { equitesImperatoris: 1 }).units[0].lost, 0);
});

test('Optimizasyon sonuçları bağımsız brute-force ile aynı (varsayılan üçlü)', () => {
  for (const [animals, max, prefs] of [[S1, [30, 15, 8], {}], [S2, [30, 15, 8], { profitThresholdPct: 75 }], [S3, [30, 15, 8], { maxLossRatio: 40 }]]) {
    const o = optimize(cfg(animals), max, prefs);
    const P = { maxLossRatio: 50, profitThresholdPct: 90, ...prefs };
    const rows = [];
    for (let a = 0; a <= max[0]; a++) for (let b = 0; b <= max[1]; b++) for (let c = 0; c <= max[2]; c++) {
      if (a + b + c === 0) continue;
      const r = refBattle(animals, [a, b, c]);
      if (r.lossCost > 0 && !(r.lossCost / r.bounty * 100 < P.maxLossRatio)) continue;
      if (!(r.net > 0)) continue;
      rows.push({ net: r.net, armyValue: a * 600 + b * 1410 + c * 2170, troops: a + b + c });
    }
    assert.equal(o.stats.feasible, rows.length); assert.ok(rows.length > 5, 'yeterli aday');
    const maxNet = Math.max(...rows.map((r) => r.net));
    assert.equal(o.picks.maxProfit.net, maxNet);
    const good = rows.filter((r) => r.net >= maxNet * P.profitThresholdPct / 100 - 1e-9);
    assert.equal(o.picks.balanced.armyValue, Math.min(...good.map((r) => r.armyValue)));
    assert.equal(o.picks.minTroops.troops, Math.min(...good.map((r) => r.troops)));
    // Olasılıklar çubuğunun kullandığı aday listesi: her aday motorla yeniden üretilebilir
    for (const p of o.pareto) { const e = refBattle(animals, p.counts); assert.equal(p.net, e.net); assert.equal(p.troops, p.counts[0] + p.counts[1] + p.counts[2]); }
  }
});

test('Bütün birim üçlüleri optimizasyonda çalışır ve motorla tutarlıdır', () => {
  for (const ids of Object.values(OPT_TRIOS)) {
    const o = optimize(cfg(S1, { unitIds: ids }), [30, 15, 10]);
    assert.ok(o.picks.balanced, ids.join());
    const c = o.picks.balanced.counts, r = simulate(cfg(S1, { unitIds: ids }), Object.fromEntries(ids.map((id, k) => [id, c[k]])));
    assert.equal(r.net, o.picks.balanced.net); assert.equal(r.net, refBattle(S1, c, ids).net);
  }
});

test('Kayıpsız garanti: en az asker, brute-force ile aynı, daha az hayvanda da kayıpsız', () => {
  const WORST = { rat: 6, spider: 2, boar: 3 };
  const max = [20, 20, 20];
  const o = findNoLossArmy(cfg(WORST), max);
  const g = o.picks.guarded;
  assert.ok(g); assert.equal(o.exhaustive, true);
  let best = null;
  for (let a = 0; a <= max[0]; a++) for (let b = 0; b <= max[1]; b++) for (let c = 0; c <= max[2]; c++) {
    if (a + b + c === 0) continue;
    const r = sim(WORST, a, b, c);
    if (r.units.some((u) => u.lost > 0)) continue;
    if (Math.max(...r.units.map((u) => u.exactLost)) > 0.4 + 1e-12) continue;
    const row = { tr: a + b + c, av: r.armyValue };
    if (!best || row.tr < best.tr || (row.tr === best.tr && row.av < best.av)) best = row;
  }
  assert.deepEqual([g.troops, g.armyValue], [best.tr, best.av]);
  for (let r = 0; r <= 6; r++) for (let s = 0; s <= 2; s++) for (let b = 0; b <= 3; b++) {
    const rep = sim({ rat: r, spider: s, boar: b }, g.counts[0], g.counts[1], g.counts[2]);
    assert.equal(rep.lossCost, 0, `${r}/${s}/${b}`);
  }
  assert.ok(g.def <= g.safeDef + 1e-9 && g.safeDef <= g.ruleDef);
  assert.equal(maxSafeDefence(1460, 0, 1.5, 'raid', 0.1), null);
});

test('Kahraman: güç ekler, silah bonusu yalnızca kahramanla ve ilgili birime', () => {
  const withH = sim(OASIS, 10, 0, 0, { hero: HERO });
  assert.equal(withH.off, 700 + 1460);
  assert.ok(near(withH.def, (704 * 700 + 550 * 1460) / 2160 + 10));
  const h = { ...HERO, strength: 0.0001 };
  assert.ok(near(sim(OASIS, 0, 5, 5, { hero: { ...h, weaponId: 'ec3' } }).off, 600 + 5 * 195 + 0.0001));
  assert.ok(near(sim(OASIS, 0, 5, 5, { hero: { ...h, weaponId: 'ei1' } }).off, 5 * 126 + 900 + 0.0001));
  assert.equal(sim(OASIS, 0, 5, 5).off, 600 + 900);
  const res = compareHeroModes(cfg(S3), HERO, [30, 15, 8], { minHeroHealth: 30 });
  assert.ok(res.noHero.picks.balanced && res.withHero.picks.balanced);
});

test('Yolculuk: Romalı kahramanında hız bonusu yok; en yavaş birim belirler', () => {
  const tr = { distance: 12, speedFactor: 2, tsLevel: 0 };
  assert.equal(sim(OASIS, 10, 2, 2, { travel: tr }).speed, 14);   // Emperyan 7 × 2
  assert.equal(sim(OASIS, 0, 10, 0, { travel: tr }).speed, 28);   // Imperatoris 14 × 2
  assert.equal(sim(OASIS, 0, 5, 5, { travel: tr }).speed, 20);    // Caesaris 10 × 2
  assert.equal(sim(OASIS, 0, 10, 0, { travel: tr, hero: HERO }).speed, 28, 'kahraman (14) bonus eklemez');
  assert.ok(near(tripHours(30, 10, 5), 2 * (2 + 10 / 20), 1e-12));
});

test('Demirci formülü Romalı birimlerine uygulanır', () => {
  const r = sim(OASIS, 0, 0, 10, { smithy: { equitesCaesaris: 10 } });
  const each = 180 + (180 + 4 * 300 / 7) * (Math.pow(1.007, 10) - 1);
  assert.ok(near(r.off, each * 10)); assert.equal(r.uncertain.smithy, true);
  assert.equal(sim(OASIS, 10, 0, 0, { smithy: { equitesCaesaris: 10 } }).off, 700, 'yalnızca ilgili birim etkilenir');
  assert.ok(near(upgradedStat(70, 1, 20), 70 + (70 + 300 / 7) * (Math.pow(1.007, 20) - 1)));
});

test('İki dil: Romalı birim ve silah adları', () => {
  for (const id of ALL_UNIT_IDS) assert.ok(UNITS[id].tr && UNITS[id].en, id);
  for (const w of Object.values(WEAPONS)) assert.ok(w.tr && w.en, w.id);
  setLang('en');
  try { assert.equal(L('a', 'b'), 'b'); assert.equal(nameOf(UNITS.imperian), 'Imperian'); assert.equal(nameOf(UNITS.catapult), 'Fire Catapult'); }
  finally { setLang('tr'); }
  assert.equal(nameOf(UNITS.legionnaire), 'Lejyoner');
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
