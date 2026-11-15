// Cermen (Teuton) birimleri — demirci seviye 0, sunucu hızı 1x taban değerleri.
// Kaynak: Travian: Legends standart birim tablosu (Kirilloid / travian.fandom.com / support.travian.com,
// 2026-11-15 kontrol). Özel sunucularda (ör. "Community Week" dengelemeleri) değerler farklı olabilir;
// oyundaki asker ekranıyla karşılaştırın.
// cost: [odun, kil, demir, tahıl]; speed: kare/saat (1x); carry: taşıma kapasitesi.
// Not: Cermen casusu piyadedir (diğer kavimlerin aksine).

export const UNITS = {
  clubswinger:    { id: 'clubswinger',    tr: 'Tokmak Sallayan', en: 'Clubswinger',     attack: 40,  defInf: 20,  defCav: 5,  cost: [95, 75, 40, 40],             upkeep: 1, speed: 7,  carry: 60,   cavalry: false },
  spearman:       { id: 'spearman',       tr: 'Mızrakçı',        en: 'Spearman',        attack: 10,  defInf: 35,  defCav: 60, cost: [145, 70, 85, 40],            upkeep: 1, speed: 7,  carry: 40,   cavalry: false },
  axeman:         { id: 'axeman',         tr: 'Balta Sallayan',  en: 'Axeman',          attack: 60,  defInf: 30,  defCav: 30, cost: [130, 120, 170, 70],          upkeep: 1, speed: 6,  carry: 50,   cavalry: false },
  scout:          { id: 'scout',          tr: 'Casus',           en: 'Scout',           attack: 0,   defInf: 10,  defCav: 5,  cost: [160, 100, 50, 50],           upkeep: 1, speed: 9,  carry: 0,    cavalry: false },
  paladin:        { id: 'paladin',        tr: 'Paladin',         en: 'Paladin',         attack: 55,  defInf: 100, defCav: 40, cost: [370, 270, 290, 75],          upkeep: 2, speed: 10, carry: 110,  cavalry: true  },
  teutonicKnight: { id: 'teutonicKnight', tr: 'Toton Şövalyesi', en: 'Teutonic Knight', attack: 150, defInf: 50,  defCav: 75, cost: [450, 515, 480, 80],          upkeep: 3, speed: 9,  carry: 80,   cavalry: true  },
  ram:            { id: 'ram',            tr: 'Koçbaşı',         en: 'Ram',             attack: 65,  defInf: 30,  defCav: 80, cost: [1000, 300, 350, 70],         upkeep: 3, speed: 4,  carry: 0,    cavalry: false },
  catapult:       { id: 'catapult',       tr: 'Mancınık',        en: 'Catapult',        attack: 50,  defInf: 60,  defCav: 10, cost: [900, 1200, 600, 60],         upkeep: 6, speed: 3,  carry: 0,    cavalry: false },
  chief:          { id: 'chief',          tr: 'Reis',            en: 'Chief',           attack: 40,  defInf: 60,  defCav: 40, cost: [35500, 26600, 25000, 27200], upkeep: 4, speed: 4,  carry: 0,    cavalry: false },
  settler:        { id: 'settler',        tr: 'Göçmen',          en: 'Settler',         attack: 10,  defInf: 80,  defCav: 80, cost: [5800, 4400, 4600, 5200],     upkeep: 1, speed: 5,  carry: 3000, cavalry: false },
};

export const ALL_UNIT_IDS = Object.keys(UNITS);

/** Profilde sayısı/demircisi tutulan saldırı birimleri. */
export const OPT_CANDIDATE_IDS = ['clubswinger', 'axeman', 'paladin', 'teutonicKnight'];
/** Optimizasyon tam üç birim türüyle çalışır; kullanıcı Profil'den üçlüyü seçer (sıra sabittir). */
export const OPT_TRIOS = {
  cat: ['clubswinger', 'axeman', 'teutonicKnight'],
  cpt: ['clubswinger', 'paladin', 'teutonicKnight'],
  cap: ['clubswinger', 'axeman', 'paladin'],
  apt: ['axeman', 'paladin', 'teutonicKnight'],
};
export const DEFAULT_TRIO = 'cat';
/** Varsayılan üçlü: Tokmak Sallayan / Balta Sallayan / Toton Şövalyesi. */
export const OPT_UNIT_IDS = OPT_TRIOS[DEFAULT_TRIO];

// Cermen kahramanı sağ el silahları — Travian: Legends eşya kademeleri (+250 / +1000 / +4000 savaş gücü;
// piyade +3/+4/+5, Paladin +6/+8/+10, Toton Şövalyesi +9/+12/+15). Türkçe adlar çeviridir; oyundaki
// ad biraz farklı olabilir, bonus değerleri esastır.
// strength: kahraman savaş gücü bonusu; perUnit: ilgili askerin birim başına saldırı (ve savunma) bonusu.
function w(id, tr, en, unit, strength, perUnit) { return { id, tr, en, unit, strength, perUnit }; }
export const WEAPONS = {
  none: { id: 'none', tr: 'Silah yok / diğer', en: 'No weapon / other', unit: null, strength: 0, perUnit: 0 },
  club1: w('club1', 'Tokmak Sallayanın Sopası', 'Club of the Clubswinger', 'clubswinger', 250, 3),
  club2: w('club2', 'Tokmak Sallayanın Topuzu', 'Mace of the Clubswinger', 'clubswinger', 1000, 4),
  club3: w('club3', 'Tokmak Sallayanın Gürzü', 'Morning star of the Clubswinger', 'clubswinger', 4000, 5),
  spear1: w('spear1', 'Mızrakçının Kargısı', 'Spear of the Spearman', 'spearman', 250, 3),
  spear2: w('spear2', 'Mızrakçının Mızrağı', 'Pike of the Spearman', 'spearman', 1000, 4),
  spear3: w('spear3', 'Mızrakçının Uzun Mızrağı', 'Lance of the Spearman', 'spearman', 4000, 5),
  axe1: w('axe1', 'Balta Sallayanın Küçük Baltası', 'Hatchet of the Axeman', 'axeman', 250, 3),
  axe2: w('axe2', 'Balta Sallayanın Baltası', 'Axe of the Axeman', 'axeman', 1000, 4),
  axe3: w('axe3', 'Balta Sallayanın Savaş Baltası', 'Battle axe of the Axeman', 'axeman', 4000, 5),
  pal1: w('pal1', 'Paladinin Hafif Çekici', 'Light hammer of the Paladin', 'paladin', 250, 6),
  pal2: w('pal2', 'Paladinin Çekici', 'Hammer of the Paladin', 'paladin', 1000, 8),
  pal3: w('pal3', 'Paladinin Ağır Çekici', 'Heavy hammer of the Paladin', 'paladin', 4000, 10),
  tk1: w('tk1', 'Toton Şövalyesinin Kısa Kılıcı', 'Short sword of the Teutonic Knight', 'teutonicKnight', 250, 9),
  tk2: w('tk2', 'Toton Şövalyesinin Kılıcı', 'Sword of the Teutonic Knight', 'teutonicKnight', 1000, 12),
  tk3: w('tk3', 'Toton Şövalyesinin Uzun Kılıcı', 'Long sword of the Teutonic Knight', 'teutonicKnight', 4000, 15),
};
