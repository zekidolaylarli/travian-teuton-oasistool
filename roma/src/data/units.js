// Romalı (Roman) birimleri — demirci seviye 0, sunucu hızı 1x taban değerleri.
// Kaynak: Travian: Legends standart birim tablosu (support.travian.com "units comparison table",
// travian.fandom.com, Kirilloid; 2026-11-22 kontrol). Özel sunucularda (ör. "Community Week",
// Northern Legends Lejyoneri) değerler farklı olabilir; oyundaki asker ekranıyla karşılaştırın.
// cost: [odun, kil, demir, tahıl]; speed: kare/saat (1x); carry: taşıma kapasitesi.
// Not: Atlı Su Yalağı (Horse Drinking Trough) süvarilerin tahıl tüketimini düşürür; burada taban tüketim kullanılır.

export const UNITS = {
  legionnaire:        { id: 'legionnaire',        tr: 'Lejyoner',            en: 'Legionnaire',         attack: 40,  defInf: 35, defCav: 50,  cost: [120, 100, 150, 30],          upkeep: 1, speed: 6,  carry: 50,   cavalry: false },
  praetorian:         { id: 'praetorian',         tr: 'Pretoryan',           en: 'Praetorian',          attack: 30,  defInf: 65, defCav: 35,  cost: [100, 130, 160, 70],          upkeep: 1, speed: 5,  carry: 20,   cavalry: false },
  imperian:           { id: 'imperian',           tr: 'Emperyan',            en: 'Imperian',            attack: 70,  defInf: 40, defCav: 25,  cost: [150, 160, 210, 80],          upkeep: 1, speed: 7,  carry: 50,   cavalry: false },
  equitesLegati:      { id: 'equitesLegati',      tr: 'Equites Legati',      en: 'Equites Legati',      attack: 0,   defInf: 20, defCav: 10,  cost: [140, 160, 20, 40],           upkeep: 2, speed: 16, carry: 0,    cavalry: true  },
  equitesImperatoris: { id: 'equitesImperatoris', tr: 'Equites Imperatoris', en: 'Equites Imperatoris', attack: 120, defInf: 65, defCav: 50,  cost: [550, 440, 320, 100],         upkeep: 3, speed: 14, carry: 100,  cavalry: true  },
  equitesCaesaris:    { id: 'equitesCaesaris',    tr: 'Equites Caesaris',    en: 'Equites Caesaris',    attack: 180, defInf: 80, defCav: 105, cost: [550, 640, 800, 180],         upkeep: 4, speed: 10, carry: 70,   cavalry: true  },
  ram:                { id: 'ram',                tr: 'Koçbaşı',             en: 'Battering Ram',       attack: 60,  defInf: 30, defCav: 75,  cost: [900, 360, 500, 70],          upkeep: 3, speed: 4,  carry: 0,    cavalry: false },
  catapult:           { id: 'catapult',           tr: 'Ateş Mancınığı',      en: 'Fire Catapult',       attack: 75,  defInf: 60, defCav: 10,  cost: [950, 1350, 600, 90],         upkeep: 6, speed: 3,  carry: 0,    cavalry: false },
  senator:            { id: 'senator',            tr: 'Senatör',             en: 'Senator',             attack: 50,  defInf: 40, defCav: 30,  cost: [30750, 27200, 45000, 37500], upkeep: 5, speed: 4,  carry: 0,    cavalry: false },
  settler:            { id: 'settler',            tr: 'Göçmen',              en: 'Settler',             attack: 0,   defInf: 80, defCav: 80,  cost: [4600, 4200, 5800, 4400],     upkeep: 1, speed: 5,  carry: 3000, cavalry: false },
};

export const ALL_UNIT_IDS = Object.keys(UNITS);

