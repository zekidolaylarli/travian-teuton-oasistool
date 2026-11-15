// Web Worker: optimizasyonu arayüzü kilitlemeden çalıştırır.
import { compareHeroModes } from './optimizer.js';

self.onmessage = (e) => {
  const { id, baseConfig, heroCfg, max, prefs } = e.data;
  try {
    let last = 0;
    const result = compareHeroModes(baseConfig, heroCfg, max, prefs, (p) => {
      if (p - last >= 0.02) { last = p; self.postMessage({ id, progress: p }); }
    });
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
