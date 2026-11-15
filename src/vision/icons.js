// Cihaz üzerinde İKON + SAYI tanıma (Travian mobil vaha penceresi: "Askerler" satırında ikon ve sayı
// hapları bulunur, hayvan adı yazmaz). Görüntü cihazdan çıkmaz.
//
// Yöntem:
//  1) Tesseract ile "Askerler" ve "Mesafe" etiketlerinin konumu bulunur → aradaki bant asker satırıdır.
//  2) Bantta panel zemin renginden farklı sütun kümeleri = [ikon + sayı hapı] grupları.
//  3) Her grupta ikon (sol, kare) küçük bir renk parmak izine (12×12 RGB) çevrilir ve bilinen
//     parmak izleriyle karşılaştırılır; sayı, hap bölgesinde yalnızca rakam okutularak alınır.
//  4) Tanınmayan ikon UYDURULMAZ: "bilinmiyor" olarak döner, kullanıcı bir kez seçer ve cihaz öğrenir.
// Bu dosyadaki saf fonksiyonlar (segmentColumns, descriptorDistance, classifyIcon, bonusToOasisType,
// parseTitleCoords) tarayıcı gerektirmez ve testlerde doğrudan çalıştırılır.
import { ANIMAL_IDS } from '../data/nature.js';
import { SEED_ICON_TEMPLATES } from '../data/icon-templates.js';
import { L } from '../i18n.js';

export const DESC_SIZE = 12;
export const MATCH_MAX = 22;     // ortalama kanal farkı bu değerin altındaysa eşleşme kabul edilir
export const MATCH_MARGIN = 8;   // en iyi iki FARKLI hayvan arasındaki asgari fark ("yüksek güven" için)

/** Sütun başına "zemin dışı piksel" sayılarından kümeleri çıkarır. minGap: kümeleri ayıran boşluk. */
export function segmentColumns(cols, minGap = 3, minWidth = 8) {
  const runs = [];
  let s = -1, gap = 0;
  for (let x = 0; x <= cols.length; x++) {
    const on = x < cols.length && cols[x] > 0;
    if (on) { if (s < 0) s = x; gap = 0; }
    else if (s >= 0 && (++gap >= minGap || x === cols.length)) { const e = x - gap; if (e - s + 1 >= minWidth) runs.push([s, e]); s = -1; gap = 0; }
  }
  return runs;
}

export function descriptorDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

export const encodeDescriptor = (d) => btoa(String.fromCharCode(...d));
export const decodeDescriptor = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * @param desc Uint8Array parmak izi
 * @param templates { animalId: string[] (base64) } — yerleşik + cihazda öğrenilenler
 * @returns { id|null, confidence:'high'|'low', distance, runnerUp }
 */
export function classifyIcon(desc, templates) {
  const best = {};
  for (const id of ANIMAL_IDS) {
    for (const enc of (templates && templates[id]) || []) {
      const d = descriptorDistance(desc, typeof enc === 'string' ? decodeDescriptor(enc) : enc);
      if (best[id] == null || d < best[id]) best[id] = d;
    }
  }
  const ranked = Object.entries(best).sort((a, b) => a[1] - b[1]);
  if (!ranked.length || ranked[0][1] > MATCH_MAX) return { id: null, confidence: 'low', distance: ranked.length ? ranked[0][1] : Infinity, runnerUp: null };
  const second = ranked[1] ? ranked[1][1] : Infinity;
  return { id: ranked[0][0], confidence: second - ranked[0][1] >= MATCH_MARGIN ? 'high' : 'low', distance: ranked[0][1], runnerUp: ranked[1] ? ranked[1][0] : null };
}

export function mergeTemplates(learned) {
  const out = {};
  for (const id of ANIMAL_IDS) out[id] = [...(SEED_ICON_TEMPLATES[id] || []), ...((learned && learned[id]) || [])];
  return out;
}

/** Bonus hapları [odun, kil, demir, tahıl] yüzdelerinden vaha türü. Tanınmayan desen → null. */
export function bonusToOasisType(p) {
  if (!Array.isArray(p) || p.length !== 4 || p.some((v) => ![0, 25, 50].includes(v))) return null;
  const [w, c, i, cr] = p, names = ['wood', 'clay', 'iron'], main = [w, c, i];
  const nz = main.filter((v) => v > 0).length;
  if (nz === 0) return cr === 25 ? 'crop25' : cr === 50 ? 'crop50' : null;
  if (nz !== 1) return null;
  const k = main.findIndex((v) => v > 0);
  if (main[k] === 50) return cr === 0 ? names[k] + '50' : null;
  return cr === 0 ? names[k] + '25' : cr === 25 ? names[k] + '25crop' : null;
}

