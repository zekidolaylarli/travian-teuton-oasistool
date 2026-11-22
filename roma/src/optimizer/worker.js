// Web Worker: optimizasyonu arayüzü kilitlemeden çalıştırır.
import { compareHeroModes, findNoLossArmy } from './optimizer.js';

self.onmessage = (e) => {
  const { id, kind, baseConfig, heroCfg, max, prefs } = e.data;
  try {
    let last = 0;
    const tick = (p) => { if (p - last >= 0.02) { last = p; self.postMessage({ id, progress: p }); } };
    // kind 'noLoss': kayıpsız garantili ordu (baseConfig.animals = en kötü durum, hero dahil edilmiş gelir)
    const result = kind === 'noLoss' ? findNoLossArmy(baseConfig, max, prefs, tick) : compareHeroModes(baseConfig, heroCfg, max, prefs, tick);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
