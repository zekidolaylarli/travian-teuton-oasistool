// Küçük iki dilli yardımcı: L('Türkçe', 'English'). Varsayılan Türkçe (testler de Türkçe çalışır).
let lang = 'tr';
export const getLang = () => lang;
export function setLang(l) { lang = l === 'en' ? 'en' : 'tr'; }
export const L = (tr, en) => (lang === 'en' ? en : tr);
/** { tr, en } alanları olan veri nesnesinin (birim, hayvan, vaha türü…) adını döndürür. */
export const nameOf = (o) => (o ? (lang === 'en' && o.en ? o.en : o.tr) : '');
export const locale = () => (lang === 'en' ? 'en-GB' : 'tr-TR');
