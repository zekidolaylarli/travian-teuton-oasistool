// Hun birimleri — demirci seviye 0, sunucu hızı 1x taban değerleri.
// Kaynak: siegewise.com/en/travian/units/huns (T4.6, 2026-08-31 kontrol) —
// Bozkır/Nişancı/Yağmacı toplam maliyetleri kullanıcının oyun verisiyle (895/1050/1760) uyuşuyor.
// cost: [odun, kil, demir, tahıl]; speed: kare/saat (1x); carry: taşıma kapasitesi.

export const HUN_UNITS = {
  mercenary:   { id: 'mercenary',   tr: 'Paralı Asker',   en: 'Mercenary',    attack: 35,  defInf: 40, defCav: 30, cost: [130, 80, 40, 40],            upkeep: 1, speed: 6,  carry: 50,   cavalry: false },
  bowman:      { id: 'bowman',      tr: 'Okçu',           en: 'Bowman',       attack: 50,  defInf: 30, defCav: 10, cost: [140, 110, 60, 60],           upkeep: 1, speed: 6,  carry: 30,   cavalry: false },
  spotter:     { id: 'spotter',     tr: 'Gözcü',          en: 'Spotter',      attack: 0,   defInf: 20, defCav: 10, cost: [170, 150, 20, 40],           upkeep: 2, speed: 19, carry: 0,    cavalry: true  },
  steppeRider: { id: 'steppeRider', tr: 'Bozkır Atlısı',  en: 'Steppe Rider', attack: 120, defInf: 30, defCav: 15, cost: [290, 370, 190, 45],          upkeep: 2, speed: 16, carry: 75,   cavalry: true  },
  marksman:    { id: 'marksman',    tr: 'Nişancı',        en: 'Marksman',     attack: 110, defInf: 80, defCav: 70, cost: [320, 350, 330, 50],          upkeep: 2, speed: 15, carry: 105,  cavalry: true  },
  marauder:    { id: 'marauder',    tr: 'Yağmacı',        en: 'Marauder',     attack: 180, defInf: 60, defCav: 40, cost: [450, 560, 610, 140],         upkeep: 3, speed: 14, carry: 80,   cavalry: true  },
  ram:         { id: 'ram',         tr: 'Koçbaşı',        en: 'Ram',          attack: 65,  defInf: 30, defCav: 90, cost: [1060, 330, 360, 70],         upkeep: 3, speed: 4,  carry: 0,    cavalry: false },
  catapult:    { id: 'catapult',    tr: 'Mancınık',       en: 'Catapult',     attack: 45,  defInf: 55, defCav: 10, cost: [950, 1280, 620, 60],         upkeep: 6, speed: 3,  carry: 0,    cavalry: false },
  logades:     { id: 'logades',     tr: 'Logades',        en: 'Logades',      attack: 50,  defInf: 40, defCav: 30, cost: [37200, 27600, 25200, 27600], upkeep: 4, speed: 5,  carry: 0,    cavalry: false },
  settler:     { id: 'settler',     tr: 'Göçmen',         en: 'Settler',      attack: 10,  defInf: 80, defCav: 80, cost: [6100, 4600, 4800, 5400],     upkeep: 1, speed: 5,  carry: 3000, cavalry: false },
};

export const ALL_HUN_IDS = Object.keys(HUN_UNITS);
/** Optimizasyona katılan üç süvari (sıra sabittir). */
export const OPT_UNIT_IDS = ['steppeRider', 'marksman', 'marauder'];

// Hun kahramanı sağ el silahları — resmî kaynak: support.travian.com/en/articles/97
// strength: kahraman savaş gücü bonusu; perUnit: ilgili askerin birim başına saldırı (ve savunma) bonusu.
function w(id, tr, en, unit, strength, perUnit) { return { id, tr, en, unit, strength, perUnit }; }
export const HUN_WEAPONS = {
  none: { id: 'none', tr: 'Silah yok / diğer', en: 'No weapon / other', unit: null, strength: 0, perUnit: 0 },
  merc1: w('merc1', 'Paralı Asker Baltası (küçük)', 'Hatchet of the Mercenary', 'mercenary', 250, 3),
  merc2: w('merc2', 'Paralı Asker Baltası', 'Axe of the Mercenary', 'mercenary', 1000, 4),
  merc3: w('merc3', 'Paralı Asker Savaş Baltası', 'Battle Axe of the Mercenary', 'mercenary', 4000, 5),
  bow1: w('bow1', 'Okçunun Kısa Yayı', 'Short bow of the Bowman', 'bowman', 250, 3),
  bow2: w('bow2', 'Okçunun Yayı', 'Bow of the Bowman', 'bowman', 1000, 4),
  bow3: w('bow3', 'Okçunun Uzun Yayı', 'Longbow of the Bowman', 'bowman', 4000, 5),
  step1: w('step1', 'Bozkır Atlısının Kısa Kılıcı', 'Short sword of the Steppe Rider', 'steppeRider', 250, 6),
  step2: w('step2', 'Bozkır Atlısının Kılıcı', 'Sword of the Steppe Rider', 'steppeRider', 1000, 8),
  step3: w('step3', 'Bozkır Atlısının Uzun Kılıcı', 'Long sword of the Steppe Rider', 'steppeRider', 4000, 10),
  mark1: w('mark1', 'Nişancının Kısa Yayı', 'Short bow of the Marksman', 'marksman', 250, 6),
  mark2: w('mark2', 'Nişancının Yayı', 'Bow of the Marksman', 'marksman', 1000, 8),
  mark3: w('mark3', 'Nişancının Uzun Yayı', 'Longbow of the Marksman', 'marksman', 4000, 10),
  mara1: w('mara1', 'Yağmacının Kısa Kılıcı', 'Short sword of the Marauder', 'marauder', 250, 9),
  mara2: w('mara2', 'Yağmacının Kılıcı', 'Sword of the Marauder', 'marauder', 1000, 12),
  mara3: w('mara3', 'Yağmacının Uzun Kılıcı', 'Long sword of the Marauder', 'marauder', 4000, 15),
};
