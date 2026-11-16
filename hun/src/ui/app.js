// Arayüz (TR/EN). Savaş hesabı içermez: her sonuç battle.js / optimizer.js üzerinden üretilir.
import { HUN_UNITS, ALL_HUN_IDS, OPT_UNIT_IDS, HUN_WEAPONS } from '../data/units.js';
import { ANIMALS, ANIMAL_IDS, OASIS_TYPES, OASIS_TYPE_IDS } from '../data/nature.js';
import { REFERENCE_CASES, checkReference, battleKey } from '../data/references.js';
import { createScenario, upgradedStat, DEFAULT_RULES } from '../engine/battle.js';
import { distance, tripHours, formatHours, estimateOasisStock } from '../engine/travel.js';
import { compareHeroModes, findNoLossArmy } from '../optimizer/optimizer.js';
import { parseAnimalText, parseCoords } from '../vision/parse.js';
import { recognizeWithClaude, VISION_MODELS } from '../vision/claude.js';
import { recognizeIconScreenshot, decodeDescriptor, descriptorDistance } from '../vision/icons.js';
import { loadState, saveState, importState, DEFAULT_STATE } from './store.js';
import { L, nameOf, setLang, getLang, locale } from '../i18n.js';

let S = loadState();
setLang(S.ui.lang);
const T = { tab: 'oasis', result: null, simReport: null, busy: false, progress: 0, image: null, iconRows: null, visionMsg: null, visionBusy: false, lastReport: null, heroImage: null, toast: null, noLoss: null, nlBusy: false };
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n == null || !isFinite(n) ? '—' : new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(Math.round(n)));
const dec = (n, d = 1) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const signed = (n) => (n > 0 ? '+' : '') + fmt(n);
const pct = (n, d = 1) => (n == null || !isFinite(n) ? '—' : getLang() === 'en' ? dec(n, d) + '%' : '%' + dec(n, d));
const num = (v, def = 0) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : def; };
const int = (v) => Math.max(0, Math.floor(num(v)));
function setPath(p, v) { const ks = p.split('.'); const last = ks.pop(); const o = ks.reduce((x, k) => (x[k] ??= {}), S); o[last] = v; }
const persist = () => { if (!saveState(S)) toast(L('Kayıt başarısız (depolama dolu olabilir).', 'Saving failed (storage may be full).')); };
function toast(msg) { T.toast = msg; renderToast(); clearTimeout(toast.t); toast.t = setTimeout(() => { T.toast = null; renderToast(); }, 3800); }
function renderToast() { const el = $('#toast'); el.textContent = T.toast || ''; el.hidden = !T.toast; }
const RES = () => [L('Odun', 'Wood'), L('Kil', 'Clay'), L('Demir', 'Iron'), L('Tahıl', 'Crop')];

// ---------- Tema ----------
const systemDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
const currentTheme = () => S.ui.theme || (systemDark() ? 'dark' : 'light');
function applyTheme() {
  const t = currentTheme();
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t === 'dark' ? '#0f1114' : '#ffffff';
}

// ---------- Senaryo kurulumu (Simülatör ve Optimizasyon aynı fonksiyonu kullanır) ----------
const coordsOk = (c) => c && c.x !== '' && c.y !== '' && isFinite(+c.x) && isFinite(+c.y);
function rulesCfg() {
  const r = S.prefs.rules;
  return {
    smithyFormula: r.smithyFormula === 'percent' ? 'percent' : 't4', smithyBase: num(r.smithyBase, DEFAULT_RULES.smithyBase) || DEFAULT_RULES.smithyBase,
    smithyUpkeepCoef: num(r.smithyUpkeepCoef, DEFAULT_RULES.smithyUpkeepCoef), smithyPercent: num(r.smithyPercent, DEFAULT_RULES.smithyPercent),
    smithyRound: ['round', 'floor'].includes(r.smithyRound) ? r.smithyRound : 'none', safeMargin: Math.min(0.49, Math.max(0.01, num(r.safeMargin, DEFAULT_RULES.safeMargin))),
  };
}
function travelCfg() {
  if (!coordsOk(S.profile.village) || !coordsOk(S.oasis.coords)) return null;
  const d = distance({ x: +S.profile.village.x, y: +S.profile.village.y }, { x: +S.oasis.coords.x, y: +S.oasis.coords.y });
  return d > 0 ? { distance: d, speedFactor: num(S.profile.unitSpeedFactor, 1) || 1, tsLevel: int(S.profile.tsLevel) } : null;
}
function heroCfg() {
  const h = S.profile.hero;
  return { strength: num(h.strength), offBonusPct: num(h.offBonusPct), health: num(h.health, 100), mounted: !!h.mounted, speed: num(h.speed, 14), weaponId: h.weaponId, armorReduction: num(h.armorReduction) };
}
function baseConfig(unitIds, mode) {
  return {
    unitIds, smithy: S.profile.smithy, hero: null, mode, rules: rulesCfg(),
    animals: Object.fromEntries(ANIMAL_IDS.map((id) => [id, int(S.oasis.animals[id])]).filter(([, v]) => v > 0)),
    otherAttackBonusPct: num(S.profile.otherAttackBonusPct),
    loot: { available: S.oasis.stock.map((v) => int(v)), lootablePct: num(S.oasis.lootablePct, 100) },
    weights: S.prefs.weights.map((w) => num(w, 1)), travel: travelCfg(), extraCost: num(S.prefs.extraCost),
  };
}
// Yeniden doğma payı: en kötü durum = şu anki hayvanlar + gece doğabilecekler (kullanıcının girdiği üst sınır)
const spawnOf = (id) => int((S.oasis.spawn || {})[id]);
function worstAnimals() { return Object.fromEntries(ANIMAL_IDS.map((id) => [id, int(S.oasis.animals[id]) + spawnOf(id)]).filter(([, v]) => v > 0)); }
const animalsLine = (an) => ANIMAL_IDS.filter((id) => an[id] > 0).map((id) => `${ANIMALS[id].icon} ${an[id]}`).join(' &nbsp;') || L('hayvan yok', 'no animals');
function prefsCfg() {
  return { maxLossRatio: S.prefs.lossFilterOn ? num(S.prefs.maxLossRatio, 50) : null, requireProfit: !!S.prefs.requireProfit, profitThresholdPct: Math.min(100, Math.max(50, num(S.prefs.profitThresholdPct, 90))), minHeroHealth: num(S.prefs.minHeroHealth, 30) };
}

// ---------- Güvenilirlik durumu ----------
function statusOf(rep) {
  const refs = [...REFERENCE_CASES, ...S.refs];
  const plain = !rep.hero && !rep.uncertain.smithy && !num(S.profile.otherAttackBonusPct);
  if (plain) {
    const key = battleKey(rep.mode, Object.fromEntries(rep.units.map((u) => [u.id, u.sent])), Object.fromEntries(rep.animals.map((a) => [a.id, a.count])));
    const ref = refs.find((r) => battleKey(r.mode, r.units, r.animals) === key);
    if (ref && checkReference(ref).ok) return { cls: 'ok', label: L('Doğrulanmış', 'Verified'), text: L('Aynı parametrelerle oyun kaynağıyla birebir eşleşiyor: ', 'Matches a game source exactly with the same parameters: ') + (getLang() === 'en' && ref.en ? ref.en : ref.name) };
  }
  const why = [];
  if (rep.borderAtt) why.push(L('bir asker türünün kaybı 0,5 yuvarlama sınırına çok yakın', 'one troop type’s loss is very close to the 0.5 rounding boundary'));
  if (rep.borderDef) why.push(L('bir hayvan türünün kaybı yuvarlama sınırına çok yakın', 'one animal type’s loss is very close to the rounding boundary'));
  if (rep.hero) why.push(L('kahraman can kaybı doğrulanmamış bir model tahminidir', 'hero health loss is an unverified model estimate'));
  if (rep.uncertain.smithy) why.push(L('demirci formülü yapılandırılabilir bir varsayımdır', 'the smithy formula is a configurable assumption'));
  if (rep.uncertain.largeBattle) why.push(L('büyük savaş üssü (K) kullanıldı', 'the large-battle exponent (K) was used'));
  if (rep.borderline || rep.hero) return { cls: 'warn', label: L('Dikkat / sınırda', 'Caution / borderline'), text: L('Küçük farklar sonucu değiştirebilir: ', 'Small differences could change the result: ') + why.join('; ') + '.' };
  return { cls: 'est', label: L('Matematiksel tahmin', 'Mathematical estimate'), text: L('Kaynaklardaki formüllerle hesaplandı; bu savaş oyunla birebir karşılaştırılmadı.', 'Computed with the published formulas; this battle was not compared with the game.') + (why.length ? ' ' + L('Not: ', 'Note: ') + why.join('; ') + '.' : '') };
}

// ---------- Sonuç kartı ----------
function armyLine(rep) {
  const parts = OPT_UNIT_IDS.concat(ALL_HUN_IDS.filter((i) => !OPT_UNIT_IDS.includes(i))).map((id) => rep.units.find((u) => u.id === id)).filter(Boolean).map((u) => `<b>${u.sent}</b> ${esc(nameOf(u))}`);
  if (rep.hero) parts.push(`<b>${L('Kahraman', 'Hero')}</b>`);
  return parts.join(' + ') || '—';
}
function sentence(rep) {
  const lostTxt = rep.units.filter((u) => u.lost > 0).map((u) => `${u.lost} ${nameOf(u)}`).join(', ') || L('yok', 'none');
  const u = (id) => (rep.units.find((x) => x.id === id) || { sent: 0 }).sent;
  const ratio = rep.lossRatio == null ? L('uygulanamaz', 'n/a') : pct(rep.lossRatio, 2);
  if (getLang() === 'en') {
    return `Send <b>${u('steppeRider')}</b> Steppe Riders, <b>${u('marksman')}</b> Marksmen, <b>${u('marauder')}</b> Marauders. <b>${rep.hero ? 'Include' : 'Do not include'}</b> the hero. Expected troop loss: <b>${esc(lostTxt)}</b>${rep.hero ? `, hero health loss: <b>${pct(rep.heroDamage)}</b> (estimate)` : ''}. Total net profit: <b>${signed(rep.net)}</b>, economic loss ratio: <b>${ratio}</b>.`;
  }
  return `<b>${u('steppeRider')}</b> Bozkır Atlısı, <b>${u('marksman')}</b> Nişancı, <b>${u('marauder')}</b> Yağmacı gönder. Kahramanı <b>${rep.hero ? 'dahil et' : 'dahil etme'}</b>. Beklenen asker kaybı: <b>${esc(lostTxt)}</b>${rep.hero ? `, kahraman can kaybı: <b>${pct(rep.heroDamage)}</b> (tahmin)` : ''}. Toplam net kâr: <b>${signed(rep.net)}</b>, ekonomik kayıp oranı: <b>${ratio}</b>.`;
}
const row = (k, v, cls = '') => `<div class="kv ${cls}"><span>${k}</span><b>${v}</b></div>`;
function explain(rep) {
  const lines = [
    `${L('Saldırı', 'Attack')} = ${rep.units.map((u) => `${u.sent}×${+u.attackEach.toFixed(2)}`).join(' + ') || '0'}${rep.hero ? ` + ${L('kahraman', 'hero')} ${fmt(rep.hero.strength)}` : ''}${rep.hero && rep.hero.offBonusPct ? ` (×${1 + rep.hero.offBonusPct / 100})` : ''} = <b>${fmt(rep.off)}</b>`,
    `${L('Savunma', 'Defence')} = ${rep.animals.map((a) => `${a.count} ${nameOf(a)}`).join(' + ') || L('hayvan yok', 'no animals')} ${L('(saldırının piyade/süvari payına göre)', '(weighted by the infantry/cavalry share of the attack)')} + ${rep.rules.baseDefense} ${L('taban', 'base')} = <b>${fmt(rep.def)}</b>`,
    rep.mode === 'raid'
      ? `${L('Yağma', 'Raid')}: x = (${fmt(Math.min(rep.def, rep.off))}/${fmt(Math.max(rep.def, rep.off))})^${rep.K.toFixed(4)}; ${L('saldırgan kaybı', 'attacker loss')} = ${rep.off >= rep.def ? 'x/(1+x)' : '1/(1+x)'} = <b>${pct(rep.attLoss * 100, 3)}</b>, ${L('hayvan kaybı', 'animal loss')} = <b>${pct(rep.defLoss * 100, 3)}</b>`
      : `${L('Normal saldırı', 'Normal attack')} (K=${rep.K.toFixed(4)}): ${L('saldırgan kaybı', 'attacker loss')} <b>${pct(rep.attLoss * 100, 3)}</b>, ${L('hayvan kaybı', 'animal loss')} <b>${pct(rep.defLoss * 100, 3)}</b>`,
    ...rep.units.map((u) => `${esc(nameOf(u))}: ${u.sent} × ${pct(rep.attLoss * 100, 3)} = ${dec(u.exactLost, 3)} → <b>${u.lost}</b> ${L('ölü', 'dead')}`),
    ...rep.animals.map((a) => `${esc(nameOf(a))}: ${a.count} × ${pct(rep.defLoss * 100, 3)} = ${dec(a.exactKilled, 3)} → <b>${a.killed}</b> ${L('ölü', 'dead')} (${L('ödül', 'bounty')} ${fmt(a.killed * a.upkeep * 160)})`),
    L('Her tür ayrı yuvarlanır; tam 0,5 saldırganda aşağı (resmî Hun rehberi), hayvanda yukarı (varsayım) yuvarlanır.', 'Each type is rounded separately; an exact 0.5 rounds down for the attacker (official Hun guide) and up for animals (assumption).'),
    `${L('Yuvarlama sınırına en yakın kesir uzaklığı', 'Closest distance to the rounding boundary')}: <b>${dec(rep.margin, 3)}</b> (${L('0 = tam sınırda, 0,5 = en uzak', '0 = exactly on it, 0.5 = farthest')})`,
  ];
  return `<ol class="explain">${lines.map((l) => `<li>${l}</li>`).join('')}</ol>`;
}
function resultCard(rep, ctx = {}) {
  if (!rep || !rep.valid) return `<div class="card"><p class="muted">${L('Geçerli bir saldırı yok: en az bir asker veya kahraman gerekli.', 'No valid attack: at least one troop or the hero is required.')}</p></div>`;
  const st = statusOf(rep);
  const killedTxt = rep.animals.length ? rep.animals.map((a) => `${a.icon} ${a.killed}/${a.count}`).join(' &nbsp;') : L('hayvan yok', 'no animals');
  const lostTxt = rep.units.filter((u) => u.lost > 0).map((u) => `${u.lost} ${esc(nameOf(u))}`).join(', ') || L('Kayıp yok', 'No losses');
  const max = ctx.maxNet, base = ctx.maxProfitTroops, est = `<i>(${L('tahmin', 'estimate')})</i>`;
  const lim = S.prefs.lossFilterOn ? pct(num(S.prefs.maxLossRatio), 0) : L('kapalı', 'off');
  const na = L('uygulanamaz', 'n/a');
  return `<div class="card result">
  <div class="card-h"><h3>${esc(ctx.title || L('Savaş sonucu', 'Battle result'))}</h3><span class="badge ${st.cls}">${st.label}</span></div>
  ${ctx.sentence ? `<p class="sentence">${sentence(rep)}</p>` : `<p class="army">${armyLine(rep)}</p>`}
  <p class="status-text">${esc(st.text)}</p>
  <div class="grid2">
   <div><h4>${L('Savaş sonucu', 'Battle result')}</h4>
    ${row(L('Saldırı gücü', 'Attack strength'), fmt(rep.off))}${row(L('Savunma gücü', 'Defence strength'), fmt(rep.def))}
    ${row(L('Öldürülen hayvanlar', 'Animals killed'), killedTxt)}${row(L('Kaybedilen askerler', 'Troops lost'), lostTxt, rep.lossCost > 0 ? 'neg' : 'pos')}
    ${rep.hero ? row(`${L('Kahraman can kaybı', 'Hero health loss')} ${est}`, pct(rep.heroDamage)) + row(L('Kahraman savaş sonrası', 'Hero after battle'), rep.heroDead ? L('☠ ÖLÜR', '☠ DIES') : pct(rep.heroAfter) + ` (${L('önce', 'before')} ${pct(rep.hero.health, 0)})`, rep.heroDead ? 'neg' : '') : ''}
    ${row(L('Hayvan ödülü', 'Animal bounty'), fmt(rep.bountyNominal) + (rep.bountyNominal ? ` <small>(4×${fmt(rep.bountyPerResource)})</small>` : ''))}
    ${row(L('Normal yağma', 'Regular loot'), fmt(rep.lootNominal) + ` <small>(${L('kapasite', 'capacity')} ${fmt(rep.carry)})</small>`)}
    ${row(L('Asker kayıp maliyeti', 'Cost of lost troops'), fmt(rep.lossCostNominal), rep.lossCost > 0 ? 'neg' : '')}
    ${rep.extraCost ? row(L('Ek gerçek giderler', 'Extra real costs'), fmt(rep.extraCost)) : ''}
    ${row(L('Net kâr', 'Net profit'), signed(rep.net), rep.net > 0 ? 'pos big' : 'neg big')}
   </div>
   <div><h4>${L('Ekonomik verimlilik', 'Economic efficiency')}</h4>
    ${row(L('Kayıp oranı (hayvan ödülüne)', 'Loss ratio (vs animal bounty)'), rep.lossRatio == null ? na : pct(rep.lossRatio, 2), rep.lossRatio != null && S.prefs.lossFilterOn && rep.lossRatio >= num(S.prefs.maxLossRatio) ? 'neg' : '')}
    ${row(L('İzin verilen azami kayıp', 'Maximum allowed loss'), lim)}
    ${row(L('Genel kayıp oranı (ödül+yağma)', 'Overall loss ratio (bounty+loot)'), rep.overallRatio == null ? na : pct(rep.overallRatio, 2))}
    ${row(L('Gönderilen toplam asker', 'Total troops sent'), fmt(rep.troops))}
    ${row(L('Bağlanan ordu değeri', 'Army value committed'), fmt(rep.armyValue))}
    ${row(L('Ordu sermaye verimliliği', 'Army capital efficiency'), rep.efficiency == null ? '—' : pct(rep.efficiency, 2))}
    ${row(L('Asker başına net kâr', 'Net profit per troop'), rep.perTroop == null ? '—' : fmt(rep.perTroop))}
    ${row(L('Yuvarlama sınırına uzaklık', 'Distance from rounding boundary'), dec(rep.margin, 3), rep.margin < rep.rules.borderMargin ? 'neg' : rep.margin >= rep.rules.safeMargin ? 'pos' : '')}
    ${max ? row(L('En yüksek net kâra göre', 'Relative to maximum net profit'), pct((rep.net / max) * 100, 1)) : ''}
    ${base != null && base > 0 ? row(L('Asker tasarrufu (en kârlı orduya göre)', 'Troops saved (vs most profitable army)'), `${fmt(base - rep.troops)} (${pct((1 - rep.troops / base) * 100, 0)})`) : ''}
    ${rep.hours ? row(`${L('Gidiş-dönüş', 'Round trip')} ${est}`, formatHours(rep.hours)) + row(L('Saatlik net kâr (tek döngü)', 'Net profit per hour (one cycle)'), fmt(rep.perHour)) : ''}
   </div>
  </div>
  <details><summary>${L('Hesaplama nasıl yapıldı?', 'How was this calculated?')}</summary>${explain(rep)}</details>
  ${ctx.extra || ''}</div>`;
}

