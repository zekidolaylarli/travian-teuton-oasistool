// Yolculuk hesapları.
// Resmî kaynaklar formül vermiyor ("kesin süre için Toplanma Yeri simülatörünü kullanın"); buradaki
// model topluluk formülüdür ve TAHMİN olarak sunulur:
//   süre = mesafe / hız; ordu hızı = en yavaş birim × sunucu birim hızı çarpanı
//   Turnuva Alanı: ilk 20 kareden sonra hız × (1 + 0,2 × seviye)   [resmî makale: seviye başına +%20]
//   Hun kahramanı: yalnızca atlı birliklerle giderken +3 kare/saat   [resmî Hun rehberi]
//   x2 sunucuda birim hızı çarpanı 2 kabul edilir (ayarlanabilir).

export const DEFAULT_MAP_SIZE = 401; // -200..200, dünya sarmalıdır (resmî: "wraps around like a globe")

export function distance(a, b, mapSize = DEFAULT_MAP_SIZE) {
  let dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  if (mapSize > 0) { dx = Math.min(dx, mapSize - dx); dy = Math.min(dy, mapSize - dy); }
  return Math.sqrt(dx * dx + dy * dy);
}

/** Ordu hızı (kare/saat). counts/uSpeed/uCav paralel dizilerdir. */
export function armySpeed(counts, uSpeed, uCav, hero, travel) {
  let slowest = Infinity, allCav = true, any = false;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0) { any = true; if (uSpeed[i] < slowest) slowest = uSpeed[i]; if (!uCav[i]) allCav = false; }
  }
  if (hero) {
    const hs = +hero.speed || (hero.mounted ? 14 : 7);
    if (hs < slowest) slowest = hs;
    if (travel.hunHeroBonus !== false && allCav && (any || hero.mounted)) slowest += 3;
  }
  if (!isFinite(slowest)) return 0;
  return slowest * (travel.speedFactor || 1);
}

/** Gidiş-dönüş süresi (saat). */
export function tripHours(dist, speed, tsLevel = 0) {
  if (!(speed > 0) || !(dist > 0)) return 0;
  const near = Math.min(dist, 20), far = Math.max(dist - 20, 0);
  const oneWay = near / speed + far / (speed * (1 + 0.2 * (tsLevel || 0)));
  return 2 * oneWay;
}

export function formatHours(h) {
  if (h == null || !isFinite(h)) return '—';
  const s = Math.round(h * 3600);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Boş vahada biriken hammadde tahmini: üretim × hız × saat, depo kapasitesiyle sınırlı. */
export function estimateOasisStock(oasisType, serverSpeed, hours) {
  return oasisType.prod.map((p) => Math.min(oasisType.cap, Math.floor(p * serverSpeed * hours)));
}
