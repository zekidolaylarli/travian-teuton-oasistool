// Yerel kayıt (yalnızca bu cihazda, localStorage). Sunucuya hiçbir veri gönderilmez.
const KEY = 'roman-oasis-tool.v1';

export const DEFAULT_STATE = () => ({
  profile: {
    troops: { legionnaire: 0, imperian: 30, equitesImperatoris: 20, equitesCaesaris: 10 },
    smithy: { legionnaire: 0, imperian: 0, equitesImperatoris: 0, equitesCaesaris: 0, praetorian: 0 },
    optTrio: 'iec', // optimizasyona giren üçlü (units.js → OPT_TRIOS)
    hero: { level: 0, strength: 100, offBonusPct: 0, health: 100, mounted: true, speed: 14, weaponId: 'none', armorReduction: 0, regenPct: 10, notes: '' },
    village: { x: '', y: '' },
    server: 'ts21.x2.international.travian.com', serverSpeed: 2, unitSpeedFactor: 2, tsLevel: 0, otherAttackBonusPct: 0,
  },
  prefs: {
    lossFilterOn: true, maxLossRatio: 50, requireProfit: true, profitThresholdPct: 90, minHeroHealth: 30,
    weights: [1, 1, 1, 1], pickMode: 'balanced', extraCost: 0, heroMode: 'none', attackMode: 'raid',
    // Ayarlanabilir motor kuralları (demirci formülü, "en güvenli" seçenek için yuvarlama uzaklığı)
    rules: { smithyFormula: 't4', smithyBase: 1.007, smithyUpkeepCoef: 300 / 7, smithyPercent: 1.5, smithyRound: 'none', safeMargin: 0.1 },
  },
  ui: { lang: 'tr', theme: '' }, // theme: '' = sistem, 'light', 'dark'
  // spawn: yeniden doğma payı — şu ankilere ek olarak en fazla doğabilecek hayvanlar (kayıpsız garanti)
  oasis: { animals: {}, conf: {}, coords: { x: '', y: '' }, type: '', stock: [0, 0, 0, 0], lootablePct: 100, hours: 0, spawn: {} },
  sim: { units: {}, mode: 'raid' },
  oases: [],     // çoklu vaha planlaması için kayıtlı vahalar
  history: [],   // geçmiş optimizasyon/simülasyon özetleri
  refs: [],      // kullanıcının eklediği referans vakalar (gerçek oyun sonuçları)
  iconTemplates: {}, // cihazda öğrenilen ikon parmak izleri { hayvan: [base64] }
  vision: { apiKey: '', model: 'claude-opus-5-5', consent: false },
});

function merge(base, saved) {
  if (Array.isArray(base)) return Array.isArray(saved) ? saved : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (saved && typeof saved === 'object') for (const k of Object.keys(saved)) out[k] = k in base ? merge(base[k], saved[k]) : saved[k];
    return out;
  }
  return saved === undefined || saved === null ? base : saved;
}

export function loadState() {
  try { return merge(DEFAULT_STATE(), JSON.parse(localStorage.getItem(KEY) || 'null')); }
  catch { return DEFAULT_STATE(); }
}
export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}
export function importState(json) { return merge(DEFAULT_STATE(), JSON.parse(json)); }