/** Bonus hapı metni ("%25"). OCR "%" işaretini rakam sanabildiği için sondan eşleştirilir. */
export function parseBonusPercent(text) {
  const t = String(text || '').replace(/\s+/g, '');
  const after = t.includes('%') ? t.slice(t.lastIndexOf('%') + 1) : t;
  if (/^(0|25|50)$/.test(after)) return +after;
  if (t.includes('%')) return NaN;
  return /25$/.test(t) ? 25 : /50$/.test(t) ? 50 : /0$/.test(t) ? 0 : NaN;
}

/** Başlıktaki "(149|152)" — OCR çoğu zaman "|" işaretini kaçırır; yalnızca ayraç okunduysa kabul edilir. */
export function parseTitleCoords(text) {
  const m = String(text || '').replace(/[‭‬]/g, '').replace(/−/g, '-').match(/\(\s*(-?\d{1,3})\s*[|Il!¦/\\]\s*(-?\d{1,3})\s*\)/);
  if (!m) return null;
  const x = +m[1], y = +m[2];
  return Math.abs(x) <= 400 && Math.abs(y) <= 400 ? { x, y } : null;
}

// ------------------------- Tarayıcı tarafı -------------------------
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let loading = null;
export function loadTesseract() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  if (!loading) loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.onload = () => resolve(globalThis.Tesseract);
    s.onerror = () => { loading = null; reject(new Error(L('Tanıma kitaplığı indirilemedi (ilk kullanımda internet gerekli).', 'Could not download the recognition library (internet is needed on first use).'))); };
    document.head.appendChild(s);
  });
  return loading;
}

function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
  return c;
}
function crop(src, x, y, w, h, scale = 1, pad = 0) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale) + 2 * pad); c.height = Math.max(1, Math.round(h * scale) + 2 * pad);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, w, h, pad, pad, c.width - 2 * pad, c.height - 2 * pad);
  return c;
}
function descriptorOf(src, x, y, w, h) {
  const c = document.createElement('canvas'); c.width = c.height = DESC_SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, w, h, 0, 0, DESC_SIZE, DESC_SIZE);
  const d = ctx.getImageData(0, 0, DESC_SIZE, DESC_SIZE).data, out = new Uint8Array(DESC_SIZE * DESC_SIZE * 3);
  for (let i = 0, j = 0; i < d.length; i += 4) { out[j++] = d[i]; out[j++] = d[i + 1]; out[j++] = d[i + 2]; }
  return out;
}

/** Bir yatay bantta zemin rengini ve [ikon+hap] kümelerini bulur. */
function clustersInBand(ctx, W, y0, y1, xMin, xMax) {
  const H = y1 - y0;
  if (H < 8) return { clusters: [], bg: null };
  const d = ctx.getImageData(0, y0, W, H).data;
  const hist = new Map();
  for (let i = 0; i < d.length; i += 16) { const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3); hist.set(k, (hist.get(k) || 0) + 1); }
  let bk = 0, bn = -1;
  for (const [k, n] of hist) if (n > bn) { bn = n; bk = k; }
  const bg = [((bk >> 10) << 3) + 4, (((bk >> 5) & 31) << 3) + 4, ((bk & 31) << 3) + 4];
  const cols = new Array(W).fill(0), rowsOf = (xa, xb) => {
    let top = H, bot = -1;
    for (let y = 0; y < H; y++) for (let x = xa; x <= xb; x++) {
      const i = (y * W + x) * 4;
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 90) { if (y < top) top = y; if (y > bot) bot = y; break; }
    }
    return [top, bot];
  };
  for (let x = xMin; x <= xMax; x++) {
    let n = 0;
    for (let y = 0; y < H; y++) { const i = (y * W + x) * 4; if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40) n++; }
    cols[x] = n;
  }
  const clusters = segmentColumns(cols, Math.max(3, Math.round(H * 0.06)), Math.round(H * 0.35))
    .filter(([s, e]) => s > xMin && e < xMax) // panel kenarına yapışık kümeler (harita, çerçeve) atılır
    .map(([s, e]) => { const [t, b] = rowsOf(s, Math.min(e, s + Math.round((e - s) * 0.5))); return { x0: s, x1: e, top: y0 + t, bottom: y0 + b }; })
    .filter((c) => c.bottom > c.top);
  return { clusters, bg };
}

