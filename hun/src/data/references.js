// Referans vakalar: gerçek oyun simülatöründen alınmış sonuçlar. Motor bunları birebir üretmelidir.
// Bir savaş sonucu, girdileri bir referansla birebir aynıysa arayüzde "Doğrulanmış" gösterilir.
import { simulate } from '../engine/battle.js';
import { ALL_HUN_IDS } from './units.js';
import { L } from '../i18n.js';

export const REFERENCE_CASES = [
  {
    id: 'ref-52-50-a', name: 'Oyun simülatörü — (52|50) 10/2/2', en: 'In-game simulator — (52|50) 10/2/2', source: 'Kullanıcının oyun içi simülatör sonucu',
    mode: 'raid', units: { steppeRider: 10, marksman: 2, marauder: 2 }, animals: { rat: 3, spider: 1, bat: 9 },
    expected: { off: 1780, def: 560, lost: { steppeRider: 1, marksman: 0, marauder: 0 }, killed: { rat: 3, spider: 1, bat: 8 }, bounty: 1920 },
  },
  {
    id: 'ref-52-50-b', name: 'Oyun simülatörü — (52|50) 15/2/2', en: 'In-game simulator — (52|50) 15/2/2', source: 'Kullanıcının oyun içi simülatör sonucu',
    mode: 'raid', units: { steppeRider: 15, marksman: 2, marauder: 2 }, animals: { rat: 3, spider: 1, bat: 9 },
    expected: { off: 2380, def: 560, lost: { steppeRider: 2, marksman: 0, marauder: 0 }, killed: { rat: 3, spider: 1, bat: 8 }, bounty: 1920 },
  },
  {
    id: 'ref-hun-111', name: 'Resmî Hun rehberi — 1/1/1, 20 sıçan (410)', en: 'Official Hun guide — 1/1/1, 20 rats (410)', source: 'support.travian.com/en/articles/147',
    mode: 'raid', units: { steppeRider: 1, marksman: 1, marauder: 1 }, animals: { rat: 20 },
    expected: { off: 410, def: 410, lost: { steppeRider: 0, marksman: 0, marauder: 0 } },
  },
];

const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v > 0).sort());
export const battleKey = (mode, units, animals) => JSON.stringify([mode, clean(units), clean(animals)]);

/** Motorun bir referans vakayı üretip üretmediğini denetler (kahramansız, demirci 0, bonus yok). */
export function checkReference(ref) {
  const r = simulate({ unitIds: ALL_HUN_IDS, smithy: {}, hero: null, animals: ref.animals, mode: ref.mode }, ref.units);
  const e = ref.expected || {}, mismatches = [];
  const cmp = (label, got, want) => { if (want != null && want !== '' && Math.round(got) !== Math.round(want)) mismatches.push(`${label}: ${L('motor', 'engine')} ${Math.round(got)}, ${L('oyun', 'game')} ${want}`); };
  cmp(L('Saldırı', 'Attack'), r.off, e.off); cmp(L('Savunma', 'Defence'), r.def, e.def); cmp(L('Hayvan ödülü', 'Animal bounty'), r.bountyNominal, e.bounty);
  for (const [id, want] of Object.entries(e.lost || {})) cmp(L('Kayıp ', 'Lost ') + id, (r.units.find((u) => u.id === id) || { lost: 0 }).lost, want);
  for (const [id, want] of Object.entries(e.killed || {})) cmp(L('Ölen ', 'Killed ') + id, (r.animals.find((a) => a.id === id) || { killed: 0 }).killed, want);
  return { ok: mismatches.length === 0, mismatches, result: r };
}
