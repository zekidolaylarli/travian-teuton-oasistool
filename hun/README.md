# Hun Vaha Aracı

Travian: Legends için vaha savaş simülatörü ve optimal Hun ordusu bulucu (Bozkır Atlısı / Nişancı / Yağmacı).

**Canlı sürüm:** https://tbarissatir.github.io/travian-hun-oasistool/

Vahanın ekran görüntüsünü yüklersiniz; uygulama hayvanları okur ve hangi kadroyu göndermeniz gerektiğini,
beklenen asker kaybını, net kârı ve ekonomik kayıp oranını söyler.

Bağımsız bir karar destek aracıdır: Travian hesabına giriş yapmaz, şifre istemez, saldırı göndermez.
Bütün veriler yalnızca cihazınızda (tarayıcı deposu) tutulur.

## Özellikler

- **Savaş simülatörü** — oyunun simülatörüyle aynı hesap: yağma / normal saldırı, birim türü bazında yuvarlama,
  demirci seviyeleri, kahraman, silah bonusları
- **Optimal ordu bulucu** — üç Hun süvarisinin bütün kombinasyonlarını tarar; kayıp oranı sınırı (%50), kâr eşiği
  ve kahraman sağlığına göre süzer
- **Dokuz öneri türü** — Dengeli, En güvenli, En yüksek net kâr, Minimum asker, Sıfır kayıp ve diğerleri, artı Pareto listesi
- **Ekran görüntüsünden tanıma** — cihaz üzerinde ikon + sayı okuma (görüntü cihazdan çıkmaz), isteğe bağlı yapay zekâ
- **Kahraman** — kahramansız / kahramanla / yalnız kahraman karşılaştırması, asgari sağlık sınırı
- **Rainbow Village** — mesafe, yolculuk süresi, saatlik kâr, kayıtlı vaha listesi
- **Türkçe / İngilizce** arayüz, **açık / koyu** tema (sağ üstteki düğmeler)
- **PWA** — iPhone ana ekranına eklenir, ilk açılıştan sonra internetsiz çalışır

## iPhone'da kullanma

1. Canlı sürüm bağlantısını **Safari** ile açın.
2. **Paylaş → Ana Ekrana Ekle.**
3. Ana ekrandaki simgeden açın ve **Profil** sekmesinde asker sayılarınızı, demirci seviyelerinizi ve kahramanınızı girin.

Herkesin verisi kendi cihazında kalır; bağlantıyı paylaştığınız kişi sizin profilinizi görmez.
Elle giriş, simülatör ve optimizasyon internetsiz çalışır; görüntü tanıma ilk kullanımda internet ister.

## Kullanım akışı

1. **Vaha** sekmesi → **Görüntü seç** → **Cihazda tanı (ikon + sayı)**. Okunan hayvanları ve sayıları kontrol edin.
   Görüntü olmadan elle girebilir veya metin yapıştırabilirsiniz.
2. Kahraman katılımını seçin: Kahramansız / Kahramanla / Yalnız kahraman.
3. **En İyi Kadroyu Bul.** Önerilen ordu, savaş sonucu, ekonomik verimlilik, alternatif stratejiler ve Pareto listesi görünür.
4. **Simülatör** — istediğiniz kadroyu elle deneyin; gerçek oyun sonucunu referans vaka olarak kaydedin.
5. **Rainbow** — köy ve vaha koordinatı, yolculuk süresi, saatlik kâr, kayıtlı vahalar.
6. **Profil** — asker sayıları, demirci seviyeleri ve formülü, kahraman, sunucu.
7. **Ayarlar** — dil, tema, kayıp sınırı, kâr eşiği, güvenli yuvarlama uzaklığı, hammadde ağırlıkları, görüntü tanıma,
   referans vakalar, geçmiş, dışa / içe aktarma.

## Öneri türleri

"Kâr eşiği", en yüksek net kârın belirli bir yüzdesidir (varsayılan %90, 50–100 arası ayarlanır).