async function readDigits(worker, src, x, y, w, h, whitelist, confirm = false) {
  if (w < 4 || h < 4) return { text: '', conf: 0 };
  await worker.setParameters({ tessedit_char_whitelist: whitelist, tessedit_pageseg_mode: '7' });
  // Siyah-beyaza çevirmek şart: gerçek ekran görüntüsünde ham kırpımda 4 rakamdan 2'si okunurken
  // eşiklenmiş kırpımda 4/4 okundu. Koyu zeminde (başlık) kutuplar ters çevrilir.
  const c = crop(src, x, y, w, h, Math.max(1, 104 / h), 20), g = c.getContext('2d'), im = g.getImageData(0, 0, c.width, c.height), p = im.data;
  let mean = 0;
  for (let i = 0; i < p.length; i += 4) { const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]; p[i + 3] = l; mean += l; }
  const dark = mean / (p.length / 4) < 128;
  for (let i = 0; i < p.length; i += 4) { const ink = dark ? p[i + 3] > 150 : p[i + 3] < 170; p[i] = p[i + 1] = p[i + 2] = ink ? 0 : 255; p[i + 3] = 255; }
  g.putImageData(im, 0, 0);
  const { data } = await worker.recognize(c);
  const text = (data.text || '').replace(/\s+/g, '');
  let conf = data.confidence || 0;
  // Tesseract'ın güven puanı doğru okumalarda bile 0 dönebiliyor (gerçek görüntülerde gözlendi).
  // Bu yüzden düşük puanda ikinci, bağımsız bir sayfa kipiyle yeniden okunur; iki okuma aynıysa kabul edilir.
  if (confirm && text && conf < 60) {
    await worker.setParameters({ tessedit_pageseg_mode: '8' });
    const again = await worker.recognize(c);
    if ((again.data.text || '').replace(/\s+/g, '') === text) conf = 75;
  }
  return { text, conf };
}

/**
 * Mobil vaha penceresini okur.
 * @returns { layout:boolean, rows:[{id,count,confidence,note,descriptor(base64),thumb(dataURL)}], coords, oasisType, warnings }
 *   layout=false → "Askerler" satırı bulunamadı (başka bir ekran düzeni); çağıran metin OCR'ına dönebilir (rawText).
 */