// ---------- Sekme: VAHA ----------
function animalGrid() {
  const typ = S.oasis.type && OASIS_TYPES[S.oasis.type] ? OASIS_TYPES[S.oasis.type].typical : [];
  return `<div class="animals">${ANIMAL_IDS.map((id) => {
    const a = ANIMALS[id], v = int(S.oasis.animals[id]), c = S.oasis.conf[id], nm = nameOf(a);
    return `<div class="animal ${v > 0 ? 'on' : ''} ${c && c.confidence === 'low' ? 'low' : ''}">
      <label for="an-${id}"><span class="ico">${a.icon}</span> ${nm}${typ.includes(id) ? ` <small title="${L('Bu vaha türünde yaygın', 'Common in this oasis type')}">•</small>` : ''}</label>
      <div class="stepper"><button data-act="dec" data-id="${id}" aria-label="${nm} −">−</button>
      <input id="an-${id}" type="number" inputmode="numeric" min="0" value="${v || ''}" placeholder="0" data-animal="${id}">
      <button data-act="inc" data-id="${id}" aria-label="${nm} +">+</button></div>
      ${c ? `<small class="conf ${c.confidence}">${c.confidence === 'high' ? L('okundu', 'read') : L('⚠ kontrol et', '⚠ check')}${c.note ? ' — ' + esc(c.note) : ''}</small>` : ''}
    </div>`; }).join('')}</div>`;
}
function iconRowsEditor() {
  if (!T.iconRows || !T.iconRows.length) return '';
  return `<div class="iconrows"><p class="muted">${L('Görüntüden kesilen ikonlar. Yanlış veya tanınmamış olanı düzeltin; seçiminiz bu cihazda öğrenilir ve sonraki görüntülerde otomatik tanınır.', 'Icons cropped from the image. Correct any that are wrong or unrecognised; your choice is learned on this device and recognised automatically next time.')}</p>${T.iconRows.map((r, i) => `<div class="iconrow ${r.id && r.confidence === 'high' ? '' : 'low'}">
    <img src="${r.thumb}" alt="${L('Görüntüden kesilen ikon', 'Icon cropped from the image')} ${i + 1}">
    <select data-iconrow-sel="${i}" aria-label="${L('İkon', 'Icon')} ${i + 1}: ${L('hayvan türü', 'animal type')}"><option value="">${L('— hayvanı seçin —', '— pick the animal —')}</option>${ANIMAL_IDS.map((id) => `<option value="${id}" ${r.id === id ? 'selected' : ''}>${ANIMALS[id].icon} ${nameOf(ANIMALS[id])}</option>`).join('')}</select>
    <input type="number" inputmode="numeric" min="0" value="${r.count}" data-iconrow-count="${i}" aria-label="${L('İkon', 'Icon')} ${i + 1}: ${L('adet', 'count')}">
    ${r.note ? `<small class="conf low">⚠ ${esc(r.note)}</small>` : `<small class="conf high">${L('tanındı', 'recognised')}</small>`}</div>`).join('')}</div>`;
}
function applyIconRows() {
  S.oasis.animals = {}; S.oasis.conf = {};
  for (const r of T.iconRows) {
    if (!r.id) continue;
    S.oasis.animals[r.id] = int(S.oasis.animals[r.id]) + int(r.count);
    S.oasis.conf[r.id] = { confidence: r.confidence, note: r.note };
  }
  T.result = T.noLoss = null;
}
function learnIcon(rowItem) {
  // Aynı ikon daha önce başka bir hayvan olarak öğrenildiyse (yanlış seçim düzeltmesi) o kayıt silinir.
  for (const k of Object.keys(S.iconTemplates)) S.iconTemplates[k] = S.iconTemplates[k].filter((t) => t !== rowItem.descriptor);
  const list = (S.iconTemplates[rowItem.id] ??= []);
  const d = decodeDescriptor(rowItem.descriptor);
  if (!list.some((t) => descriptorDistance(decodeDescriptor(t), d) < 4)) { list.push(rowItem.descriptor); if (list.length > 8) list.shift(); }
}
function oasisDefense() {
  const an = ANIMAL_IDS.reduce((s, id) => s + int(S.oasis.animals[id]) * ANIMALS[id].defCav, 0);
  const up = ANIMAL_IDS.reduce((s, id) => s + int(S.oasis.animals[id]) * ANIMALS[id].upkeep, 0);
  return L(`Süvariye karşı savunma: <b>${fmt(an + 10)}</b> (hayvanlar ${fmt(an)} + 10 taban) · Hepsi ölürse ödül: <b>${fmt(up * 160)}</b>`, `Defence vs cavalry: <b>${fmt(an + 10)}</b> (animals ${fmt(an)} + 10 base) · Bounty if all die: <b>${fmt(up * 160)}</b>`);
}
const seg = (act, cur, opts, cls = '') => `<div class="seg ${cls}" role="group">${opts.map(([k, l]) => `<button data-act="${act}" data-id="${k}" class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>`;
const modeOpts = () => [['raid', L('Yağma', 'Raid')], ['attack', L('Normal saldırı', 'Normal attack')]];
function tabOasis() {
  const v = T.visionMsg, p = S.profile;
  return `
  <section class="card">
    <div class="card-h"><h3>1 · ${L('Vaha ekran görüntüsü', 'Oasis screenshot')}</h3></div>
    <div class="row">
      <label class="btn file">📷 ${L('Görüntü seç', 'Choose image')}<input type="file" accept="image/*" id="img-oasis" hidden></label>
      <button class="btn" data-act="vision-ocr" ${T.image && !T.visionBusy ? '' : 'disabled'}>${L('Cihazda tanı', 'Recognise on device')} <small>(${L('ikon + sayı', 'icon + count')})</small></button>
      <button class="btn ghost" data-act="vision-ai" ${T.image && !T.visionBusy ? '' : 'disabled'}>${L('Yapay zekâ ile tanı', 'Recognise with AI')}</button>
    </div>
    ${T.image ? `<img class="thumb" src="${T.image.url}" alt="${L('Yüklenen vaha görüntüsü', 'Uploaded oasis screenshot')}">` : `<p class="muted">${L('Vahaya tıklayınca açılan, hayvanların listelendiği pencerenin görüntüsünü yükleyin. Tanıma olmadan da aşağıdan elle girebilirsiniz.', 'Upload a screenshot of the oasis window that lists the animals. You can also enter them manually below.')}</p>`}
    ${T.visionBusy ? `<p class="muted">${L('Tanınıyor…', 'Recognising…')}</p>` : ''}
    ${v ? `<div class="note ${v.cls}">${v.html}</div>` : ''}
    ${iconRowsEditor()}
    <details><summary>${L('Metinden oku (yapıştır)', 'Read from text (paste)')}</summary>
      <textarea id="paste-text" rows="3" placeholder="${L('Örn.&#10;3 Sıçan&#10;1 Örümcek&#10;9 Yarasa', 'E.g.&#10;3 Rats&#10;1 Spider&#10;9 Bats')}"></textarea>
      <button class="btn ghost" data-act="parse-text">${L('Metni uygula', 'Apply text')}</button></details>
  </section>
  <section class="card">
    <div class="card-h"><h3>2 · ${L('Vahadaki hayvanlar', 'Animals in the oasis')}</h3><button class="link" data-act="clear-animals">${L('Temizle', 'Clear')}</button></div>
    ${animalGrid()}
    <p class="muted" id="def-line">${oasisDefense()}</p>
    <details ${S.oasis.type || coordsOk(S.oasis.coords) ? 'open' : ''}><summary>${L('Vaha bilgisi, koordinat ve birikmiş hammadde', 'Oasis details, coordinates and stored resources')}</summary>
      <div class="fields">
        <label>${L('Vaha türü', 'Oasis type')} <small>(${L('savaşı etkilemez', 'does not affect combat')})</small><select data-bind="oasis.type" data-rerender>
          <option value="">${L('— seçilmedi —', '— not selected —')}</option>${OASIS_TYPE_IDS.map((id) => `<option value="${id}" ${S.oasis.type === id ? 'selected' : ''}>${nameOf(OASIS_TYPES[id])}</option>`).join('')}</select></label>
        <label>${L('Vaha X', 'Oasis X')}<input type="number" inputmode="numeric" data-bind="oasis.coords.x" data-raw value="${esc(S.oasis.coords.x)}"></label>
        <label>${L('Vaha Y', 'Oasis Y')}<input type="number" inputmode="numeric" data-bind="oasis.coords.y" data-raw value="${esc(S.oasis.coords.y)}"></label>
      </div>
      <p class="muted">${L('Normal yağma için vahada birikmiş (bilinen/tahmini) hammadde:', 'Resources stored in the oasis (known/estimated), for regular loot:')}</p>
      <div class="fields four">${RES().map((n, i) => `<label>${n}<input type="number" inputmode="numeric" min="0" data-bind="oasis.stock.${i}" value="${int(S.oasis.stock[i]) || ''}" placeholder="0"></label>`).join('')}</div>
      <div class="row"><label class="inline">${L('Son temizlikten beri saat', 'Hours since last cleared')}<input type="number" inputmode="decimal" min="0" data-bind="oasis.hours" value="${num(S.oasis.hours) || ''}" placeholder="0"></label>
      <button class="btn ghost" data-act="estimate-stock" ${S.oasis.type ? '' : 'disabled'}>${L('Üretimden tahmin et', 'Estimate from production')}</button>
      <button class="btn ghost" data-act="save-oasis">${L('Vahayı listeye kaydet', 'Save oasis to list')}</button></div>
    </details>
  </section>
  <section class="card">
    <div class="card-h"><h3>3 · ${L('Ordu ve kahraman', 'Army and hero')}</h3><button class="link" data-tab="profile">${L('Profili düzenle', 'Edit profile')}</button></div>
    <p class="muted">${L('Kullanılabilir', 'Available')}: ${OPT_UNIT_IDS.map((id) => `<b>${int(p.troops[id])}</b> ${nameOf(HUN_UNITS[id])}${int(p.smithy[id]) ? ` <small>(${L('demirci', 'smithy')} ${int(p.smithy[id])})</small>` : ''}`).join(' · ')} — ${L('Kahraman: güç', 'Hero: strength')} ${fmt(num(p.hero.strength))}, ${L('sağlık', 'health')} ${pct(num(p.hero.health), 0)}</p>
    ${seg('hero-mode', S.prefs.heroMode, [['none', L('Kahramansız', 'No hero')], ['with', L('Kahramanla', 'With hero')], ['alone', L('Yalnız kahraman', 'Hero alone')]])}
    ${seg('attack-mode', S.prefs.attackMode, modeOpts(), 'small')}
    <button class="btn primary big" data-act="optimize" ${T.busy || T.nlBusy ? 'disabled' : ''}>${T.busy ? `${L('Hesaplanıyor…', 'Calculating…')} ${Math.round(T.progress * 100)}%` : L('⚔ En İyi Kadroyu Bul', '⚔ Find the Best Army')}</button>
  </section>
  ${noLossCard()}
  <div id="results">${renderResults()}</div>`;
}
function noLossCard() {
  const typ = S.oasis.type && OASIS_TYPES[S.oasis.type] ? OASIS_TYPES[S.oasis.type].typical : [];
  const any = ANIMAL_IDS.some((id) => spawnOf(id) > 0), worst = worstAnimals();
  const defCav = ANIMAL_IDS.reduce((t, id) => t + (worst[id] || 0) * ANIMALS[id].defCav, 0);
  return `<section class="card" id="noloss-card">
    <div class="card-h"><h3>4 · ${L('Kayıpsız garanti (yeniden doğma payı)', 'No-loss guarantee (respawn allowance)')}</h3>${any ? `<button class="link" data-act="spawn-clear">${L('Sıfırla', 'Reset')}</button>` : ''}</div>
    <p class="muted">${L('Geceleyin yeni hayvan doğsa bile hiç asker kaybetmeden yağmalayan en az askerli orduyu bulur. Aşağıya, şu ankilere EK olarak en fazla kaç hayvan doğabileceğini yazın.', 'Finds the smallest army that raids without losing a single troop even if new animals spawn overnight. Enter below how many animals may spawn AT MOST, in addition to the current ones.')}</p>
    <details ${any ? 'open' : ''}><summary>${L('En fazla doğabilecek hayvanlar', 'Animals that may spawn at most')}${any ? '' : ` <small>(${L('boşsa yalnızca şu anki hayvanlar', 'if empty: current animals only')})</small>`}</summary>
      <div class="fields four spawn">${ANIMAL_IDS.map((id) => `<label>${ANIMALS[id].icon} ${nameOf(ANIMALS[id])}${typ.includes(id) ? ' <small>•</small>' : ''}<input type="number" inputmode="numeric" min="0" data-bind="oasis.spawn.${id}" value="${spawnOf(id) || ''}" placeholder="+0"></label>`).join('')}</div>
      <div class="row"><button class="btn ghost" data-act="spawn-copy">${L('Şu ankiler kadar daha (×2)', 'As many again as now (×2)')}</button></div>
      <p class="muted">${L('Doğma hızı ve sayısı resmî kaynaklarda yok; araç bunu bilemez. Birkaç sabah gördüğünüz en kalabalık hâli esas alın ve biraz pay bırakın. • işaretli hayvanlar bu vaha türünde yaygındır.', 'Spawn rate and numbers are not published; the tool cannot know them. Use the most crowded state you have seen over a few mornings and leave some slack. Animals marked • are common in this oasis type.')}</p>
    </details>
    <p class="muted">${L('En kötü durum', 'Worst case')}: ${animalsLine(worst)} — ${L('süvariye karşı savunma', 'defence vs cavalry')} <b>${fmt(defCav + 10)}</b></p>
    <button class="btn primary big" data-act="no-loss" ${T.nlBusy ? 'disabled' : ''}>${T.nlBusy ? `${L('Hesaplanıyor…', 'Calculating…')} ${Math.round(T.progress * 100)}%` : L('🛡 Kayıpsız Garantili Kadroyu Bul', '🛡 Find the Guaranteed No-Loss Army')}</button>
    <div id="noloss-out">${renderNoLoss()}</div>
  </section>`;
}
function repWorst(counts, withHero, animals) {
  const cfg = baseConfig(OPT_UNIT_IDS, S.prefs.attackMode);
  cfg.animals = animals; cfg.hero = withHero ? heroCfg() : null;
  return createScenario(cfg).report(counts);
}
function renderNoLoss() {
  const N = T.noLoss;
  if (!N) return '';
  if (N.error) return `<div class="note bad">${esc(N.error)}</div>`;
  const withHero = N.hasHero, g = N.picks.guarded, st = N.picks.strict, ch = N.picks.cheapest, gd = dec(N.guard, 2);
  const names = OPT_UNIT_IDS.map((id) => nameOf(HUN_UNITS[id]));
  const line = (pk) => armyLine(repWorst(pk.counts, withHero, N.worst));
  const scope = `${N.exhaustive ? L('Eksiksiz arama', 'Exhaustive search') : L('SINIRLI arama', 'LIMITED search')}: 0–${N.limits[0]} ${names[0]} × 0–${N.limits[1]} ${names[1]} × 0–${N.limits[2]} ${names[2]}, ${N.ms} ms.`;
  const scopeP = `<p class="muted">${scope}</p>`;
  const assume = `<p class="muted">${L('Garanti şu şartla geçerlidir: sabah vahada, yukarıdaki en kötü durumdan fazla hayvan olmamalı. Daha az hayvan varsa kayıp yine sıfırdır (savunma düşer). Emin olmak için sabah vahanın savunmasına bakın: yukarıdaki "kayıpsız kalınan azami savunma"yı geçmiyorsa gönderin.', 'The guarantee holds on one condition: in the morning the oasis must not hold more animals than the worst case above. With fewer animals the loss is still zero (defence is lower). To be sure, check the oasis defence in the morning: send if it does not exceed the "highest defence without losses" above.')} ${scope}</p>`;
  if (!g) {
    let h = `<div class="note bad">${L('Elinizdeki askerle bu en kötü duruma karşı kayıpsız garanti yok.', 'With your available troops there is no no-loss guarantee against this worst case.')}`;
    if (N.need && N.need.pick) h += ` ${L('Gereken en küçük ordu', 'Smallest army required')}: ${line(N.need.pick)} (${fmt(N.need.pick.troops)} ${L('asker', 'troops')}).`;
    else h += ` ${L(`Her türden ${N.need ? N.need.limits.join('/') : '—'} askere kadar arandı, yine bulunamadı; en kötü durumu küçültün ya da kahramanı ekleyin.`, `Searched up to ${N.need ? N.need.limits.join('/') : '—'} of each type without success; reduce the worst case or add the hero.`)}`;
    h += '</div>';
    if (st) h += `<div class="note warn">${L('Yalnızca yuvarlama kuralına göre kayıpsız (pay yok)', 'Loss-free by the rounding rule only (no slack)')}: ${line(st)} — ${L('en büyük kesirli kayıp', 'largest fractional loss')} ${dec(st.maxExact, 3)} / 0,5. ${L('Sınıra bu kadar yakınken küçük bir fark 1 asker götürebilir.', 'This close to the boundary a small difference can cost a troop.')}</div>`;
    return h + scopeP;
  }
  const worstRep = repWorst(g.counts, withHero, N.worst);
  const hasNow = ANIMAL_IDS.some((id) => int(S.oasis.animals[id]) > 0), nowRep = hasNow ? repWorst(g.counts, withHero, baseConfig(OPT_UNIT_IDS, S.prefs.attackMode).animals) : null;
  let h = `<div class="result nl">
    <div class="card-h"><h4>${L('Kayıpsız garantili ordu', 'Guaranteed no-loss army')}</h4><span class="badge ok">${L('0 kayıp', '0 losses')}</span></div>
    <p class="sentence">${g.troops ? `${L(`${line(g)} gönder`, `Send ${line(g)}`)} — ${L('toplam', 'total')} <b>${fmt(g.troops)}</b> ${L('asker', 'troops')}.` : L('Kahraman tek başına yeter; asker göndermeye gerek yok.', 'The hero alone is enough; no troops needed.')}</p>
    ${row(L('Saldırı gücü', 'Attack strength'), fmt(g.off))}
    ${row(L('En kötü durumda savunma', 'Defence in the worst case'), fmt(g.def))}
    ${g.safeDef != null ? row(L('Kayıpsız kalınan azami savunma', 'Highest defence without losses'), `<b>${fmt(Math.floor(g.safeDef))}</b> <small>(${L('kural sınırı', 'rule limit')} ${fmt(Math.floor(g.ruleDef))})</small>`, 'pos') : ''}
    ${g.troops ? row(L('En kötü durumda en büyük kesirli kayıp', 'Largest fractional loss in the worst case'), `${dec(g.maxExact, 3)} <small>(${L('0,5’te 1 asker ölür; hedef', 'a troop dies at 0.5; target')} ≤ ${dec(0.5 - N.guard, 2)})</small>`) : ''}
    ${row(L('Bağlanan ordu değeri', 'Army value committed'), fmt(g.armyValue))}
    ${withHero ? row(`${L('Kahraman can kaybı (en kötü durum)', 'Hero health loss (worst case)')} <i>(${L('tahmin', 'estimate')})</i>`, pct(g.heroDamage)) : ''}
    ${row(L('En kötü durumda öldürülen', 'Killed in the worst case'), worstRep.animals.map((a) => `${a.icon} ${a.killed}/${a.count}`).join(' &nbsp;') + ` · ${L('ödül', 'bounty')} ${fmt(worstRep.bountyNominal)}`)}
    ${nowRep ? row(L('Şu anki hayvanlara karşı', 'Against the current animals'), nowRep.animals.map((a) => `${a.icon} ${a.killed}/${a.count}`).join(' &nbsp;') + ` · ${L('net', 'net')} ${signed(nowRep.net)}`) : ''}
  </div>`;
  if (ch && ch.counts.join() !== g.counts.join()) h += `<div class="note">${L('Aynı garantiyle en ucuz ordu', 'Cheapest army with the same guarantee')}: ${line(ch)} — ${fmt(ch.troops)} ${L('asker, ordu değeri', 'troops, army value')} ${fmt(ch.armyValue)} (${L('yukarıdaki', 'above')}: ${fmt(g.armyValue)}).</div>`;
  if (st && st.troops < g.troops) h += `<div class="note warn">${L('Pay bırakmadan asgari', 'Bare minimum without slack')}: ${line(st)} (${fmt(st.troops)} ${L('asker', 'troops')}) — ${L('en büyük kesirli kayıp', 'largest fractional loss')} ${dec(st.maxExact, 3)} / 0,5. ${L(`Kurala göre kayıpsız, ama sınıra yakın; önerilen ordu ${gd} pay bırakır (Ayarlar → güvenli uzaklık).`, `Loss-free by the rule but close to the boundary; the recommended army keeps a ${gd} slack (Settings → safe distance).`)}</div>`;
  if (worstRep.uncertain.smithy || withHero) h += `<div class="note warn">${[worstRep.uncertain.smithy ? L('Demirci formülü bir varsayımdır; oyundaki saldırı değerinizle karşılaştırın.', 'The smithy formula is an assumption; compare with your in-game attack value.') : '', withHero ? L('Kahraman her savaşta can kaybeder; garanti yalnızca askerler içindir.', 'The hero loses health in every battle; the guarantee covers troops only.') : ''].filter(Boolean).join(' ')}</div>`;
  h += `<details><summary>${L('En kötü duruma karşı savaşın ayrıntısı', 'Battle details against the worst case')}</summary>${resultCard(worstRep, { title: L('En kötü durum', 'Worst case') })}</details>`;
  return h + assume;
}

const PICKS = () => ({
  balanced: [L('Dengeli öneri', 'Balanced pick'), L('Az askerle yüksek kâr: en yüksek net kârın eşik yüzdesini sağlayan, en az ordu sermayesi bağlayan kadro.', 'High profit with few troops: the army that reaches the profit threshold while committing the least army value.')],
  safest: [L('En güvenli', 'Safest'), L('Kâr eşiğini sağlayan kadrolar içinde, bütün kesirli kayıpları 0,5 yuvarlama sınırından güvenli uzaklıkta olan en ucuz ordu (öyle bir kadro yoksa sınıra en uzak olan).', 'Among armies that reach the profit threshold, the cheapest one whose fractional losses all sit a safe distance from the 0.5 rounding boundary (or, if none does, the one farthest from it).')],
  maxProfit: [L('En yüksek net kâr', 'Highest net profit'), L('Kayıp sınırına uyan en yüksek mutlak kâr (eşitlikte daha ucuz ordu).', 'The highest absolute profit within the loss limit (cheaper army on ties).')],
  minTroops: [L('Minimum asker', 'Fewest troops'), L('Kâr eşiğini sağlayan en az sayıda asker.', 'The smallest number of troops that reaches the profit threshold.')],
  zeroLoss: [L('Sıfır asker kaybı', 'Zero troop loss'), L('Hiç asker kaybetmeyen en ekonomik küçük ordu.', 'The most economical small army that loses no troops.')],
  maxEfficiency: [L('En yüksek sermaye verimliliği', 'Highest capital efficiency'), L('Net kâr / bağlanan ordu değeri en yüksek kadro.', 'The army with the highest net profit per army value committed.')],
  lowHeroRisk: [L('En düşük kahraman riski', 'Lowest hero risk'), L('Kâr eşiğini sağlarken kahramanın en az can kaybettiği kadro.', 'The army that reaches the profit threshold with the least hero health loss.')],
  maxPerHour: [L('En yüksek saatlik kâr', 'Highest profit per hour'), L('Tek döngüde saat başına en yüksek net kâr (yolculuk süresi tahmini).', 'The highest net profit per hour in one cycle (travel time is an estimate).')],
  smallArmy: [L('Küçük ordu fırsatı', 'Small-army opportunity'), L('En yüksek kârın en az %75’ini, en kârlı ordunun en çok %20’si kadar askerle sağlar.', 'At least 75% of the maximum profit with at most 20% of the most profitable army’s troops.')],
});
const PICK_ORDER = ['balanced', 'safest', 'maxProfit', 'minTroops', 'zeroLoss', 'maxEfficiency', 'lowHeroRisk', 'maxPerHour', 'smallArmy'];
function repFor(counts, withHero) {
  const cfg = baseConfig(OPT_UNIT_IDS, S.prefs.attackMode);
  cfg.hero = withHero ? heroCfg() : null;
  return createScenario(cfg).report(counts);
}
function renderResults() {
  const R = T.result;
  if (!R) return '';
  if (R.error) return `<div class="card"><div class="note bad">${esc(R.error)}</div></div>`;
  const hm = R.heroMode, opt = hm === 'with' ? R.withHero : R.noHero, withHero = hm === 'with', PL = PICKS();
  let h = '';
  if (hm === 'alone') {
    const rep = R.heroAlone, p = prefsCfg();
    const unsafe = rep.heroDead || rep.heroAfter < p.minHeroHealth;
    T.lastReport = rep;
    h += resultCard(rep, { title: L('Kahraman tek başına', 'Hero alone'), sentence: true, extra: unsafe ? `<div class="note bad">${L('Güvenli değil: ', 'Not safe: ')}${rep.heroDead ? L('kahramanın ölmesi bekleniyor', 'the hero is expected to die') : L(`savaş sonrası sağlık asgari sınırın (${pct(p.minHeroHealth, 0)}) altında`, `health after battle is below the minimum (${pct(p.minHeroHealth, 0)})`)}. ${L('Can hesabı doğrulanmamış bir tahmindir.', 'The health figure is an unverified estimate.')}</div>` : '' });
  } else {
    const [sr, mk, mr] = OPT_UNIT_IDS.map((id) => nameOf(HUN_UNITS[id]));
    const scope = `${opt.exhaustive ? L('Eksiksiz arama', 'Exhaustive search') : L('SINIRLI arama', 'LIMITED search')}: 0–${opt.limits[0]} ${sr} × 0–${opt.limits[1]} ${mk} × 0–${opt.limits[2]} ${mr} = ${fmt(opt.searched)} ${L('kombinasyon', 'combinations')}, ${opt.ms} ms. ${opt.exhaustive ? L('Sonuçlar bu sınırlar içinde kesin optimumdur (motor modeline göre).', 'Within these limits the results are the exact optimum (for the engine model).') : L(`İstenen sınırlar (${opt.requested.join('/')}) çok büyük olduğu için küçültüldü; sonuç kesin optimum olmayabilir.`, `The requested limits (${opt.requested.join('/')}) were too large and were reduced; the result may not be the exact optimum.`)}`;
    const picks = opt.picks, mode = picks[S.prefs.pickMode] ? S.prefs.pickMode : 'balanced';
    const main = picks[mode];
    if (!main) {
      const st = opt.stats, lim = S.prefs.lossFilterOn ? pct(num(S.prefs.maxLossRatio), 0) : L('kapalı', 'off');
      const nothing = ANIMAL_IDS.every((id) => !int(S.oasis.animals[id])) && !S.oasis.stock.some((v) => int(v) > 0);
      h += `<div class="card"><div class="card-h"><h3>${L('Uygun kadro bulunamadı', 'No suitable army found')}</h3></div>
        <div class="note bad">${L(`Filtreleri geçen kombinasyon yok. Değerlendirilen ${fmt(st.evaluated)} adaydan ${fmt(st.byLoss)} tanesi kayıp oranı sınırına (${lim}), ${fmt(st.byProfit)} tanesi kâr şartına${withHero ? `, ${fmt(st.byHero)} tanesi kahraman güvenliğine` : ''} takıldı.`, `No combination passes the filters. Of ${fmt(st.evaluated)} candidates, ${fmt(st.byLoss)} failed the loss-ratio limit (${lim}), ${fmt(st.byProfit)} the profit requirement${withHero ? `, ${fmt(st.byHero)} hero safety` : ''}.`)}
        ${nothing ? L(' Vahada hayvan ve birikmiş hammadde girilmediği için kazanılacak bir şey yok.', ' No animals or stored resources were entered, so there is nothing to gain.') : L(' Bu vaha mevcut ordunuzla ekonomik değil; daha fazla asker, kahraman veya daha yüksek kayıp sınırı deneyebilirsiniz.', ' This oasis is not economical with your current army; try more troops, the hero, or a higher loss limit.')}</div>
        <p class="muted">${scope}</p>
        ${opt.rejectedBest.length ? `<h4>${L('Filtre dışı en iyi adaylar', 'Best candidates outside the filters')}</h4>${opt.rejectedBest.map((c) => altRow(repFor(c.counts, withHero), { tag: { loss: L('kayıp oranı', 'loss ratio'), profit: L('kârsız', 'no profit'), hero: L('kahraman riski', 'hero risk') }[c.reason] })).join('')}` : ''}</div>`;
    } else {
      const rep = repFor(main.counts, withHero);
      T.lastReport = rep;
      const ctx = { maxNet: opt.maxNet, maxProfitTroops: picks.maxProfit.troops };
      const sf = picks.safest, sm = rulesCfg().safeMargin;
      let extra = `<p class="muted">${PL[mode][1]} ${L('Kâr eşiği: en yüksek net kârın', 'Profit threshold:')} ${pct(opt.prefs.profitThresholdPct, 0)} ${L('düzeyi', 'of the maximum net profit')} (≥ ${fmt(opt.threshold)}). ${scope}</p>`;
      if (sf && mode !== 'safest' && rep.margin < sm && sf.counts.join() !== main.counts.join()) {
        extra += `<div class="note warn">${L('Bu öneri yuvarlama sınırına yakın', 'This pick is close to the rounding boundary')} (${dec(rep.margin, 3)}). ${L('En güvenli alternatif', 'Safest alternative')}: ${armyLine(repFor(sf.counts, withHero))} — ${L('net', 'net')} ${signed(sf.net)}, ${L('sınıra uzaklık', 'distance')} ${dec(sf.margin, 3)}.</div>`;
      }
      if (sf && !sf.meetsSafeMargin) extra += `<div class="note warn">${L(`Bu asker sınırları içinde, kâr eşiğini sağlayıp yuvarlama sınırından en az ${dec(sm, 2)} uzakta kalan bir kadro yok. "En güvenli" seçenek, bulunabilen en uzak kadrodur (${dec(sf.margin, 3)}).`, `Within these troop limits no army both reaches the profit threshold and stays at least ${dec(sm, 2)} from the rounding boundary. "Safest" is the farthest one available (${dec(sf.margin, 3)}).`)}</div>`;
      if (!picks.zeroLoss) extra += `<div class="note">${L('Bu sınırlar içinde sıfır asker kaybı veren uygun bir kadro yok.', 'No suitable army with zero troop loss exists within these limits.')}</div>`;
      if (picks.smallArmy) extra += `<div class="note ok">${PL.smallArmy[0]}: ${armyLine(repFor(picks.smallArmy.counts, withHero))} — ${L('net', 'net')} ${signed(picks.smallArmy.net)} (${pct((picks.smallArmy.net / opt.maxNet) * 100, 0)} ${L('kâr', 'of the profit')}, ${pct((picks.smallArmy.troops / picks.maxProfit.troops) * 100, 0)} ${L('asker', 'of the troops')}).</div>`;
      h += resultCard(rep, { ...ctx, title: L('Önerilen ordu — ', 'Recommended army — ') + PL[mode][0], sentence: true, extra });
      h += `<div class="card"><div class="card-h"><h3>${L('Alternatif stratejiler', 'Alternative strategies')}</h3></div>` +
        PICK_ORDER.filter((k) => picks[k]).map((k) => altRow(repFor(picks[k].counts, withHero), { tag: PL[k][0], ctx, active: k === mode, pick: k })).join('') + `</div>`;
      const used = new Set(PICK_ORDER.filter((k) => picks[k]).map((k) => picks[k].counts.join('/')));
      const others = opt.pareto.filter((p) => !used.has(p.counts.join('/'))).slice(0, 5);
      if (others.length) h += `<div class="card"><div class="card-h"><h3>${L('Diğer Pareto-optimal kadrolar', 'Other Pareto-optimal armies')} (${others.length} / ${opt.paretoCount})</h3></div>
        <p class="muted">${L('Hiçbiri bir diğerinden bütün ölçütlerde (net kâr, asker sayısı, ordu değeri, kayıp, kahraman canı, saatlik kâr, sınırda olma) kötü değildir.', 'None is worse than another on every criterion (net profit, troop count, army value, losses, hero health, profit per hour, being borderline).')}</p>
        ${others.map((p) => altRow(repFor(p.counts, withHero), { ctx })).join('')}</div>`;
    }
  }
  if (R.withHero) h += heroCompare(R);
  return h;
}
function altRow(rep, o = {}) {
  const st = statusOf(rep);
  return `<details class="alt ${o.active ? 'active' : ''}"><summary>
    <span class="alt-army">${armyLine(rep)}${o.tag ? ` <em>${esc(o.tag)}</em>` : ''}</span>
    <span class="alt-nums"><b class="${rep.net > 0 ? 'pos' : 'neg'}">${signed(rep.net)}</b> · ${L('kayıp', 'loss')} ${rep.lossRatio == null ? '—' : pct(rep.lossRatio, 1)} · ${fmt(rep.troops)} ${L('asker', 'troops')} · ${L('sınır', 'margin')} ${dec(rep.margin, 2)}${rep.hero ? ` · HP −${pct(rep.heroDamage)}` : ''} <span class="dot ${st.cls}" title="${st.label}"></span></span></summary>
    ${o.pick && !o.active ? `<button class="btn ghost" data-act="pick-mode" data-id="${o.pick}">${L('Bunu varsayılan öneri yap', 'Make this the default pick')}</button>` : ''}
    ${resultCard(rep, { ...(o.ctx || {}), title: L('Ayrıntı', 'Details') })}</details>`;
}
function heroCompare(R) {
  const rows = [];
  const add = (label, rep) => rows.push(`<tr><td>${label}</td><td>${rep ? armyLine(rep) : '—'}</td><td>${rep ? fmt(rep.lossCostNominal) : '—'}</td><td>${rep ? fmt(rep.bountyNominal) : '—'}</td><td class="${rep && rep.net > 0 ? 'pos' : 'neg'}">${rep ? signed(rep.net) : '—'}</td><td>${rep && rep.hero ? (rep.heroDead ? L('☠ ölür', '☠ dies') : '−' + pct(rep.heroDamage) + ' → ' + pct(rep.heroAfter)) : '—'}</td></tr>`);
  const a = R.noHero.picks.balanced ? repFor(R.noHero.picks.balanced.counts, false) : null;
  const b = R.withHero.picks.balanced ? repFor(R.withHero.picks.balanced.counts, true) : null;
  add(L('Kahramansız (dengeli)', 'No hero (balanced)'), a); add(L('Kahramanla (dengeli)', 'With hero (balanced)'), b); add(L('Yalnız kahraman', 'Hero alone'), R.heroAlone);
  let note = '';
  if (a && b) {
    const same = repFor(b.counts, false), mh = pct(num(S.prefs.minHeroHealth), 0);
    note = `<p class="muted">${L(`Kahramanın katkısı: dengeli öneride net kâr farkı <b>${signed(b.net - a.net)}</b>, ordu ${fmt(a.troops)} → ${fmt(b.troops)} asker. Aynı kadroyla (${b.counts.join('/')}) kahramansız gidilseydi asker kayıp maliyeti ${fmt(same.lossCostNominal)} olurdu; kahramanla ${fmt(b.lossCostNominal)}. Karşılığında kahraman tahminen ${pct(b.heroDamage)} can kaybeder. Sağlık kaybı hammaddeye çevrilmez; yalnızca asgari sağlık sınırınıza (${mh}) göre süzülür.`, `Hero contribution: in the balanced pick the net profit changes by <b>${signed(b.net - a.net)}</b> and the army goes from ${fmt(a.troops)} to ${fmt(b.troops)} troops. The same army (${b.counts.join('/')}) without the hero would lose troops worth ${fmt(same.lossCostNominal)}; with the hero ${fmt(b.lossCostNominal)}. In return the hero loses an estimated ${pct(b.heroDamage)} health. Health loss is not converted into resources; it is only filtered against your minimum health (${mh}).`)}</p>`;
  }
  return `<div class="card"><div class="card-h"><h3>${L('Kahramanlı / kahramansız karşılaştırma', 'With / without hero')}</h3><span class="badge warn">${L('HP: model tahmini', 'HP: model estimate')}</span></div>
    <div class="scroll"><table><thead><tr><th>${L('Seçenek', 'Option')}</th><th>${L('Ordu', 'Army')}</th><th>${L('Asker kaybı', 'Troop loss')}</th><th>${L('Hayvan ödülü', 'Bounty')}</th><th>${L('Net kâr', 'Net profit')}</th><th>${L('Kahraman HP', 'Hero HP')}</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>${note}
    <p class="muted">${L('Kahraman can kaybı formülü resmî olarak belgelenmemiştir; burada "saldırgan kayıp yüzdesi kadar can" modeli kullanılır. Gerçek savaş raporlarınızla karşılaştırın.', 'The hero health-loss formula is not officially documented; this uses a "health lost equals the attacker loss percentage" model. Compare it with your real battle reports.')}</p></div>`;
}

// ---------- Sekme: SİMÜLATÖR ----------
function tabSim() {
  const hm = S.prefs.heroMode;
  return `<section class="card"><div class="card-h"><h3>${L('Savaş simülatörü', 'Combat simulator')}</h3><button class="link" data-act="sim-from-rec" ${T.lastReport ? '' : 'disabled'}>${L('Öneriyi yükle', 'Load recommendation')}</button></div>
    <p class="muted">${L('Savunan: Vaha sekmesindeki hayvanlar', 'Defender: animals from the Oasis tab')} — ${ANIMAL_IDS.filter((id) => int(S.oasis.animals[id])).map((id) => `${ANIMALS[id].icon} ${int(S.oasis.animals[id])}`).join(' ') || L('hayvan yok', 'no animals')}. ${oasisDefense()}</p>
    <div class="fields">${ALL_HUN_IDS.map((id) => `<label>${nameOf(HUN_UNITS[id])} <small>(${HUN_UNITS[id].attack})</small><input type="number" inputmode="numeric" min="0" data-bind="sim.units.${id}" value="${int(S.sim.units[id]) || ''}" placeholder="0"></label>`).join('')}</div>
    ${seg('sim-mode', S.sim.mode, modeOpts(), 'small')}
    ${seg('hero-mode', hm === 'none' ? 'none' : 'with', [['none', L('Kahramansız', 'No hero')], ['with', L('Kahraman katılıyor', 'Hero takes part')]], 'small')}
    <button class="btn primary" data-act="simulate">${L('Simüle et', 'Simulate')}</button></section>
  <div id="sim-out">${T.simReport ? resultCard(T.simReport, { title: L('Simülasyon sonucu', 'Simulation result'), extra: refForm(T.simReport) }) : ''}</div>`;
}
function refForm(rep) {
  if (rep.hero) return `<p class="muted">${L('Referans vaka kaydı kahramansız savaşlar içindir.', 'Reference cases can only be saved for battles without the hero.')}</p>`;
  return `<details><summary>${L('Gerçek oyun sonucuyla karşılaştır / referans olarak kaydet', 'Compare with the real game result / save as reference')}</summary>
    <p class="muted">${L('Oyundaki simülatörün veya savaş raporunun gösterdiği GERÇEK değerleri girin. Motorla uyuşmazsa burada görünür ve Ayarlar’da listelenir.', 'Enter the REAL values shown by the in-game simulator or battle report. Any mismatch with the engine is shown here and listed in Settings.')}</p>
    <div class="fields">${rep.units.map((u) => `<label>${L('Ölen', 'Dead')} ${esc(nameOf(u))}<input type="number" min="0" data-ref-lost="${u.id}" value="${u.lost}"></label>`).join('')}
    ${rep.animals.map((a) => `<label>${L('Ölen', 'Dead')} ${esc(nameOf(a))}<input type="number" min="0" data-ref-killed="${a.id}" value="${a.killed}"></label>`).join('')}
    <label>${L('Ad / not', 'Name / note')}<input type="text" id="ref-name" placeholder="(52|50) 12/0/3"></label></div>
    <button class="btn ghost" data-act="save-ref">${L('Referans olarak kaydet', 'Save as reference')}</button></details>`;
}

// ---------- Sekme: RAINBOW ----------
function tabRainbow() {
  const tr = travelCfg(), p = S.profile, hc = heroCfg(), sq = L('kare', 'fields'), sph = L('kare/sa', 'fields/h');
  let body = `<p class="muted">${L('Köy ve vaha koordinatlarını girince mesafe, yolculuk süresi ve saatlik verim hesaplanır.', 'Enter village and oasis coordinates to get distance, travel time and hourly yield.')}</p>`;
  if (tr) {
    const f = tr.speedFactor;
    const rowsU = OPT_UNIT_IDS.map((id) => { const sp = HUN_UNITS[id].speed * f; const h = tripHours(tr.distance, sp, tr.tsLevel); return `<tr><td>${nameOf(HUN_UNITS[id])}</td><td>${sp} ${sph}</td><td>${formatHours(h / 2)}</td><td>${formatHours(h)}</td><td>${HUN_UNITS[id].carry}</td></tr>`; }).join('');
    const hs = (Math.min(hc.speed, 14) + 3) * f;
    body = `<p>${L('Mesafe', 'Distance')}: <b>${dec(tr.distance, 2)}</b> ${sq} ${tr.distance > 20 && tr.tsLevel ? `(${L('20 kareden sonrası Turnuva Alanı', 'beyond 20 fields, Tournament Square')} ${tr.tsLevel}: ×${(1 + 0.2 * tr.tsLevel).toFixed(1)})` : ''}</p>
      <div class="scroll"><table><thead><tr><th>${L('Birim', 'Unit')}</th><th>${L('Hız', 'Speed')} (x${f})</th><th>${L('Tek yön', 'One way')}</th><th>${L('Gidiş-dönüş', 'Round trip')}</th><th>${L('Taşıma', 'Carry')}</th></tr></thead><tbody>${rowsU}
      <tr><td>${L('Kahraman + süvari (en yavaş Yağmacı)', 'Hero + cavalry (slowest: Marauder)')}</td><td>${hs} ${sph}</td><td>${formatHours(tripHours(tr.distance, hs, tr.tsLevel) / 2)}</td><td>${formatHours(tripHours(tr.distance, hs, tr.tsLevel))}</td><td>0</td></tr></tbody></table></div>`;
    const rep = T.lastReport;
    if (rep && rep.valid && rep.hours) body += `<h4>${L('Seçili ordu', 'Selected army')}: ${armyLine(rep)}</h4>
      ${row(L('Gidiş-dönüş / tekrar kullanılabilirlik', 'Round trip / time until reusable'), formatHours(rep.hours))}${row(L('Taşıma kapasitesi (sağ kalanlar)', 'Carry capacity (survivors)'), fmt(rep.carry))}
      ${row(L('Taşınan normal yağma', 'Regular loot carried'), fmt(rep.lootNominal))}${row(L('Kahraman heybesine hayvan ödülü', 'Animal bounty to hero inventory'), fmt(rep.bountyNominal))}
      ${row(L('Saldırı başına net kâr', 'Net profit per attack'), signed(rep.net))}${row(L('Saatlik net kâr (tek döngü)', 'Net profit per hour (one cycle)'), fmt(rep.perHour))}${row(L('Asker başına saatlik kâr', 'Hourly profit per troop'), rep.troops ? dec(rep.perHour / rep.troops, 1) : '—')}`;
    else body += `<p class="muted">${L('Saatlik kâr için Vaha sekmesinde bir kadro bulun veya Simülatör’de simüle edin.', 'For hourly profit, find an army in the Oasis tab or run the Simulator.')}</p>`;
  }
  const vil = coordsOk(p.village) ? { x: +p.village.x, y: +p.village.y } : null;
  const list = S.oases.map((o, i) => ({ o, i, d: vil && coordsOk(o.coords) ? distance(vil, { x: +o.coords.x, y: +o.coords.y }) : null })).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
  return `<section class="card"><div class="card-h"><h3>${L('Rainbow Village — yolculuk ve verim', 'Rainbow Village — travel and yield')}</h3><span class="badge est">${L('süreler tahmin', 'times are estimates')}</span></div>
    <div class="fields">
      <label>${L('Köy X', 'Village X')}<input type="number" data-bind="profile.village.x" data-raw data-rerender value="${esc(p.village.x)}"></label>
      <label>${L('Köy Y', 'Village Y')}<input type="number" data-bind="profile.village.y" data-raw data-rerender value="${esc(p.village.y)}"></label>
      <label>${L('Vaha X', 'Oasis X')}<input type="number" data-bind="oasis.coords.x" data-raw data-rerender value="${esc(S.oasis.coords.x)}"></label>
      <label>${L('Vaha Y', 'Oasis Y')}<input type="number" data-bind="oasis.coords.y" data-raw data-rerender value="${esc(S.oasis.coords.y)}"></label>
      <label>${L('Turnuva Alanı seviyesi', 'Tournament Square level')}<input type="number" min="0" max="20" data-bind="profile.tsLevel" data-rerender value="${int(p.tsLevel)}"></label>
      <label>${L('Birim hızı çarpanı', 'Unit speed multiplier')} <small>(${L('x2 sunucu → 2', 'x2 server → 2')})</small><input type="number" min="1" step="0.5" data-bind="profile.unitSpeedFactor" data-rerender value="${num(p.unitSpeedFactor, 2)}"></label>
    </div>${body}
    <p class="muted">${L('Resmî kaynaklar yolculuk formülü vermez; süreler topluluk formülüyle hesaplanır (en yavaş birim × hız çarpanı; Hun kahramanı yalnızca süvariyle +3). Kesin süre için oyundaki Toplanma Yeri’ni esas alın.', 'Official sources give no travel formula; times use the community formula (slowest unit × speed multiplier; Hun hero +3 with cavalry only). Use the in-game Rally Point for exact times.')}</p></section>
  <section class="card"><div class="card-h"><h3>${L('Kayıtlı vahalar', 'Saved oases')} (${S.oases.length})</h3></div>
    ${list.length ? `<div class="scroll"><table><thead><tr><th>${L('Vaha', 'Oasis')}</th><th>${L('Hayvanlar', 'Animals')}</th><th>${L('Mesafe', 'Distance')}</th><th>${L('Yağmacıyla g-d', 'Round trip (Marauder)')}</th><th></th></tr></thead><tbody>${list.map(({ o, i, d }) => `<tr><td>(${esc(o.coords.x)}|${esc(o.coords.y)})<br><small>${esc(o.type && OASIS_TYPES[o.type] ? nameOf(OASIS_TYPES[o.type]) : '')}</small></td><td>${ANIMAL_IDS.filter((id) => o.animals[id] > 0).map((id) => `${ANIMALS[id].icon}${o.animals[id]}`).join(' ') || '—'}</td><td>${d == null ? '—' : dec(d, 1)}</td><td>${d == null ? '—' : formatHours(tripHours(d, 14 * num(p.unitSpeedFactor, 2), int(p.tsLevel)))}</td><td><button class="link" data-act="load-oasis" data-id="${i}">${L('Yükle', 'Load')}</button> <button class="link" data-act="del-oasis" data-id="${i}">${L('Sil', 'Delete')}</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${L('Vaha sekmesinden "Vahayı listeye kaydet" ile ekleyin. Yakın vahalar üstte sıralanır.', 'Add them with "Save oasis to list" in the Oasis tab. Nearest oases are listed first.')}</p>`}
  </section>
  <section class="card"><div class="card-h"><h3>${L('Vaha üretimi ve hayvan yenilenmesi', 'Oasis production and animal respawn')}</h3></div>
    <ul class="plain"><li>${L('Hayvan ödülü <b>tek seferliktir</b> (öldürülen hayvan başına); düzenli yağma geliri vahanın biriken hammaddesinden gelir. İkisi ayrı hesaplanır.', 'The animal bounty is <b>one-off</b> (per animal killed); regular loot comes from the oasis’s stored resources. The two are calculated separately.')}</li>
    <li>${L('Boş vaha üretimi (1x): ana hammadde 40/sa, diğerleri 10/sa; x2 sunucuda iki katı. Depo: tek bonuslu 1.000, çift bonuslu/%50 2.000 (hammadde başına; hızla ölçeklenmesi kaynakta belirtilmiyor).', 'Unoccupied oasis production (1x): 40/h of the main resource, 10/h of the others; doubled on x2. Storage: 1,000 for single-bonus, 2,000 for double-bonus/50% (per resource; scaling with speed is not documented).')}</li>
    <li>${L('Resmî kaynak: vaha üretimi, ilk hayvanların tamamı temizlendikten sonra başlar.', 'Official source: production starts once all the originally spawned animals are cleared.')}</li>
    <li>${L('Hayvanların yeniden doğma aralığı ve sayısı resmî kaynaklarda <b>verilmiyor</b>; bu yüzden uygulama yeniden doğmayı tahmin etmez. Her saldırıdan önce güncel hayvan sayısını girin.', 'Respawn interval and counts are <b>not given</b> in official sources, so the app does not predict respawns. Enter the current animal counts before each attack.')}</li></ul></section>`;
}

