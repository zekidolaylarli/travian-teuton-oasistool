// Doğa (Nature) birimleri — kaynak: siegewise.com/en/travian/units/nature (T4.6).
// Tahıl tüketimleri resmî "Early Game Oasis Farming" makalesindeki ödül değerleriyle tutarlı
// (sıçan 40, yaban domuzu 80, ayı/timsah/kaplan 120, fil 200 — her hammaddeden).
// Sıçan/örümcek/yarasa süvari savunmaları kullanıcının iki gerçek simülasyonuyla (560) doğrulandı.

export const ANIMALS = {
  rat:       { id: 'rat',       tr: 'Sıçan',        en: 'Rat',       icon: '🐀', attack: 10,  defInf: 25,  defCav: 20,  upkeep: 1 },
  spider:    { id: 'spider',    tr: 'Örümcek',      en: 'Spider',    icon: '🕷️', attack: 20,  defInf: 35,  defCav: 40,  upkeep: 1 },
  snake:     { id: 'snake',     tr: 'Yılan',        en: 'Snake',     icon: '🐍', attack: 60,  defInf: 40,  defCav: 60,  upkeep: 1 },
  bat:       { id: 'bat',       tr: 'Yarasa',       en: 'Bat',       icon: '🦇', attack: 80,  defInf: 66,  defCav: 50,  upkeep: 1 },
  boar:      { id: 'boar',      tr: 'Yaban Domuzu', en: 'Wild Boar', icon: '🐗', attack: 50,  defInf: 70,  defCav: 33,  upkeep: 2 },
  wolf:      { id: 'wolf',      tr: 'Kurt',         en: 'Wolf',      icon: '🐺', attack: 100, defInf: 80,  defCav: 70,  upkeep: 2 },
  bear:      { id: 'bear',      tr: 'Ayı',          en: 'Bear',      icon: '🐻', attack: 250, defInf: 140, defCav: 200, upkeep: 3 },
  crocodile: { id: 'crocodile', tr: 'Timsah',       en: 'Crocodile', icon: '🐊', attack: 450, defInf: 380, defCav: 240, upkeep: 3 },
  tiger:     { id: 'tiger',     tr: 'Kaplan',       en: 'Tiger',     icon: '🐅', attack: 200, defInf: 170, defCav: 250, upkeep: 3 },
  elephant:  { id: 'elephant',  tr: 'Fil',          en: 'Elephant',  icon: '🐘', attack: 600, defInf: 440, defCav: 520, upkeep: 5 },
};
export const ANIMAL_IDS = Object.keys(ANIMALS);

/** Öldürülen her tahıl tüketimi birimi başına, dört hammaddenin HER BİRİNDEN verilen ödül (resmî). */
export const BOUNTY_PER_UPKEEP_PER_RESOURCE = 40;

// Vaha türleri. prod: boş vahanın 1x saatlik üretimi [odun,kil,demir,tahıl]; cap: hammadde başına depo (1x).
// Kaynak: support.travian.com/en/articles/48-oasis. Üretim sunucu hızıyla çarpılır (resmî: "x2'de iki kat").
// Depo kapasitesinin hızla ölçeklenip ölçeklenmediği kaynakta belirtilmiyor → belirsiz.
// typical: yaygın hayvanlar (yalnızca ipucu; savaş hesabına ASLA girmez).
export const OASIS_TYPES = {
  iron25:      { id: 'iron25',      tr: 'Demir %25', en: 'Iron 25%',               prod: [10, 10, 40, 11], cap: 1000, typical: ['rat', 'spider', 'bat'] },
  iron25crop:  { id: 'iron25crop',  tr: 'Demir %25 + Tahıl %25', en: 'Iron 25% + Crop 25%',   prod: [10, 10, 40, 41], cap: 2000, typical: ['rat', 'spider', 'bat'] },
  iron50:      { id: 'iron50',      tr: 'Demir %50 (gri bölge)', en: 'Iron 50% (grey zone)',   prod: [10, 10, 80, 11], cap: 2000, typical: ['rat', 'spider', 'bat'] },
  clay25:      { id: 'clay25',      tr: 'Kil %25', en: 'Clay 25%',                 prod: [10, 40, 10, 11], cap: 1000, typical: ['rat', 'spider', 'boar'] },
  clay25crop:  { id: 'clay25crop',  tr: 'Kil %25 + Tahıl %25', en: 'Clay 25% + Crop 25%',     prod: [10, 40, 10, 41], cap: 2000, typical: ['rat', 'spider', 'boar'] },
  clay50:      { id: 'clay50',      tr: 'Kil %50 (gri bölge)', en: 'Clay 50% (grey zone)',     prod: [10, 80, 10, 11], cap: 2000, typical: ['rat', 'spider', 'boar'] },
  wood25:      { id: 'wood25',      tr: 'Odun %25', en: 'Wood 25%',                prod: [40, 10, 10, 11], cap: 1000, typical: ['boar', 'wolf', 'bear'] },
  wood25crop:  { id: 'wood25crop',  tr: 'Odun %25 + Tahıl %25', en: 'Wood 25% + Crop 25%',    prod: [40, 10, 10, 41], cap: 2000, typical: ['boar', 'wolf', 'bear'] },
  wood50:      { id: 'wood50',      tr: 'Odun %50 (gri bölge)', en: 'Wood 50% (grey zone)',    prod: [80, 10, 10, 11], cap: 2000, typical: ['boar', 'wolf', 'bear'] },
  crop25:      { id: 'crop25',      tr: 'Tahıl %25', en: 'Crop 25%',               prod: [10, 10, 10, 41], cap: 1000, typical: ['rat', 'snake', 'bear', 'crocodile', 'tiger'] },
  crop50:      { id: 'crop50',      tr: 'Tahıl %50', en: 'Crop 50%',               prod: [10, 10, 10, 81], cap: 2000, typical: ['rat', 'snake', 'bear', 'crocodile', 'tiger'] },
};
export const OASIS_TYPE_IDS = Object.keys(OASIS_TYPES);