| Öneri | Kural |
|---|---|
| **Dengeli** (varsayılan) | Kâr eşiğini sağlayan, en az ordu değeri bağlayan kadro |
| **En güvenli** | Kâr eşiğini sağlayan kadrolar içinde, her asker ve hayvan türünün kesirli kaybı 0,5 yuvarlama sınırından en az *güvenli uzaklık* (varsayılan 0,10) kadar uzak olan **en ucuz** ordu. Öyle bir kadro yoksa ulaşılabilen en iyi uzaklıktaki en ucuz ordu seçilir ve bu açıkça belirtilir |
| En yüksek net kâr | Kayıp sınırına uyan en yüksek mutlak kâr |
| Minimum asker | Kâr eşiğini sağlayan en az sayıda asker |
| Sıfır asker kaybı | Hiç asker kaybetmeyen en ekonomik küçük ordu |
| En yüksek sermaye verimliliği | Net kâr / bağlanan ordu değeri en yüksek kadro |
| En düşük kahraman riski | Kâr eşiğini sağlarken kahramanın en az can kaybettiği kadro |
| En yüksek saatlik kâr | Tek döngüde saat başına en yüksek net kâr (koordinat girildiyse) |
| Küçük ordu fırsatı | Kârın en az %75'ini, en kârlı ordunun en çok %20'si kadar askerle sağlayan kadro (varsa) |

Her sonuçta **yuvarlama sınırına uzaklık** gösterilir: 0 = tam sınırda (bir asker farkla sonuç değişebilir), 0,5 = en uzak.

### Neden "en güvenli" ayrı bir seçenek?

Kayıplar her birim türü için ayrı yuvarlanır. Örneğin 10 Bozkır Atlısının hesaplanan kaybı 1,4999 ise 1 asker ölür;
1,5001 olsaydı 2 asker ölürdü. Sınıra bu kadar yakın bir kadroda modeldeki küçük bir sapma sonucu değiştirir.
"En güvenli" seçenek bu riski, gerekenden fazla asker bağlamadan azaltır.

## Kayıpsız garanti (yeniden doğma payı)

Vaha sekmesindeki 4. kart: gece yeni hayvan doğsa bile **hiç asker kaybetmeden** yağmalayan **en az askerli** orduyu bulur.

1. Vahadaki şu anki hayvanları girin (temizlediyseniz boş bırakın).
2. "En fazla doğabilecek hayvanlar" alanına, bunlara **ek olarak** en çok kaç hayvan doğabileceğini yazın
   ("Şu ankiler kadar daha (×2)" düğmesi hızlı doldurur). Vahayı listeye kaydederseniz bu pay da saklanır.
3. **Kayıpsız Garantili Kadroyu Bul.**

Sonuç: önerilen ordu, en kötü durumdaki savunma ve **kayıpsız kalınan azami savunma**. Sabah vahanın
"süvariye karşı savunma" değeri bu sayıyı geçmiyorsa ordu kayıp vermez.

- Kural: her asker türünün kesirli kaybı 0,5'e ulaşmadıkça o türden asker ölmez. Öneri, 0,5 sınırına
  *güvenli uzaklık* (Ayarlar, varsayılan 0,10) kadar pay bırakır; paysız asgari ordu ayrıca gösterilir.
- En kötü duruma karşı kayıpsız olan ordu, daha az hayvan içeren her duruma karşı da kayıpsızdır
  (savunma her hayvanla artar). Testlerde en kötü durumun bütün alt kümeleriyle doğrulanır.