// ---------- Sekme: PROFİL ----------
function tabProfile() {
  const p = S.profile, h = p.hero, rules = rulesCfg();
  return `<section class="card"><div class="card-h"><h3>${L('Kullanılabilir askerler ve demirci', 'Available troops and smithy')}</h3></div>
    <p class="muted">${L('Demircide seviye atlattığınızda ilgili askerin seviyesini buradan güncelleyin; saldırı değeri hemen yeniden hesaplanır.', 'When you upgrade a unit in the Smithy, update its level here; the attack value is recalculated immediately.')}</p>
    <div class="scroll"><table class="form"><thead><tr><th>${L('Asker', 'Unit')}</th><th>${L('Adet', 'Count')}</th><th>${L('Demirci (0–20)', 'Smithy (0–20)')}</th><th>${L('Saldırı', 'Attack')}</th></tr></thead><tbody>
    ${OPT_UNIT_IDS.map((id) => { const u = HUN_UNITS[id], lvl = Math.min(20, int(p.smithy[id])), up = upgradedStat(u.attack, u.upkeep, lvl, rules); return `<tr><td>${nameOf(u)}<br><small>${L('maliyet', 'cost')} ${fmt(u.cost.reduce((a, b) => a + b))} · ${L('hız', 'speed')} ${u.speed} · ${L('taşıma', 'carry')} ${u.carry}</small></td>
      <td><input type="number" inputmode="numeric" min="0" data-bind="profile.troops.${id}" value="${int(p.troops[id])}" aria-label="${nameOf(u)}: ${L('adet', 'count')}"></td>
      <td><input type="number" inputmode="numeric" min="0" max="20" data-bind="profile.smithy.${id}" data-rerender value="${lvl}" aria-label="${nameOf(u)}: ${L('demirci seviyesi', 'smithy level')}"></td>
      <td><b>${dec(up, lvl ? 2 : 0)}</b>${lvl ? `<br><small>${L('taban', 'base')} ${u.attack} · +${dec(up - u.attack, 2)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
    <details><summary>${L('Demirci formülü', 'Smithy formula')}</summary>
      <p class="muted">${rules.smithyFormula === 'percent' ? L(`taban × (1 + ${dec(rules.smithyPercent, 2)}/100)^seviye`, `base × (1 + ${dec(rules.smithyPercent, 2)}/100)^level`) : L(`taban + (taban + ${dec(rules.smithyUpkeepCoef, 3)} × tahıl tüketimi) × (${rules.smithyBase}^seviye − 1)`, `base + (base + ${dec(rules.smithyUpkeepCoef, 3)} × crop upkeep) × (${rules.smithyBase}^level − 1)`)}. ${L('Varsayılan, Kirilloid’in T4 formülüdür; resmî kaynak formül yayımlamaz. Oyundaki asker istatistik ekranında gördüğünüz değer farklıysa buradan ayarlayın.', 'The default is Kirilloid’s T4 formula; official sources do not publish one. If the value on the in-game unit stats screen differs, adjust it here.')}</p>
      <div class="fields">
        <label>${L('Formül', 'Formula')}<select data-bind="prefs.rules.smithyFormula"><option value="t4" ${rules.smithyFormula === 't4' ? 'selected' : ''}>${L('T4 (tüketime bağlı)', 'T4 (upkeep-based)')}</option><option value="percent" ${rules.smithyFormula === 'percent' ? 'selected' : ''}>${L('Seviye başına sabit yüzde', 'Fixed percent per level')}</option></select></label>
        <label>${L('Seviye çarpanı', 'Level multiplier')} <small>(T4)</small><input type="number" step="0.0001" min="1" data-bind="prefs.rules.smithyBase" data-rerender value="${rules.smithyBase}"></label>
        <label>${L('Tüketim katsayısı', 'Upkeep coefficient')} <small>(T4, 300/7)</small><input type="number" step="0.001" min="0" data-bind="prefs.rules.smithyUpkeepCoef" data-rerender value="${+rules.smithyUpkeepCoef.toFixed(4)}"></label>
        <label>${L('Seviye başına %', '% per level')} <small>(${L('yüzde formülü', 'percent formula')})</small><input type="number" step="0.1" min="0" data-bind="prefs.rules.smithyPercent" data-rerender value="${rules.smithyPercent}"></label>
        <label>${L('Yuvarlama', 'Rounding')}<select data-bind="prefs.rules.smithyRound">${[['none', L('Yok (ondalıklı)', 'None (decimal)')], ['round', L('En yakın tam sayı', 'Nearest integer')], ['floor', L('Aşağı', 'Down')]].map(([k, l]) => `<option value="${k}" ${rules.smithyRound === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <button class="btn ghost" data-act="reset-smithy">${L('Varsayılan formüle dön', 'Reset to default formula')}</button>
    </details>
    <div class="fields"><label>${L('Ek ordu saldırı bonusu %', 'Extra army attack bonus %')} <small>(${L('ittifak vb.', 'alliance etc.')})</small><input type="number" min="0" step="0.1" data-bind="profile.otherAttackBonusPct" value="${num(p.otherAttackBonusPct)}"></label></div>
  </section>
  <section class="card"><div class="card-h"><h3>${L('Kahraman', 'Hero')}</h3><span class="badge warn">${L('HP: model tahmini', 'HP: model estimate')}</span></div>
    <div class="row"><label class="btn file ghost">📷 ${L('Kahraman ekranından oku (yapay zekâ)', 'Read from hero screen (AI)')}<input type="file" accept="image/*" id="img-hero" hidden></label></div>
    <div class="fields">
      <label>${L('Savaş gücü', 'Fighting strength')} <small>(${L('oyundaki toplam, silah dahil', 'in-game total, incl. weapon')})</small><input type="number" min="0" data-bind="profile.hero.strength" value="${num(h.strength)}"></label>
      <label>${L('Sağlık %', 'Health %')}<input type="number" min="0" max="100" data-bind="profile.hero.health" value="${num(h.health)}"></label>
      <label>${L('Seviye', 'Level')}<input type="number" min="0" data-bind="profile.hero.level" value="${int(h.level)}"></label>
      <label>${L('Saldırı bonusu %', 'Offence bonus %')} <small>(${L('ordu', 'army')})</small><input type="number" min="0" step="0.2" data-bind="profile.hero.offBonusPct" value="${num(h.offBonusPct)}"></label>
      <label>${L('Sağ el silahı', 'Right-hand weapon')}<select data-bind="profile.hero.weaponId">${Object.values(HUN_WEAPONS).map((w) => `<option value="${w.id}" ${h.weaponId === w.id ? 'selected' : ''}>${nameOf(w)}${w.unit ? ` (+${w.perUnit}/${nameOf(HUN_UNITS[w.unit])})` : ''}</option>`).join('')}</select></label>
      <label>${L('Zırh hasar azaltma', 'Armour damage reduction')} <small>(${L('can puanı', 'health points')})</small><input type="number" min="0" data-bind="profile.hero.armorReduction" value="${num(h.armorReduction)}"></label>
      <label>${L('Kahraman hızı', 'Hero speed')} <small>(${L('kare/sa, 1x', 'fields/h, 1x')})</small><input type="number" min="1" data-bind="profile.hero.speed" value="${num(h.speed, 14)}"></label>
      <label>${L('Can yenilenme %/gün', 'Health regeneration %/day')}<input type="number" min="0" data-bind="profile.hero.regenPct" value="${num(h.regenPct, 10)}"></label>
      <label class="check"><input type="checkbox" data-bind="profile.hero.mounted" ${h.mounted ? 'checked' : ''}> ${L('Atlı (süvari sayılır)', 'Mounted (counts as cavalry)')}</label>
      <label class="wide">${L('Diğer ekipman / notlar', 'Other equipment / notes')}<input type="text" data-bind="profile.hero.notes" data-raw value="${esc(h.notes)}"></label>
    </div>
    <p class="muted">${L('Kahraman, mevcut sağlığından bağımsız olarak tam güçle dövüşür; tek savaşta %90 ve üzeri can kaybı ölümdür (resmî). Silahın birim başına bonusu yalnızca kahraman o orduyla gidiyorsa uygulanır. Kalkanlar saldırı gücünü etkilemez; ordu saldırı bonusu veren eşyaları "Saldırı bonusu %" alanına ekleyin.', 'The hero always fights at full strength regardless of current health; losing 90% or more in one battle is death (official). The weapon’s per-unit bonus only applies when the hero goes with that army. Shields do not affect attack; add items that give an army attack bonus to "Offence bonus %".')}</p>
  </section>
  <section class="card"><div class="card-h"><h3>${L('Sunucu ve köy', 'Server and village')}</h3></div>
    <div class="fields">
      <label class="wide">${L('Sunucu', 'Server')}<input type="text" data-bind="profile.server" data-raw value="${esc(p.server)}"></label>
      <label>${L('Sunucu hızı', 'Server speed')} <small>(${L('vaha üretimi', 'oasis production')})</small><input type="number" min="1" data-bind="profile.serverSpeed" value="${num(p.serverSpeed, 2)}"></label>
      <label>${L('Birim hızı çarpanı', 'Unit speed multiplier')}<input type="number" min="1" step="0.5" data-bind="profile.unitSpeedFactor" value="${num(p.unitSpeedFactor, 2)}"></label>
      <label>${L('Köy X', 'Village X')}<input type="number" data-bind="profile.village.x" data-raw value="${esc(p.village.x)}"></label>
      <label>${L('Köy Y', 'Village Y')}<input type="number" data-bind="profile.village.y" data-raw value="${esc(p.village.y)}"></label>
      <label>${L('Turnuva Alanı', 'Tournament Square')}<input type="number" min="0" max="20" data-bind="profile.tsLevel" value="${int(p.tsLevel)}"></label>
    </div><p class="muted">${L('Sunucu hızı askerlerin saldırı gücünü ve hayvan ödülünü değiştirmez; yalnızca vaha üretimini ve (çarpan üzerinden) yolculuk hızını etkiler.', 'Server speed does not change troop attack or the animal bounty; it only affects oasis production and (via the multiplier) travel speed.')}</p></section>`;
}

// ---------- Sekme: AYARLAR ----------
function tabSettings() {
  const pr = S.prefs, v = S.vision, PL = PICKS(), rules = rulesCfg();
  const refs = [...REFERENCE_CASES.map((r) => ({ r, builtin: true })), ...S.refs.map((r, i) => ({ r, i }))];
  return `<section class="card"><div class="card-h"><h3>${L('Görünüm', 'Appearance')}</h3></div>
    <div class="fields">
      <label>${L('Dil', 'Language')}<select data-ui="lang"><option value="tr" ${getLang() === 'tr' ? 'selected' : ''}>Türkçe</option><option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option></select></label>
      <label>${L('Tema', 'Theme')}<select data-ui="theme"><option value="" ${!S.ui.theme ? 'selected' : ''}>${L('Sistem', 'System')}</option><option value="light" ${S.ui.theme === 'light' ? 'selected' : ''}>${L('Açık', 'Light')}</option><option value="dark" ${S.ui.theme === 'dark' ? 'selected' : ''}>${L('Koyu', 'Dark')}</option></select></label>
    </div></section>
  <section class="card"><div class="card-h"><h3>${L('Optimizasyon tercihleri', 'Optimisation preferences')}</h3></div>
    <div class="fields">
      <label class="check"><input type="checkbox" data-bind="prefs.lossFilterOn" ${pr.lossFilterOn ? 'checked' : ''}> ${L('Kayıp oranı filtresi açık', 'Loss-ratio filter on')}</label>
      <label>${L('Azami kayıp oranı %', 'Maximum loss ratio %')} <small>(${L('kayıp maliyeti / hayvan ödülü', 'loss cost / animal bounty')})</small><input type="number" min="0" data-bind="prefs.maxLossRatio" value="${num(pr.maxLossRatio, 50)}"></label>
      <label>${L('Kâr eşiği %', 'Profit threshold %')} <small>(50–100)</small><input type="number" min="50" max="100" data-bind="prefs.profitThresholdPct" value="${num(pr.profitThresholdPct, 90)}"></label>
      <label>${L('Asgari savaş sonrası kahraman sağlığı %', 'Minimum hero health after battle %')}<input type="number" min="0" max="100" data-bind="prefs.minHeroHealth" value="${num(pr.minHeroHealth, 30)}"></label>
      <label>${L('Güvenli yuvarlama uzaklığı', 'Safe rounding distance')} <small>(0,01–0,49)</small><input type="number" min="0.01" max="0.49" step="0.01" data-bind="prefs.rules.safeMargin" value="${rules.safeMargin}"></label>
      <label class="check"><input type="checkbox" data-bind="prefs.requireProfit" ${pr.requireProfit ? 'checked' : ''}> ${L('Kârsız seçenekleri ele', 'Exclude unprofitable options')}</label>
      <label>${L('Varsayılan öneri modu', 'Default pick')}<select data-bind="prefs.pickMode">${['balanced', 'safest', 'maxProfit', 'minTroops', 'zeroLoss', 'maxEfficiency', 'lowHeroRisk', 'maxPerHour'].map((k) => `<option value="${k}" ${pr.pickMode === k ? 'selected' : ''}>${PL[k][0]}</option>`).join('')}</select></label>
      <label>${L('Saldırı başına ek gerçek gider', 'Extra real cost per attack')} <small>(${L('merhem vb.', 'ointment etc.')})</small><input type="number" min="0" data-bind="prefs.extraCost" value="${num(pr.extraCost)}"></label>
    </div>
    <p class="muted">${L('"Güvenli yuvarlama uzaklığı": "En güvenli" seçenekte her asker/hayvan türünün kesirli kaybı 0,5 sınırından en az bu kadar uzak olmalıdır (0,5 = mümkün olan en uzak).', '"Safe rounding distance": for the "Safest" pick, every troop/animal type’s fractional loss must be at least this far from the 0.5 boundary (0.5 = the farthest possible).')}</p>
    <p class="muted">${L('Hammadde değer ağırlıkları (varsayılan 1 = nominal toplam):', 'Resource value weights (default 1 = nominal sum):')}</p>
    <div class="fields four">${RES().map((n, i) => `<label>${n}<input type="number" min="0" step="0.1" data-bind="prefs.weights.${i}" value="${num(pr.weights[i], 1)}"></label>`).join('')}</div>
  </section>
  <section class="card"><div class="card-h"><h3>${L('Görüntü tanıma', 'Image recognition')}</h3><span class="badge est">${L('haricî servis — isteğe bağlı', 'external service — optional')}</span></div>
    <p class="muted">${L('"Cihazda tanı" görüntüyü cihazdan çıkarmaz ve anahtar gerektirmez. "Yapay zekâ ile tanı" ise yüklediğiniz ekran görüntüsünü <b>kendi API anahtarınızla doğrudan Anthropic API’sine</b> gönderir. Anahtar yalnızca bu cihazda saklanır. Onay vermezseniz görüntü cihazdan çıkmaz.', '"Recognise on device" never sends the image anywhere and needs no key. "Recognise with AI" sends your screenshot <b>directly to the Anthropic API with your own API key</b>. The key is stored only on this device. Without your consent the image never leaves the device.')}</p>
    <div class="fields">
      <label class="check wide"><input type="checkbox" data-bind="vision.consent" ${v.consent ? 'checked' : ''}> ${L('Görüntülerimin Anthropic API’sine gönderilmesine izin veriyorum', 'I allow my images to be sent to the Anthropic API')}</label>
      <label class="wide">${L('Anthropic API anahtarı', 'Anthropic API key')}<input type="password" autocomplete="off" data-bind="vision.apiKey" data-raw value="${esc(v.apiKey)}" placeholder="sk-ant-…"></label>
      <label class="wide">Model<select data-bind="vision.model">${VISION_MODELS.map((m) => `<option value="${m.id}" ${v.model === m.id ? 'selected' : ''}>${nameOf(m)}</option>`).join('')}</select></label>
    </div>
    <p class="muted">${L('Cihazda öğrenilen ikon sayısı', 'Icons learned on this device')}: ${Object.values(S.iconTemplates).reduce((s, l) => s + l.length, 0)} ${Object.values(S.iconTemplates).some((l) => l.length) ? `<button class="link" data-act="clear-icons">${L('Sıfırla', 'Reset')}</button>` : ''}</p></section>
  <section class="card"><div class="card-h"><h3>${L('Referans vakalar (gerçek oyun sonuçları)', 'Reference cases (real game results)')}</h3></div>
    ${refs.map(({ r, builtin, i }) => { const c = checkReference(r); return `<div class="ref"><span class="dot ${c.ok ? 'ok' : 'bad'}"></span><div><b>${esc(getLang() === 'en' && r.en ? r.en : r.name)}</b>${builtin ? ` <small>(${L('yerleşik', 'built-in')})</small>` : ''}<br><small>${c.ok ? L('Motor birebir üretiyor.', 'The engine reproduces it exactly.') : L('UYUŞMAZLIK — ', 'MISMATCH — ') + esc(c.mismatches.join('; '))}</small></div>${builtin ? '' : `<button class="link" data-act="del-ref" data-id="${i}">${L('Sil', 'Delete')}</button>`}</div>`; }).join('')}
    <p class="muted">${L('Yeni vaka: Simülatör’de savaşı simüle edin → "Gerçek oyun sonucuyla karşılaştır". Uyuşmayan vakalar motorun o durumda yanlış olduğunu gösterir.', 'New case: simulate the battle in the Simulator → "Compare with the real game result". A mismatch means the engine is wrong for that case.')}</p></section>
  <section class="card"><div class="card-h"><h3>${L('Geçmiş', 'History')} (${S.history.length})</h3>${S.history.length ? `<button class="link" data-act="clear-history">${L('Temizle', 'Clear')}</button>` : ''}</div>
    ${S.history.length ? S.history.slice(0, 30).map((x) => `<div class="hist"><small>${new Date(x.t).toLocaleString(locale())}</small> ${esc(x.oasis)} → <b>${esc(x.army)}</b> · ${L('net', 'net')} ${signed(x.net)}${x.ratio != null ? ` · ${L('kayıp', 'loss')} ` + pct(x.ratio, 1) : ''}</div>`).join('') : `<p class="muted">${L('Henüz kayıt yok.', 'Nothing yet.')}</p>`}</section>
  <section class="card"><div class="card-h"><h3>${L('Veri', 'Data')}</h3></div>
    <div class="row"><button class="btn ghost" data-act="export">${L('Dışa aktar (JSON)', 'Export (JSON)')}</button><label class="btn file ghost">${L('İçe aktar', 'Import')}<input type="file" accept="application/json,.json" id="import-file" hidden></label><button class="btn ghost danger" data-act="reset">${L('Tümünü sıfırla', 'Reset everything')}</button></div>
    <p class="muted">${L('Bütün veriler yalnızca bu cihazda (tarayıcı deposu) tutulur. Uygulama Travian hesabınıza giriş yapmaz, şifre istemez, saldırı göndermez.', 'All data stays on this device (browser storage). The app does not log in to your Travian account, ask for a password, or send attacks.')}</p></section>
  <section class="card"><div class="card-h"><h3>${L('Doğrulananlar ve belirsizlikler', 'What is verified and what is uncertain')}</h3></div>
    <ul class="plain">
      <li>${L('<b>Doğrulandı:</b> yağma kayıp formülü, birim bazlı yuvarlama, +10 vaha taban savunması, sıçan/örümcek/yarasa süvari savunmaları, hayvan ödülü (tüketim başına 4×40) — iki gerçek simülasyonla birebir.', '<b>Verified:</b> raid loss formula, per-type rounding, +10 oasis base defence, rat/spider/bat cavalry defence, animal bounty (4×40 per upkeep) — exact match with two real simulations.')}</li>
      <li>${L('<b>Resmî kaynakla uyumlu:</b> 1/1/1 kadrosu 410 savunmaya kadar kayıpsız (tam 0,5 → saldırgan lehine).', '<b>Consistent with the official guide:</b> 1/1/1 fights up to 410 defence without losses (exact 0.5 → in the attacker’s favour).')}</li>
      <li>${L('<b>Varsayım:</b> hayvan kaybında tam 0,5 yukarı yuvarlanır; demirci formülü (ayarlanabilir); 1000+ birimli savaşlarda K üssü yağmada da kullanılır.', '<b>Assumption:</b> an exact 0.5 rounds up for animals; the smithy formula (configurable); the K exponent also applies to raids with 1000+ units.')}</li>
      <li>${L('<b>Model tahmini:</b> kahraman can kaybı = saldırgan kayıp yüzdesi (− zırh).', '<b>Model estimate:</b> hero health loss = attacker loss percentage (− armour).')}</li>
      <li>${L('<b>Tahmin:</b> yolculuk süreleri, boş vahada yağmalanabilir oran, hayvan yenilenmesi (hesaplanmaz).', '<b>Estimate:</b> travel times, lootable share of an unoccupied oasis, animal respawn (not calculated).')}</li>
    </ul></section>`;
}

// ---------- Çizim ----------
const TABS = () => [['oasis', L('Vaha', 'Oasis'), tabOasis], ['sim', L('Simülatör', 'Simulator'), tabSim], ['rainbow', 'Rainbow', tabRainbow], ['profile', L('Profil', 'Profile'), tabProfile], ['settings', L('Ayarlar', 'Settings'), tabSettings]];
function render() {
  const tabs = TABS(), dark = currentTheme() === 'dark';
  document.documentElement.lang = getLang();
  document.title = L('Hun Vaha Aracı', 'Hun Oasis Tool');
  $('#brand').innerHTML = `<h1>${L('Hun Vaha Aracı', 'Hun Oasis Tool')}</h1><p>${L('Travian: Legends · savaş simülatörü ve optimal ordu', 'Travian: Legends · combat simulator and optimal army')}</p>`;
  $('#controls').innerHTML = `<button class="icon-btn" data-act="toggle-lang" aria-label="${L('Dili İngilizce yap', 'Switch language to Turkish')}" title="${L('English', 'Türkçe')}">${getLang() === 'tr' ? 'EN' : 'TR'}</button>
    <button class="icon-btn" data-act="toggle-theme" aria-pressed="${dark}" aria-label="${dark ? L('Açık temaya geç', 'Switch to light theme') : L('Koyu temaya geç', 'Switch to dark theme')}" title="${dark ? L('Açık tema', 'Light theme') : L('Koyu tema', 'Dark theme')}">${dark ? '☀' : '☾'}</button>`;
  $('#tabs').innerHTML = tabs.map(([k, l]) => `<button data-tab="${k}" class="${T.tab === k ? 'on' : ''}" ${T.tab === k ? 'aria-current="page"' : ''}>${l}</button>`).join('');
  $('#main').innerHTML = tabs.find((t) => t[0] === T.tab)[2]();
}
const rerenderResults = () => { const el = $('#results'); if (el) el.innerHTML = renderResults(); };

// ---------- Eylemler ----------
let worker = null, jobId = 0;
function runOptimize() {
  if (T.busy || T.nlBusy) return;
  const hm = S.prefs.heroMode;
  const base = baseConfig(OPT_UNIT_IDS, S.prefs.attackMode);
  const hero = hm === 'none' ? null : heroCfg();
  const max = OPT_UNIT_IDS.map((id) => int(S.profile.troops[id]));
  const prefs = prefsCfg();
  if (hm !== 'alone' && max.every((v) => v === 0) && !hero) { T.result = { error: L('Kullanılabilir asker yok. Profil sekmesinden asker sayılarını girin.', 'No troops available. Enter your troop counts in the Profile tab.') }; rerenderResults(); return; }
  T.busy = true; T.progress = 0; render();
  const done = (res) => {
    T.busy = false; T.result = { ...res, heroMode: hm };
    const opt = hm === 'with' ? res.withHero : res.noHero;
    const pick = hm === 'alone' ? null : opt.picks[S.prefs.pickMode] || opt.picks.balanced;
    const rep = hm === 'alone' ? res.heroAlone : pick ? repFor(pick.counts, hm === 'with') : null;
    if (rep) {
      S.history.unshift({ t: Date.now(), oasis: (coordsOk(S.oasis.coords) ? `(${S.oasis.coords.x}|${S.oasis.coords.y}) ` : '') + rep.animals.map((a) => `${a.count} ${nameOf(a)}`).join(', '), army: OPT_UNIT_IDS.map((id) => (rep.units.find((u) => u.id === id) || { sent: 0 }).sent).join('/') + (rep.hero ? L(' + kahraman', ' + hero') : ''), net: rep.net, ratio: rep.lossRatio });
      S.history.length = Math.min(S.history.length, 50); persist();
    }
    render();
    const el = $('#results'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const fail = (msg) => { T.busy = false; T.result = { error: msg }; render(); };
  const sync = () => setTimeout(() => { try { done(compareHeroModes(base, hero, max, prefs)); } catch (e) { fail(String(e.message || e)); } }, 30);
  try {
    if (!worker) worker = new Worker(new URL('../optimizer/worker.js', import.meta.url), { type: 'module' });
    const id = ++jobId;
    worker.onmessage = (e) => {
      if (e.data.id !== id) return;
      if (e.data.progress != null) { T.progress = e.data.progress; const b = document.querySelector('[data-act="optimize"]'); if (b) b.textContent = `${L('Hesaplanıyor…', 'Calculating…')} ${Math.round(T.progress * 100)}%`; return; }
      if (e.data.error) fail(e.data.error); else done(e.data.result);
    };
    worker.onerror = () => { worker = null; sync(); };
    worker.postMessage({ id, baseConfig: base, heroCfg: hero, max, prefs });
  } catch { worker = null; sync(); }
}
function runNoLoss() {
  if (T.busy || T.nlBusy) return;
  const hm = S.prefs.heroMode, worst = worstAnimals();
  const cfg = baseConfig(OPT_UNIT_IDS, S.prefs.attackMode);
  cfg.animals = worst; cfg.hero = hm === 'none' ? null : heroCfg();
  const max = hm === 'alone' ? [0, 0, 0] : OPT_UNIT_IDS.map((id) => int(S.profile.troops[id]));
  const out = (r) => { T.nlBusy = false; T.noLoss = r; render(); const el = $('#noloss-out'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  if (!Object.keys(worst).length) { out({ error: L('Önce vahadaki hayvanları ya da doğabilecek hayvanları girin.', 'Enter the animals in the oasis or the animals that may spawn first.') }); return; }
  if (max.every((v) => v === 0) && !cfg.hero) { out({ error: L('Kullanılabilir asker yok. Profil sekmesinden asker sayılarını girin.', 'No troops available. Enter your troop counts in the Profile tab.') }); return; }
  T.nlBusy = true; T.progress = 0; render();
  const prefs = prefsCfg();
  const done = (r) => out({ ...r, worst });
  const fail = (msg) => out({ error: msg });
  const sync = () => setTimeout(() => { try { done(findNoLossArmy(cfg, max, prefs)); } catch (e) { fail(String(e.message || e)); } }, 30);
  try {
    if (!worker) worker = new Worker(new URL('../optimizer/worker.js', import.meta.url), { type: 'module' });
    const id = ++jobId;
    worker.onmessage = (e) => {
      if (e.data.id !== id) return;
      if (e.data.progress != null) { T.progress = e.data.progress; const b = document.querySelector('[data-act="no-loss"]'); if (b) b.textContent = `${L('Hesaplanıyor…', 'Calculating…')} ${Math.round(T.progress * 100)}%`; return; }
      if (e.data.error) fail(e.data.error); else done(e.data.result);
    };
    worker.onerror = () => { worker = null; sync(); };
    worker.postMessage({ id, kind: 'noLoss', baseConfig: cfg, max, prefs });
  } catch { worker = null; sync(); }
}
function runSim() {
  const cfg = baseConfig(ALL_HUN_IDS, S.sim.mode);
  cfg.hero = S.prefs.heroMode === 'none' ? null : heroCfg();
  T.simReport = createScenario(cfg).report(ALL_HUN_IDS.map((id) => int(S.sim.units[id])));
  if (T.simReport.valid) T.lastReport = T.simReport;
  render();
}
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let data = c.toDataURL('image/png'), mediaType = 'image/png';
      if (data.length > 2_500_000) { data = c.toDataURL('image/jpeg', 0.9); mediaType = 'image/jpeg'; }
      resolve({ url, img, base64: data.split(',')[1], mediaType });
    };
    img.onerror = () => reject(new Error(L('Görüntü açılamadı.', 'Could not open the image.')));
    img.src = url;
  });
}
const MANUAL = () => L(' Elle giriş her zaman kullanılabilir.', ' Manual entry is always available.');
function applyRecognition(out, source) {
  const warn = out.warnings.length ? '<br>' + out.warnings.map(esc).join('<br>') : '';
  if (out.empty) { T.visionMsg = { cls: 'bad', html: `${source}: ${L('görüntüde hayvan tanınamadı. Mevcut değerler değiştirilmedi; elle girebilirsiniz.', 'no animals were recognised. Existing values were left unchanged; you can enter them manually.')}${warn}` }; return; }
  S.oasis.animals = {}; S.oasis.conf = {};
  for (const a of out.animals) { S.oasis.animals[a.id] = a.count; S.oasis.conf[a.id] = { confidence: a.confidence, note: a.note }; }
  if (out.coords) S.oasis.coords = { x: out.coords.x, y: out.coords.y };
  if (out.oasisType && OASIS_TYPES[out.oasisType]) S.oasis.type = out.oasisType;
  const low = out.animals.filter((a) => a.confidence === 'low');
  T.visionMsg = { cls: low.length || out.warnings.length ? 'warn' : 'ok', html: `${source}: ${out.animals.map((a) => `<b>${a.count}</b> ${nameOf(ANIMALS[a.id])}`).join(', ')}${out.coords ? ` · (${out.coords.x}|${out.coords.y})` : ''}. ${low.length ? L(`<b>${low.length} değer emin değil</b> — aşağıda ⚠ ile işaretli, lütfen kontrol edin.`, `<b>${low.length} value(s) uncertain</b> — marked ⚠ below, please check.`) : L('Lütfen sayıları görüntüyle karşılaştırın.', 'Please compare the counts with the image.')}${warn}` };
  T.result = T.noLoss = null; persist();
}
async function visionAI(kind) {
  if (!S.vision.consent || !S.vision.apiKey) {
    T.visionMsg = { cls: 'warn', html: L('Yapay zekâ tanıma haricî bir servistir. Kullanmak için <b>Ayarlar → Görüntü tanıma</b> bölümünden izin verip API anahtarınızı girin. "Cihazda tanı" veya elle giriş anahtarsız çalışır.', 'AI recognition is an external service. To use it, give consent and enter your API key under <b>Settings → Image recognition</b>. "Recognise on device" and manual entry work without a key.') };
    if (kind === 'hero') toast(L('Önce Ayarlar → Görüntü tanıma bölümünden izin ve anahtar girin.', 'First give consent and enter a key under Settings → Image recognition.'));
    render(); return;
  }
  const im = kind === 'hero' ? T.heroImage : T.image;
  T.visionBusy = true; render();
  try {
    const out = await recognizeWithClaude({ apiKey: S.vision.apiKey, model: S.vision.model, imageBase64: im.base64, mediaType: im.mediaType, kind });
    if (kind === 'hero') {
      const got = [];
      for (const [k, l] of [['strength', L('savaş gücü', 'strength')], ['health', L('sağlık', 'health')], ['level', L('seviye', 'level')], ['offBonusPct', L('saldırı bonusu', 'offence bonus')]]) if (out[k] != null) { S.profile.hero[k] = out[k]; got.push(`${l} ${out[k]}`); }
      if (out.notes) S.profile.hero.notes = out.notes;
      persist(); toast(got.length ? L('Okundu: ', 'Read: ') + got.join(', ') + L('. Kontrol edin.', '. Please check.') : L('Kahraman bilgisi okunamadı; elle girin.', 'Could not read the hero details; enter them manually.'));
    } else { T.iconRows = null; applyRecognition(out, L('Yapay zekâ', 'AI')); }
  } catch (e) {
    const msg = e instanceof TypeError ? L('Bağlantı kurulamadı (internet yok veya istek engellendi).', 'Could not connect (no internet or the request was blocked).') : String(e.message || e);
    if (kind === 'hero') toast(msg); else T.visionMsg = { cls: 'bad', html: esc(msg) + MANUAL() };
  }
  T.visionBusy = false; render();
}
async function visionOcr() {
  T.visionBusy = true; T.iconRows = null; render();
  const src = L('Cihazda tanı', 'On-device recognition');
  try {
    const out = await recognizeIconScreenshot(T.image.img, S.iconTemplates);
    if (out.layout) {
      T.iconRows = out.rows;
      if (out.coords) S.oasis.coords = { x: out.coords.x, y: out.coords.y };
      if (out.oasisType && OASIS_TYPES[out.oasisType]) S.oasis.type = out.oasisType;
      if (out.rows.length) applyIconRows();
      const unknown = out.rows.filter((r) => !r.id).length, unsure = out.rows.filter((r) => r.id && r.confidence !== 'high').length;
      const known = out.rows.filter((r) => r.id).map((r) => `<b>${r.count}</b> ${nameOf(ANIMALS[r.id])}`).join(', ');
      T.visionMsg = !out.rows.length
        ? { cls: 'bad', html: `${src}: ${L('"Askerler" satırında hayvan bulunamadı (vaha boş olabilir). Elle girebilirsiniz.', 'no animals found in the "Troops" row (the oasis may be empty). You can enter them manually.')}` }
        : { cls: unknown || unsure ? 'warn' : 'ok', html: `${src}: ${out.rows.length} ${L('ikon bulundu', 'icon(s) found')}${known ? ' — ' + known : ''}.${out.coords ? ` (${out.coords.x}|${out.coords.y}).` : ''}${out.oasisType ? ' ' + nameOf(OASIS_TYPES[out.oasisType]) + '.' : ''}${unknown ? ' ' + L(`<b>${unknown} ikon tanınmadı</b> — aşağıdan bir kez seçin, cihaz öğrenecek.`, `<b>${unknown} icon(s) not recognised</b> — pick them once below and the device will learn them.`) : ''}${unsure ? ' ' + L(`<b>${unsure} değer emin değil</b> — kontrol edin.`, `<b>${unsure} value(s) uncertain</b> — please check.`) : ''} ${L('Sayıları görüntüyle karşılaştırın.', 'Compare the counts with the image.')}` };
      persist();
    } else {
      const txt = parseAnimalText(out.rawText); txt.coords = out.coords || parseCoords(out.rawText);
      txt.animals.forEach((x) => { x.confidence = 'low'; x.note = x.note || L('OCR — sayıyı kontrol edin', 'OCR — check the count'); });
      if (txt.empty) txt.warnings.push(L('Bu ekran düzeni tanınmadı ("Askerler" satırı veya hayvan adları bulunamadı). Yapay zekâ tanımayı deneyin veya elle girin.', 'This screen layout was not recognised (no "Troops" row or animal names found). Try AI recognition or enter the values manually.'));
      applyRecognition(txt, src);
    }
  } catch (e) { T.visionMsg = { cls: 'bad', html: esc(String(e.message || e)) + MANUAL() }; }
  T.visionBusy = false; render();
}

const ACTIONS = {
  inc: (id) => { S.oasis.animals[id] = int(S.oasis.animals[id]) + 1; delete S.oasis.conf[id]; T.result = T.noLoss = null; },
  dec: (id) => { S.oasis.animals[id] = Math.max(0, int(S.oasis.animals[id]) - 1); delete S.oasis.conf[id]; T.result = T.noLoss = null; },
  'clear-animals': () => { S.oasis.animals = {}; S.oasis.conf = {}; T.result = T.noLoss = null; T.visionMsg = null; T.iconRows = null; },
  'hero-mode': (id) => { S.prefs.heroMode = id; T.result = T.noLoss = null; T.simReport = null; },
  'attack-mode': (id) => { S.prefs.attackMode = id; T.result = T.noLoss = null; },
  'sim-mode': (id) => { S.sim.mode = id; T.simReport = null; },
  'pick-mode': (id) => { S.prefs.pickMode = id; },
  'toggle-theme': () => { S.ui.theme = currentTheme() === 'dark' ? 'light' : 'dark'; applyTheme(); },
  'toggle-lang': () => { S.ui.lang = getLang() === 'tr' ? 'en' : 'tr'; setLang(S.ui.lang); T.visionMsg = null; },
  'reset-smithy': () => { Object.assign(S.prefs.rules, { smithyFormula: 't4', smithyBase: DEFAULT_RULES.smithyBase, smithyUpkeepCoef: DEFAULT_RULES.smithyUpkeepCoef, smithyPercent: DEFAULT_RULES.smithyPercent, smithyRound: 'none' }); T.result = T.noLoss = null; T.simReport = null; },
  'clear-icons': () => { S.iconTemplates = {}; },
  optimize: () => { persist(); runOptimize(); return false; },
  'no-loss': () => { persist(); runNoLoss(); return false; },
  'spawn-copy': () => { S.oasis.spawn = Object.fromEntries(ANIMAL_IDS.map((id) => [id, int(S.oasis.animals[id])]).filter(([, v]) => v > 0)); T.noLoss = null; },
  'spawn-clear': () => { S.oasis.spawn = {}; T.noLoss = null; },
  simulate: () => { persist(); runSim(); return false; },
  'sim-from-rec': () => { S.sim.units = {}; for (const u of T.lastReport.units) S.sim.units[u.id] = u.sent; S.sim.mode = T.lastReport.mode; T.simReport = null; },
  'vision-ai': () => { visionAI('oasis'); return false; },
  'vision-ocr': () => { visionOcr(); return false; },
  'parse-text': () => { const t = $('#paste-text').value; const out = parseAnimalText(t); out.coords = parseCoords(t); T.iconRows = null; applyRecognition(out, L('Metin', 'Text')); },
  'estimate-stock': () => { S.oasis.stock = estimateOasisStock(OASIS_TYPES[S.oasis.type], num(S.profile.serverSpeed, 1), num(S.oasis.hours)); T.result = T.noLoss = null; toast(L('Tahmin: üretim × sunucu hızı × saat (depo sınırıyla). Gerçek miktar farklı olabilir.', 'Estimate: production × server speed × hours (capped by storage). The real amount may differ.')); },
  'save-oasis': () => {
    const entry = { coords: { ...S.oasis.coords }, type: S.oasis.type, animals: { ...S.oasis.animals }, spawn: { ...(S.oasis.spawn || {}) }, stock: [...S.oasis.stock], savedAt: Date.now() };
    const i = coordsOk(entry.coords) ? S.oases.findIndex((o) => String(o.coords.x) === String(entry.coords.x) && String(o.coords.y) === String(entry.coords.y)) : -1;
    if (i >= 0) S.oases[i] = entry; else S.oases.push(entry);
    toast(i >= 0 ? L('Vaha güncellendi.', 'Oasis updated.') : L('Vaha listeye kaydedildi (Rainbow sekmesi).', 'Oasis saved to the list (Rainbow tab).'));
  },
  'load-oasis': (id) => { const o = S.oases[+id]; if (!o) return; S.oasis = { ...S.oasis, coords: { ...o.coords }, type: o.type, animals: { ...o.animals }, spawn: { ...(o.spawn || {}) }, stock: [...o.stock], conf: {} }; T.result = T.noLoss = null; T.iconRows = null; T.tab = 'oasis'; },
  'del-oasis': (id) => { S.oases.splice(+id, 1); },
  'save-ref': () => {
    const rep = T.simReport; if (!rep) return;
    const lost = {}, killed = {};
    document.querySelectorAll('[data-ref-lost]').forEach((el) => { lost[el.dataset.refLost] = int(el.value); });
    document.querySelectorAll('[data-ref-killed]').forEach((el) => { killed[el.dataset.refKilled] = int(el.value); });
    const ref = { id: 'u' + Date.now(), name: $('#ref-name').value.trim() || `${rep.units.map((u) => u.sent + ' ' + nameOf(u)).join(', ')} — ${new Date().toLocaleDateString(locale())}`, source: 'user', mode: rep.mode,
      units: Object.fromEntries(rep.units.map((u) => [u.id, u.sent])), animals: Object.fromEntries(rep.animals.map((a) => [a.id, a.count])), expected: { lost, killed } };
    S.refs.push(ref); const c = checkReference(ref);
    toast(c.ok ? L('Kaydedildi: motor oyun sonucuyla birebir eşleşiyor.', 'Saved: the engine matches the game result exactly.') : L('Kaydedildi — UYUŞMAZLIK: ', 'Saved — MISMATCH: ') + c.mismatches.join('; '));
  },
  'del-ref': (id) => { S.refs.splice(+id, 1); },
  'clear-history': () => { S.history = []; },
  export: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...S, vision: { ...S.vision, apiKey: '' } }, null, 2)], { type: 'application/json' })); a.download = 'hun-oasis-tool.json'; a.click(); toast(L('Dışa aktarıldı (API anahtarı dahil edilmedi).', 'Exported (the API key was not included).')); return false; },
  reset: () => { if (!confirm(L('Bütün kayıtlı veriler (profil, vahalar, geçmiş, referanslar, öğrenilen ikonlar, API anahtarı) silinsin mi? Bu işlem geri alınamaz.', 'Delete all saved data (profile, oases, history, references, learned icons, API key)? This cannot be undone.'))) return false; const ui = S.ui; S = DEFAULT_STATE(); S.ui = ui; T.result = T.noLoss = T.simReport = T.lastReport = T.iconRows = null; },
};

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { T.tab = tab.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const fn = ACTIONS[b.dataset.act];
  if (!fn) return;
  if (fn(b.dataset.id) !== false) { persist(); render(); }
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'img-oasis' && el.files[0]) { try { T.image = await loadImage(el.files[0]); T.visionMsg = null; T.iconRows = null; } catch (err) { toast(err.message); } render(); return; }
  if (el.id === 'img-hero' && el.files[0]) { try { T.heroImage = await loadImage(el.files[0]); await visionAI('hero'); } catch (err) { toast(err.message); } return; }
  if (el.id === 'import-file' && el.files[0]) {
    try { const key = S.vision.apiKey; S = importState(await el.files[0].text()); if (!S.vision.apiKey) S.vision.apiKey = key; setLang(S.ui.lang); applyTheme(); persist(); toast(L('İçe aktarıldı.', 'Imported.')); }
    catch { toast(L('Dosya okunamadı: geçerli bir dışa aktarım değil.', 'Could not read the file: not a valid export.')); }
    render(); return;
  }
  if (el.dataset.ui) {
    S.ui[el.dataset.ui] = el.value;
    if (el.dataset.ui === 'lang') { setLang(el.value); T.visionMsg = null; } else applyTheme();
    persist(); render(); return;
  }
  if (el.dataset.iconrowSel != null || el.dataset.iconrowCount != null) {
    const r = T.iconRows[+(el.dataset.iconrowSel ?? el.dataset.iconrowCount)];
    if (el.dataset.iconrowSel != null) { r.id = el.value || null; if (r.id) learnIcon(r); } else r.count = int(el.value);
    r.confidence = r.id ? 'high' : 'low'; r.note = r.id ? '' : L('İkon tanınmadı — hayvanı seçin', 'Icon not recognised — pick the animal');
    applyIconRows(); persist(); render(); return;
  }
  if (el.dataset.animal) { S.oasis.animals[el.dataset.animal] = int(el.value); delete S.oasis.conf[el.dataset.animal]; T.result = T.noLoss = null; persist(); render(); return; }
  if (el.dataset.bind) {
    const v = el.type === 'checkbox' ? el.checked : el.dataset.raw != null || el.tagName === 'SELECT' ? el.value : el.value === '' ? 0 : num(el.value);
    setPath(el.dataset.bind, v); persist();
    if (el.dataset.bind.startsWith('oasis.spawn.')) T.noLoss = null; // yalnızca kayıpsız garanti sonucu eskir
    else if (!el.dataset.bind.startsWith('vision.') && !el.dataset.bind.startsWith('profile.hero.notes')) { T.result = T.noLoss = null; if (T.tab === 'sim') T.simReport = null; }
    if (el.dataset.rerender != null || el.type === 'checkbox' || el.tagName === 'SELECT' || T.tab === 'oasis' || T.tab === 'rainbow') render();
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!S.ui.theme) { applyTheme(); render(); } });

applyTheme();
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__app = { get state() { return S; }, T };
