# Cermen Vaha Aracı

Travian: Legends için vaha savaş simülatörü ve optimal Cermen ordusu bulucu
(Tokmak Sallayan / Balta Sallayan / Paladin / Toton Şövalyesi). [Hun Vaha Aracı](https://github.com/tbarissatir/travian-hun-oasistool)'nın
Cermen birimlerine uyarlanmış sürümüdür; savaş motoru aynıdır.
Bağımsız bir karar destek aracıdır: Travian hesabına giriş yapmaz, şifre istemez, saldırı göndermez.

Derleme adımı ve bağımlılık yoktur: düz HTML + ES modülleri. Veriler yalnızca cihazda (tarayıcı deposu) tutulur.

> **Hun sürümü de bu depoda:** [`hun/`](hun/) klasöründe Hun Vaha Aracı'nın "kayıpsız garanti" eklenmiş kopyası durur
> (kaynak: [tbarissatir/travian-hun-oasistool](https://github.com/tbarissatir/travian-hun-oasistool)). GitHub Pages'te adresi: `…/travian-teuton-oasistool/hun/`

## Çalıştırma

```bash
npm start
```

Tarayıcıda `http://localhost:5173` adresini açın. (ES modülleri nedeniyle `index.html` dosyasını doğrudan
`file://` ile açmak çalışmaz; herhangi bir statik sunucu yeterlidir.)

### iPhone'da kullanma (PWA)

1. Depoyu GitHub Pages ile yayınlayın: **Settings → Pages → Deploy from a branch → `main` / root**.
2. iPhone Safari'de `https://<kullanıcı>.github.io/travian-teuton-oasistool/` adresini açın.
3. **Paylaş → Ana Ekrana Ekle.** İlk açılıştan sonra internet olmadan da elle giriş, simülasyon ve optimizasyon çalışır.

## Testler

```bash
npm test
```

31 test (Hun aracındaki 30 maddelik şartnamenin Cermen uyarlaması + birim üçlüleri). Node 20+ gerekir.

## Kullanım akışı

1. **Vaha** sekmesi: ekran görüntüsünü yükleyin → "Yapay zekâ ile tanı" veya "Cihazda OCR" → sayıları kontrol edin
   (ya da doğrudan elle girin / metin yapıştırın).
2. Kahraman katılımını seçin: Kahramansız / Kahramanla / Yalnız kahraman.
3. **En İyi Kadroyu Bul.** Önerilen ordu, savaş sonucu, ekonomik verimlilik, alternatif stratejiler ve Pareto listesi görünür.
4. **Simülatör**: istediğiniz kadroyu elle deneyin; gerçek oyun sonucunu referans vaka olarak kaydedin.
5. **Rainbow**: köy/vaha koordinatı, yolculuk süresi, saatlik kâr, kayıtlı vaha listesi.
6. **Profil / Ayarlar**: asker sayıları, **optimizasyona girecek üç birim**, demirci seviyeleri ve formülü, kahraman, kayıp sınırı (%50), kâr eşiği (%90),
   güvenli yuvarlama uzaklığı, ağırlıklar, dil, tema, API anahtarı.

Sağ üstteki düğmelerle dil (TR/EN) ve açık/koyu tema değiştirilir; seçimler cihazda saklanır.

### Öneri türleri

| Öneri | Kural |
|---|---|
| Dengeli | Kâr eşiğini sağlayan, en az ordu değeri bağlayan kadro |
| **En güvenli** | Kâr eşiğini sağlayan kadrolar içinde, her asker/hayvan türünün kesirli kaybı 0,5 yuvarlama sınırından en az *güvenli uzaklık* (varsayılan 0,10) kadar uzak olan **en ucuz** ordu. Öyle bir kadro yoksa ulaşılabilen en iyi uzaklık dilimindeki en ucuz ordu seçilir ve bu açıkça belirtilir |
| En yüksek net kâr / Minimum asker / Sıfır kayıp / En yüksek sermaye verimliliği / En düşük kahraman riski / En yüksek saatlik kâr | Adlarındaki ölçüt |

Her sonuçta "yuvarlama sınırına uzaklık" (0 = tam sınırda, 0,5 = en uzak) gösterilir.

### Demirci

Profil sekmesinde her askerin demirci seviyesini (0–20) güncelleyin; yükseltilmiş saldırı değeri yanında gösterilir.
Formül aynı yerden ayarlanabilir: varsayılan `taban + (taban + 300/7 × tüketim) × (1,007^seviye − 1)` (Kirilloid, T4),
alternatif olarak seviye başına sabit yüzde; çarpan, katsayı ve yuvarlama (yok / en yakın / aşağı) değiştirilebilir.
Resmî kaynak formül yayımlamadığı için oyundaki asker istatistik ekranıyla karşılaştırmanız önerilir.

### Cermenlere özgü farklar

- **Piyade + süvari karışık:** Tokmak Sallayan ve Balta Sallayan piyade, Paladin ve Toton Şövalyesi süvaridir.
  Hayvanların savunması, saldırının piyade/süvari payına göre ağırlıklanır; Vaha sekmesinde iki savunma değeri de gösterilir.
- **Birim üçlüsü:** arama tam üç birim türüyle yapılır. Profil'den seçilir: Tokmak + Balta + Toton (varsayılan),
  Tokmak + Paladin + Toton, Tokmak + Balta + Paladin, Balta + Paladin + Toton. Simülatör bütün birimleri kabul eder.
- **Kahraman:** Cermen kahramanının hız bonusu yoktur (Hunlardaki +3 kaldırıldı); orduyla en yavaş birimin hızında gider.
  Kavim bonusu (sığınak kapasitesi −%20) vahalarda etkisizdir. Silah listesi Cermen silahlarıdır.
- **Küçük ordular pahalıya patlar:** kayıplar tür başına yuvarlandığı için ucuz piyade kolayca 1–2 asker kaybeder;
  orta/büyük vahalar çoğunlukla ancak kalabalık karma orduyla kârlı çıkar. Profildeki asker sayılarını gerçek sayılarınızla girin.

## Mimari

| Dosya | Görev |
|---|---|
| `src/data/units.js`, `nature.js` | Cermen birimleri, silahlar, birim üçlüleri, 10 doğa birimi, vaha türleri |
| `src/engine/battle.js` | **Tek savaş motoru** (saldırı, savunma, kayıp, yuvarlama, kahraman, ekonomi) |
| `src/engine/travel.js` | Mesafe, yolculuk süresi, vaha stok tahmini |
| `src/optimizer/optimizer.js` | Eksiksiz tarama + baskınlık elemesi + Pareto; `worker.js` Web Worker sarmalayıcısı |
| `src/vision/` | `parse.js` (doğrulama, metin ayrıştırma), `claude.js` (yapay zekâ), `icons.js` (cihaz içi ikon + sayı tanıma) |
| `src/data/references.js` | Gerçek oyun sonuçları (referans vakalar) |
| `src/ui/` | Arayüz ve yerel kayıt |
| `src/i18n.js` | Türkçe / İngilizce metin yardımcıları |

Simülatör ve optimizasyon aynı `createScenario().evaluate()` fonksiyonunu kullanır; ikinci bir savaş hesabı yoktur.

## Savaş modeli

- Saldırı = Σ (demirci(taban) + silah bonusu) × adet + kahraman gücü, × bonuslar
- Savunma = hayvan savunmaları (saldırının piyade/süvari payına göre ağırlıklı) + 10 vaha taban savunması
- Yağma: `x = (kaybeden/kazanan)^K`, kazanan kaybı `x/(1+x)`, kaybeden kaybı `1 − x/(1+x)`
- Normal saldırı: kazanan kaybı `x`, kaybeden %100
- `K = 2·(1,8592 − N^0,015)`, [1,2578 – 1,5]; toplam birim ≤ 1000 iken 1,5
- Kayıplar **her birim türü için ayrı** yuvarlanır
- Hayvan ödülü = öldürülen tahıl tüketimi × 40 × 4 hammadde (kahraman heybesine; kahraman katılmasa da, ordu ölse de verilir)

## Doğrulama durumu

| Durum | Kapsam |
|---|---|
| **Doğrulandı** (Hun aracında iki gerçek oyun simülasyonu, birebir; motor aynı) | Yağma kayıp formülü, birim bazlı yuvarlama, +10 taban savunma, sıçan/örümcek/yarasa süvari savunması, hayvan ödülü |
| **Resmî tabloyla uyumlu** | Demirci seviye 20 saldırı değerleri: Tokmak 52,4 · Balta 75,4 · Paladin 76,0 · Toton 191,6 |
| **Oyunla henüz karşılaştırılmadı** | Cermen birimleriyle gerçek savaş sonucu; hayvanların **piyade** savunma değerleri (üçüncü taraf tablo). İlk saldırılarınızı Simülatör'den referans olarak kaydedin |
| **Resmî kaynakla uyumlu** | (Hun rehberi) 1/1/1 kadrosu 410 savunmaya kadar kayıpsız → tam 0,5 saldırgan lehine aşağı yuvarlanır |
| **Varsayım** | Hayvan kaybında tam 0,5 yukarı; demirci formülünde yuvarlama yok; büyük savaş üssünün yağmada da geçerli olması; diğer hayvanların savunma değerleri (üçüncü taraf tablo) |
| **Model tahmini** | Kahraman can kaybı = saldırgan kayıp yüzdesi (− zırh). Resmî formül yayımlanmamıştır; gerçek raporlarla kalibrasyon gerekir |
| **Tahmin** | Yolculuk süreleri (resmî formül yok), boş vahada yağmalanabilir oran, depo kapasitesinin sunucu hızıyla ölçeklenmesi |
| **Hesaplanmaz** | Hayvan yeniden doğma zamanı ve sayısı (resmî kaynaklarda yok) |

Arayüzde her sonuç **Doğrulanmış / Matematiksel tahmin / Dikkat–sınırda** etiketlerinden birini taşır; uydurma güven yüzdesi gösterilmez.

## Görüntü tanıma

- **Yapay zekâ (isteğe bağlı, haricî servis):** görüntü, sizin API anahtarınızla doğrudan tarayıcıdan Anthropic API'sine gönderilir.
  Açık izin ve anahtar gerekir (Ayarlar). Anahtar yalnızca cihazda saklanır ve dışa aktarıma dahil edilmez.
- **Cihazda tanı (ikon + sayı):** görüntü cihazdan çıkmaz; Tesseract.js ve dil verisi ilk kullanımda jsDelivr'den indirilir.
  Mobil vaha penceresindeki "Askerler" satırını bulur, her ikonu renk parmak iziyle eşleştirir, sayıyı rakam OCR'ı ile okur;
  koordinatı ve bonus satırından vaha türünü de çıkarır. Fil dışındaki dokuz hayvan yerleşik tanınır;
  fil (ve tanınmayan her ikon) ilk karşılaşmada bir kez seçilir ve cihazda öğrenilir. Tanınmayan ikon asla tahmin edilmez.
  "Askerler" satırı yoksa (ör. masaüstü düzeni) yazıyla görünen hayvan adlarını okumaya düşer.
- **Elle giriş / metin yapıştırma:** her zaman, internet olmadan çalışır.

Tanıma çıktısı her durumda doğrulanır: bilinmeyen hayvan eklenmez, okunamayan sayı sıfırlanıp işaretlenir.

## Bilinen sınırlar

- Yapay zekâ tanıma gerçek bir API anahtarıyla test edilmedi. Cihazda tanı beş gerçek mobil ekran görüntüsüyle
  (hepsi aynı telefon, 924×2000) doğrulandı: 18 hayvan satırı, 5 koordinat ve 5 vaha türü doğru okundu.
  Farklı çözünürlük, tema veya dilde ikon eşleşmesi tutmayabilir — o durumda ikon
  "tanınmadı" olarak gelir ve seçmeniz istenir. Sayıları her zaman görüntüyle karşılaştırın.
- Kahraman can kaybı doğrulanmamıştır; kahramanlı öneriler her zaman "Dikkat" olarak işaretlenir.
- Arama uzayı 6 milyon kombinasyonu aşarsa sınırlar küçültülür ve sonuç "sınırlı arama" olarak belirtilir.

## Kaynaklar

- support.travian.com: Battle mechanics (63), Combat simulator (18), Smithy (40), Oasis (48), Hero health (47),
  Hero overview, Hero items, 5 things about Huns (147), Oasis farming (185, 190), Tournament Square (71),
  Infantry and cavalry units comparison table (187)
- unofficialtravian.com — Kirilloid: Combat basics; Smithy and total strength of an army
- Kirilloid / travian.fandom.com — Cermen birim tablosu (standart sunucu değerleri); siegewise.com — Nature birim tablosu