- Eldeki asker yetmezse gereken en küçük ordu (tür başına 150'ye kadar aranarak) bildirilir.
- **Sınır:** doğma hızı ve sayısı resmî kaynaklarda yoktur; araç bunu tahmin etmez. Garanti, girdiğiniz
  üst sınır aşılmadığı sürece geçerlidir. Kahraman katılırsa can kaybeder; garanti yalnızca askerler içindir.

## Olasılıklar çubuğu

"En İyi Kadroyu Bul"dan sonra önerilen ordunun altında bir kaydırma çubuğu çıkar. Çubuktaki her durak,
optimizasyonun bulduğu o asker sayısındaki en kârlı kadrodur; soldan sağa asker sayısı artar ve çubuk açılışta
önerilen ordudadır. Kaydırdıkça **gelir** (hayvan ödülü + normal yağma), **gider** (ölen askerlerin hammadde
başına maliyeti) ve **net kâr** anlık değişir; kayıp oranı, ordu değeri, tahıl tüketimi ve yuvarlama sınırına
uzaklık da gösterilir. ◀ ▶ ile tek tek ilerlenir, "Simülatöre aktar" seçili kadroyu Simülatör'e taşır.

## Demirci

Demircide bir askeri geliştirdiğinizde **Profil** sekmesinde o askerin seviyesini (0–20) güncelleyin;
yükseltilmiş saldırı değeri hemen yanında gösterilir ve bütün hesaplara yansır.

Formül aynı yerden ayarlanabilir ("Demirci formülü"):

- **T4 (varsayılan):** `taban + (taban + 300/7 × tahıl tüketimi) × (1,007^seviye − 1)` — Kirilloid
- **Sabit yüzde:** `taban × (1 + yüzde/100)^seviye`
- Seviye çarpanı, tüketim katsayısı ve yuvarlama (yok / en yakın tam sayı / aşağı) değiştirilebilir.

Resmî kaynak formül yayımlamaz. Oyundaki asker istatistik ekranında gördüğünüz değerle bir kez karşılaştırmanız önerilir.

## Görüntü tanıma

| Yöntem | Nasıl çalışır |
|---|---|
| **Cihazda tanı (ikon + sayı)** | Görüntü cihazdan çıkmaz, anahtar gerekmez. Mobil vaha penceresindeki "Askerler" satırını bulur, her ikonu renk parmak iziyle eşleştirir, sayıyı rakam okuma ile alır; koordinatı ve bonus satırından vaha türünü de çıkarır. Tesseract.js ve dil verisi ilk kullanımda jsDelivr'den indirilir |
| **Yapay zekâ ile tanı** (isteğe bağlı) | Görüntü, sizin API anahtarınızla doğrudan tarayıcıdan Anthropic API'sine gönderilir. Ayarlar'dan açık izin ve anahtar gerekir. Anahtar yalnızca cihazda saklanır, dışa aktarıma dahil edilmez |
| **Elle giriş / metin yapıştırma** | Her zaman, internetsiz çalışır |

- **Yerleşik tanınan hayvanlar:** sıçan, örümcek, yılan, yarasa, yaban domuzu, kurt, ayı, timsah, kaplan.
- **Fil ve tanınmayan her ikon:** "tanınmadı" olarak gelir; listeden bir kez seçersiniz, cihaz öğrenir ve sonra kendisi tanır.
- Tanınmayan ikon asla tahmin edilmez; okunamayan sayı sıfırlanıp işaretlenir. Emin olunmayan değerler ⚠ ile gösterilir.
- "Askerler" satırı bulunamazsa (ör. masaüstü düzeni) yazıyla görünen hayvan adlarını okumaya düşer.

## Savaş modeli

- Saldırı = Σ (demirci(taban) + silah bonusu) × adet + kahraman gücü, × bonuslar
- Savunma = hayvan savunmaları (saldırının piyade / süvari payına göre ağırlıklı) + 10 vaha taban savunması
- Yağma: `x = (kaybeden/kazanan)^K`, kazanan kaybı `x/(1+x)`, kaybeden kaybı `1 − x/(1+x)`
- Normal saldırı: kazanan kaybı `x`, kaybeden %100
- `K = 2·(1,8592 − N^0,015)`, 1,2578–1,5 arası; toplam birim ≤ 1000 iken 1,5
- Kayıplar **her birim türü için ayrı** yuvarlanır
- Hayvan ödülü = öldürülen tahıl tüketimi × 40 × 4 hammadde (kahraman heybesine; kahraman katılmasa da, ordu ölse de verilir)
- Net kâr = hayvan ödülü + normal yağma − kaybedilen askerlerin maliyeti. Sağ dönen askerler maliyet sayılmaz.

## Doğrulama durumu

| Durum | Kapsam |
|---|---|
| **Doğrulandı** (iki gerçek oyun simülasyonu, birebir) | Yağma kayıp formülü, birim bazlı yuvarlama, +10 taban savunma, sıçan / örümcek / yarasa süvari savunması, hayvan ödülü |
| **Resmî kaynakla uyumlu** | 1/1/1 kadrosu 410 savunmaya kadar kayıpsız → tam 0,5 saldırgan lehine aşağı yuvarlanır |
| **Varsayım** | Hayvan kaybında tam 0,5 yukarı yuvarlanır; demirci formülü (ayarlanabilir); büyük savaş üssünün yağmada da geçerli olması; diğer hayvanların savunma değerleri (üçüncü taraf tablo) |
| **Model tahmini** | Kahraman can kaybı = saldırgan kayıp yüzdesi (− zırh). Resmî formül yayımlanmamıştır; gerçek raporlarla kalibrasyon gerekir |
| **Tahmin** | Yolculuk süreleri (resmî formül yok), boş vahada yağmalanabilir oran, depo kapasitesinin sunucu hızıyla ölçeklenmesi |
| **Hesaplanmaz** | Hayvan yeniden doğma zamanı ve sayısı (resmî kaynaklarda yok) |

Arayüzde her sonuç **Doğrulanmış / Matematiksel tahmin / Dikkat–sınırda** etiketlerinden birini taşır;
uydurma güven yüzdesi gösterilmez. Simülatör'de gerçek bir oyun sonucunu referans vaka olarak kaydederseniz
motorun o savaşı birebir üretip üretmediği Ayarlar'da listelenir.

## Bilinen sınırlar

- **Cihazda tanı** beş gerçek mobil ekran görüntüsüyle doğrulandı (hepsi aynı telefon, 924×2000): 18 hayvan satırı,
  5 koordinat ve 5 vaha türü doğru okundu. Farklı çözünürlük, tema veya dilde ikon eşleşmesi tutmayabilir;
  o durumda ikon "tanınmadı" gelir. Sayıları her zaman görüntüyle karşılaştırın.
- **Yapay zekâ tanıma** gerçek bir API anahtarıyla test edilmedi.
- **Gerçek iPhone'da** test edilmedi; yalnızca masaüstü tarayıcıda telefon genişliğinde denendi.
- **Kahraman can kaybı** doğrulanmamıştır; kahramanlı öneriler her zaman "Dikkat" olarak işaretlenir.
- Arama uzayı 6 milyon kombinasyonu aşarsa sınırlar küçültülür ve sonuç "sınırlı arama" olarak belirtilir.
- İngilizce çeviriler oyunun resmî terimleriyle birebir aynı olmayabilir.

## Geliştirme

Derleme adımı ve bağımlılık yoktur: düz HTML, CSS ve ES modülleri. Node 20+ yalnızca yerel sunucu ve testler için gerekir.

```bash
npm start
```

`http://localhost:5173` adresini açın; port doluysa sıradaki boş port denenir ve adres yazdırılır.
ES modülleri nedeniyle `index.html` doğrudan `file://` ile açılamaz; herhangi bir statik sunucu yeterlidir.

```bash
npm test
```

32 test; şartnamedeki 30 doğrulama maddesini, en güvenli seçeneği, kayıpsız garantiyi, demirci formülünü, ikon tanımanın saf kısımlarını
ve iki dili kapsar. Optimizasyon sonuçları bağımsız bir kaba kuvvet taramasıyla karşılaştırılır.

`main` dalına gönderilen her değişiklik GitHub Pages üzerinden birkaç dakika içinde canlı sürüme yansır.

### Mimari

| Dosya | Görev |
|---|---|
| `src/engine/battle.js` | **Tek savaş motoru**: saldırı, savunma, kayıp, yuvarlama, kahraman, ekonomi |
| `src/engine/travel.js` | Mesafe, yolculuk süresi, vaha stok tahmini |
| `src/optimizer/optimizer.js` | Eksiksiz tarama, baskınlık elemesi, Pareto, en güvenli seçenek; `worker.js` Web Worker sarmalayıcısı |
| `src/data/` | Hun birimleri ve silahlar, doğa birimleri, vaha türleri, referans vakalar, ikon parmak izleri |
| `src/vision/` | `icons.js` (cihazda ikon + sayı tanıma), `claude.js` (yapay zekâ), `parse.js` (doğrulama, metin ayrıştırma) |
| `src/ui/` | Arayüz (`app.js`) ve yerel kayıt (`store.js`) |
| `src/i18n.js` | Türkçe / İngilizce metin yardımcıları |
| `sw.js`, `manifest.webmanifest` | Çevrimdışı çalışma ve ana ekrana ekleme |

Simülatör ve optimizasyon aynı `createScenario().evaluate()` fonksiyonunu kullanır; ikinci bir savaş hesabı yoktur.

## Kaynaklar

- support.travian.com — Battle mechanics (63), Combat simulator (18), Smithy (40), Oasis (48), Hero health (47),
  Hun hero items (97), 5 things about Huns (147), Oasis farming (185, 190), Tournament Square (71)
- unofficialtravian.com — Kirilloid: Combat basics; Smithy and total strength of an army
- siegewise.com — Hun ve Nature birim tabloları
