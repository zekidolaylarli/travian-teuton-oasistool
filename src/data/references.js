// Referans vakalar: gerçek oyun simülatöründen alınmış sonuçlar. Motor bunları birebir üretmelidir.
// Bir savaş sonucu, girdileri bir referansla birebir aynıysa arayüzde "Doğrulanmış" gösterilir.
import { simulate } from '../engine/battle.js';
import { ALL_UNIT_IDS } from './units.js';
import { L } from '../i18n.js';

// Cermen sürümünde yerleşik vaka YOKTUR: Hun aracındaki iki oyun-içi simülasyon Hun birimleriyle alınmıştı.
// Savaş motoru aynıdır (formüller kavimden bağımsız); kendi oyun sonuçlarınızı Simülatör sekmesinden
// referans olarak kaydedebilirsiniz.
export const REFERENCE_CASES = [];

const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v > 0).sort());
export const battleKey = (mode, units, animals) => JSON.stringify([mode, clean(units), clean(animals)]);

/** Motorun bir referans vakayı üretip üretmediğini denetler (kahramansız, demirci 0, bonus yok). */
export function checkReference(ref) {
  const r = simulate({ unitIds: ALL_UNIT_IDS, smithy: {}, hero: null, animals: ref.animals, mode: ref.mode }, ref.units);
  const e = ref.expected || {}, mismatches = [];
  const cmp = (label, got, want) => { if (want != null && want !== '' && Math.round(got) !== Math.round(want)) mismatches.push(`${label}: ${L('motor', 'engine')} ${Math.round(got)}, ${L('oyun', 'game')} ${want}`); };
  cmp(L('Saldırı', 'Attack'), r.off, e.off); cmp(L('Savunma', 'Defence'), r.def, e.def); cmp(L('Hayvan ödülü', 'Animal bounty'), r.bountyNominal, e.bounty);
  for (const [id, want] of Object.entries(e.lost || {})) cmp(L('Kayıp ', 'Lost ') + id, (r.units.find((u) => u.id === id) || { lost: 0 }).lost, want);
  for (const [id, want] of Object.entries(e.killed || {})) cmp(L('Ölen ', 'Killed ') + id, (r.animals.find((a) => a.id === id) || { killed: 0 }).killed, want);
  return { ok: mismatches.length === 0, mismatches, result: r };
}
