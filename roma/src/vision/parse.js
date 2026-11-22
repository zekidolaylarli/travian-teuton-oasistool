// Görüntü tanıma çıktılarının doğrulanması ve metinden (OCR / yapıştırılan metin) hayvan ayrıştırma.
// Bu modül ağ kullanmaz ve savaş motorundan bağımsızdır.
import { ANIMALS, ANIMAL_IDS } from '../data/nature.js';
import { L } from '../i18n.js';

const fold = (s) => String(s).toLowerCase()
  .replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

// Türkçe / İngilizce adlar (çoğul ve yaygın OCR biçimleriyle). Uzun adlar önce eşleşir.
const ALIASES = {
  rat: ['sican', 'sicanlar', 'fare', 'rat', 'rats'],
  spider: ['orumcek', 'orumcekler', 'spider', 'spiders'],
  snake: ['yilan', 'yilanlar', 'snake', 'snakes'],
  bat: ['yarasa', 'yarasalar', 'bat', 'bats'],
  boar: ['yaban domuzu', 'yaban domuzlari', 'yabandomuzu', 'domuz', 'wild boar', 'wild boars', 'boar', 'boars'],
  wolf: ['kurt', 'kurtlar', 'wolf', 'wolves'],
  bear: ['ayi', 'ayilar', 'bear', 'bears'],
  crocodile: ['timsah', 'timsahlar', 'crocodile', 'crocodiles'],
  tiger: ['kaplan', 'kaplanlar', 'tiger', 'tigers'],
  elephant: ['fil', 'filler', 'elephant', 'elephants'],
};
const ALIAS_LIST = Object.entries(ALIASES)
  .flatMap(([id, names]) => names.map((n) => ({ id, n })))
  .sort((a, b) => b.n.length - a.n.length);

export function matchAnimalName(text) {
  const t = ' ' + fold(text).replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  for (const { id, n } of ALIAS_LIST) if (t.includes(' ' + n + ' ')) return id;
  return null;
}

/**
 * Serbest metinden "sayı + hayvan adı" çiftlerini çıkarır (her satır ayrı değerlendirilir).
 * Dönen: { animals: [{id,count,confidence,note}], warnings: [] }
 */
export function parseAnimalText(text) {
  const found = new Map();
  const warnings = [];
  for (const rawLine of String(text || '').split(/[\n\r;,]+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const id = matchAnimalName(line);
    if (!id) continue;
    const nums = (line.replace(/(\d)[.\s](?=\d{3}\b)/g, '$1').match(/\d+/g) || []).map(Number);
    if (nums.length !== 1) {
      warnings.push(L(`"${line}": ${ANIMALS[id].tr} için sayı ${nums.length ? 'belirsiz' : 'okunamadı'}.`, `"${line}": count for ${ANIMALS[id].en} is ${nums.length ? 'ambiguous' : 'unreadable'}.`));
      if (!found.has(id)) found.set(id, { id, count: nums.length ? nums[0] : 0, confidence: 'low', note: L('Sayıyı kontrol edin', 'Check the count') });
      continue;
    }
    if (found.has(id)) {
      warnings.push(L(`${ANIMALS[id].tr} birden fazla kez okundu; ilk değer korundu.`, `${ANIMALS[id].en} was read more than once; the first value was kept.`));
      found.get(id).confidence = 'low';
      continue;
    }
    found.set(id, { id, count: nums[0], confidence: 'high', note: '' });
  }
  return normalizeRecognition({ animals: [...found.values()] }, warnings);
}

/**
 * Herhangi bir tanıma kaynağının (yapay zekâ, OCR) çıktısını güvenli biçime getirir.
 * Bilinmeyen hayvanlar atılır, geçersiz sayılar işaretlenir; asla hayvan uydurulmaz.
 */
export function normalizeRecognition(raw, warningsIn = []) {
  const warnings = [...warningsIn];
  const out = [];
  const seen = new Set();
  const list = raw && Array.isArray(raw.animals) ? raw.animals : [];
  if (!raw || !Array.isArray(raw.animals)) warnings.push(L('Tanıma sonucu beklenen biçimde değil.', 'The recognition result is not in the expected format.'));
  for (const item of list) {
    if (!item) continue;
    let id = ANIMAL_IDS.includes(item.id) ? item.id : matchAnimalName(item.id || item.name || '');
    if (!id) { warnings.push(L('Bilinmeyen birim yok sayıldı: ', 'Unknown unit ignored: ') + `"${item.id || item.name || '?'}"`); continue; }
    if (seen.has(id)) { warnings.push(L(`${ANIMALS[id].tr} tekrarlandı; ilk değer korundu.`, `${ANIMALS[id].en} was repeated; the first value was kept.`)); continue; }
    seen.add(id);
    let count = Number(item.count);
    let confidence = item.confidence === 'high' ? 'high' : 'low';
    let note = item.note ? String(item.note).slice(0, 120) : '';
    if (!Number.isInteger(count) || count < 0 || count > 100000) {
      warnings.push(L(`${ANIMALS[id].tr}: sayı geçersiz, elle girin.`, `${ANIMALS[id].en}: invalid count, enter it manually.`));
      count = 0; confidence = 'low'; note = note || L('Sayı okunamadı', 'Count unreadable');
    }
    out.push({ id, count, confidence, note });
  }
  const coords = raw && raw.coords && Number.isInteger(raw.coords.x) && Number.isInteger(raw.coords.y)
    && Math.abs(raw.coords.x) <= 400 && Math.abs(raw.coords.y) <= 400 ? { x: raw.coords.x, y: raw.coords.y } : null;
  return { animals: out, coords, oasisType: (raw && raw.oasisType) || null, warnings, empty: out.length === 0 };
}

/** Metinden "(52|50)" biçimindeki koordinatı bulur. */
export function parseCoords(text) {
  const m = String(text || '').replace(/[‭‬−]/g, (c) => (c === '−' ? '-' : ''))
    .match(/\(?\s*(-?\d{1,3})\s*\|\s*(-?\d{1,3})\s*\)?/);
  return m ? { x: +m[1], y: +m[2] } : null;
}

/** Kahraman ekranı tanıma sonucunu doğrular; okunamayan alanlar null kalır. */
export function normalizeHero(raw) {
  const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : null);
  const r = raw || {};
  return {
    strength: num(r.strength, 0, 1e7), health: num(r.health, 0, 100), level: num(r.level, 0, 999),
    offBonusPct: num(r.offBonusPct, 0, 100), notes: r.notes ? String(r.notes).slice(0, 300) : '',
  };
}