/** Profilde sayısı/demircisi tutulan saldırı birimleri (Pretoryan savunma birimidir; Simülatör'de denenebilir). */
export const OPT_CANDIDATE_IDS = ['legionnaire', 'imperian', 'equitesImperatoris', 'equitesCaesaris'];
/** Optimizasyon tam üç birim türüyle çalışır; kullanıcı Profil'den üçlüyü seçer (sıra sabittir). */
export const OPT_TRIOS = {
  iec: ['imperian', 'equitesImperatoris', 'equitesCaesaris'],
  lie: ['legionnaire', 'imperian', 'equitesImperatoris'],
  lec: ['legionnaire', 'equitesImperatoris', 'equitesCaesaris'],
  lic: ['legionnaire', 'imperian', 'equitesCaesaris'],
};
export const DEFAULT_TRIO = 'iec';
/** Varsayılan üçlü: Emperyan / Equites Imperatoris / Equites Caesaris. */
export const OPT_UNIT_IDS = OPT_TRIOS[DEFAULT_TRIO];

// Romalı kahramanı sağ el silahları — Travian: Legends eşya kademeleri (+250 / +1000 / +4000 savaş gücü;
// piyade +3/+4/+5, Equites Imperatoris +6/+8/+10, Equites Caesaris +9/+12/+15). Türkçe adlar çeviridir;
// oyundaki ad biraz farklı olabilir, bonus değerleri esastır.
// strength: kahraman savaş gücü bonusu; perUnit: ilgili askerin birim başına saldırı (ve savunma) bonusu.
function w(id, tr, en, unit, strength, perUnit) { return { id, tr, en, unit, strength, perUnit }; }
export const WEAPONS = {
  none: { id: 'none', tr: 'Silah yok / diğer', en: 'No weapon / other', unit: null, strength: 0, perUnit: 0 },
  leg1: w('leg1', 'Lejyonerin Kısa Kılıcı', 'Short sword of the Legionnaire', 'legionnaire', 250, 3),
  leg2: w('leg2', 'Lejyonerin Kılıcı', 'Sword of the Legionnaire', 'legionnaire', 1000, 4),
  leg3: w('leg3', 'Lejyonerin Uzun Kılıcı', 'Long sword of the Legionnaire', 'legionnaire', 4000, 5),
  pra1: w('pra1', 'Pretoryanın Kısa Kılıcı', 'Short sword of the Praetorian', 'praetorian', 250, 3),
  pra2: w('pra2', 'Pretoryanın Kılıcı', 'Sword of the Praetorian', 'praetorian', 1000, 4),
  pra3: w('pra3', 'Pretoryanın Uzun Kılıcı', 'Long sword of the Praetorian', 'praetorian', 4000, 5),
  imp1: w('imp1', 'Emperyanın Kısa Kılıcı', 'Short sword of the Imperian', 'imperian', 250, 3),
  imp2: w('imp2', 'Emperyanın Kılıcı', 'Sword of the Imperian', 'imperian', 1000, 4),
  imp3: w('imp3', 'Emperyanın Uzun Kılıcı', 'Long sword of the Imperian', 'imperian', 4000, 5),
  ei1: w('ei1', 'Imperatoris Kısa Kılıcı', 'Short sword of the Imperatoris', 'equitesImperatoris', 250, 6),
  ei2: w('ei2', 'Imperatoris Kılıcı', 'Sword of the Imperatoris', 'equitesImperatoris', 1000, 8),
  ei3: w('ei3', 'Imperatoris Uzun Kılıcı', 'Long sword of the Imperatoris', 'equitesImperatoris', 4000, 10),
  ec1: w('ec1', 'Caesaris Hafif Mızrağı', 'Light lance of the Caesaris', 'equitesCaesaris', 250, 9),
  ec2: w('ec2', 'Caesaris Mızrağı', 'Lance of the Caesaris', 'equitesCaesaris', 1000, 12),
  ec3: w('ec3', 'Caesaris Ağır Mızrağı', 'Heavy lance of the Caesaris', 'equitesCaesaris', 4000, 15),
};