export async function recognizeIconScreenshot(img, learnedTemplates, onProgress) {
  const T = await loadTesseract();
  const src = toCanvas(img), W = src.width, ctx = src.getContext('2d', { willReadFrequently: true });
  const worker = await T.createWorker('tur+eng', 1, { logger: (m) => { if (onProgress && m.status === 'recognizing text') onProgress(m.progress); } });
  try {
    const { data } = await worker.recognize(src);
    const words = data.words || [], warnings = [];
    const find = (re) => words.find((w) => re.test(w.text.toLowerCase()) && w.confidence > 50);
    const lab = find(/^(askerler|birlikler|troops|truppen)\b/), dist = find(/^(mesafe|distance|entfernung)\b/);
    const out = { layout: false, rows: [], coords: parseTitleCoords(data.text), oasisType: null, warnings, rawText: data.text || '' };
    if (!lab) return out;
    const lh = lab.bbox.y1 - lab.bbox.y0;
    const y0 = lab.bbox.y1 + Math.round(lh * 0.2);
    const y1 = dist && dist.bbox.y0 > y0 + lh * 2 ? dist.bbox.y0 - Math.round(lh * 0.15) : Math.min(src.height, y0 + Math.round(lh * 6.5));
    // Panelin yatay sınırları: etiketin hemen üstündeki satırda zemin rengi sürdükçe sağa/sola git
    const probeY = Math.max(0, lab.bbox.y0 - Math.round(lh * 0.35));
    const row = ctx.getImageData(0, probeY, W, 1).data, at = (x) => [row[x * 4], row[x * 4 + 1], row[x * 4 + 2]];
    const ref = at(Math.max(0, lab.bbox.x0 - 2)), near = (p) => Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]) < 60;
    let xMin = lab.bbox.x0, xMax = lab.bbox.x0;
    while (xMin > 0 && near(at(xMin - 1))) xMin--;
    while (xMax < W - 1 && near(at(xMax + 1))) xMax++;
    if (xMax - xMin < W * 0.3) { xMin = 0; xMax = W - 1; }
    out.layout = true;

    const { clusters } = clustersInBand(ctx, W, y0, y1, xMin, xMax);
    const templates = mergeTemplates(learnedTemplates);
    for (const c of clusters) {
      const ih = c.bottom - c.top + 1;                 // ikon yüksekliği ≈ ikon genişliği
      const iw = Math.min(ih, c.x1 - c.x0 + 1);
      const desc = descriptorOf(src, c.x0, c.top, iw, ih);
      const cls = classifyIcon(desc, templates);
      const dx = c.x0 + Math.round(ih * 1.0), dw = c.x1 - dx - Math.round(ih * 0.06);
      const dy = c.top + Math.round(ih * 0.2), dh = Math.round(ih * 0.6);
      const num = await readDigits(worker, src, dx, dy, dw, dh, '0123456789', true);
      const ok = /^\d{1,5}$/.test(num.text) && num.conf >= 60;
      const count = /^\d{1,5}$/.test(num.text) ? parseInt(num.text, 10) : 0;
      const notes = [];
      if (!cls.id) notes.push(L('İkon tanınmadı — hayvanı seçin', 'Icon not recognised — pick the animal'));
      else if (cls.confidence === 'low') notes.push(L('İkon eşleşmesi zayıf', 'Weak icon match'));
      if (!ok) notes.push(num.text ? L('Sayı emin değil', 'Count uncertain') : L('Sayı okunamadı', 'Count unreadable'));
      out.rows.push({
        id: cls.id, count, confidence: cls.id && cls.confidence === 'high' && ok ? 'high' : 'low', note: notes.join('; '),
        box: [c.x0, c.x1, c.top, c.bottom], digits: num.text, digitConf: Math.round(num.conf), distance: Math.round(cls.distance),
        descriptor: encodeDescriptor(desc), thumb: crop(src, c.x0, c.top, c.x1 - c.x0 + 1, ih, Math.min(1, 64 / ih)).toDataURL('image/png'),
      });
    }

    // Bonus satırı (odun, kil, demir, tahıl) → vaha türü. Okunamazsa null bırakılır.
    const D = y1 - y0, by0 = Math.max(0, lab.bbox.y0 - Math.round(D * 0.78)), by1 = lab.bbox.y0 - Math.round(lh * 0.3);
    const bonus = clustersInBand(ctx, W, by0, by1, xMin, xMax).clusters;
    out.bonusClusters = bonus.length;
    if (bonus.length === 4) {
      const p = [], raw = [];
      for (const c of bonus) {
        const cw = c.x1 - c.x0 + 1, ih = c.bottom - c.top + 1;
        const r = await readDigits(worker, src, c.x0 + Math.round(cw * 0.5), c.top, Math.round(cw * 0.46), ih, '%0123456789');
        p.push(parseBonusPercent(r.text));
        raw.push(r.text);
      }
      out.oasisType = bonusToOasisType(p);
      out.bonusRaw = raw;
    }
    // Koordinat: başlık satırını yalnızca ilgili karakterlerle yeniden oku
    if (!out.coords) {
      // "(" içeren ilk sözcükten satır sonuna kadar olan bölge (OCR koordinatı birkaç sözcüğe bölebilir)
      const first = words.find((w) => w.text.includes('(') && w.bbox.y1 < lab.bbox.y0);
      if (first) {
        const same = words.filter((w) => w.bbox.x0 >= first.bbox.x0 && w.bbox.y0 < first.bbox.y1 && w.bbox.y1 > first.bbox.y0);
        const bx0 = first.bbox.x0, bx1 = Math.max(...same.map((w) => w.bbox.x1)), byA = Math.min(...same.map((w) => w.bbox.y0)), byB = Math.max(...same.map((w) => w.bbox.y1));
        const pad = Math.round((byB - byA) * 0.3);
        const r = await readDigits(worker, src, Math.max(0, bx0 - pad), Math.max(0, byA - pad), Math.min(W - bx0, bx1 - bx0 + 2 * pad), byB - byA + 2 * pad, '()|-0123456789');
        out.coords = parseTitleCoords(r.text);
        out.titleRaw = r.text;
      }
    }
    if (!out.rows.length) warnings.push(L('"Askerler" satırında hayvan bulunamadı (vaha boş olabilir).', 'No animals found in the "Troops" row (the oasis may be empty).'));
    return out;
  } finally { await worker.terminate(); }
}
