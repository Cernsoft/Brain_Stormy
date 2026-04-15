[README.md](https://github.com/user-attachments/files/26748622/README.md)
# Brainstorm — Dinamik Karar Motoru 🧠

> Not sistemi değil, **karar makinesi.**  
> Her düşünce bir varsayıma dayanır. Varsayımın kanıtı yoksa → o bir risktir.

Brainstorm, iş kararlarını yapılandırılmış düşünce node'ları ile yönetmeni sağlayan sıfır bağımlılıklı, tarayıcı tabanlı bir karar motorudur.

---

## ✨ Özellikler

### 🔲 Zorunlu 3 Blok — Her Node'da
| Blok | Açıklama |
|------|----------|
| **Varsayım** | Bu karar hangi kabule dayanıyor? |
| **Kanıt** | Varsayımı destekleyen veri veya kaynak |
| **Karar** | Varsayım + kanıta dayalı nihai karar |

> ⚠️ **Kanıt yoksa → node otomatik olarak RİSK sayılır** ve kırmızı glow ile işaretlenir.

### ❓ 3 Kritik Soru — Her Node'un Altında Sabit
1. **Bu yanlışsa ne olur?**
2. **Bu neyi etkiler?**
3. **Bunu nasıl doğrularım?**

### 🔗 Cross-Link Sistemi
Node'lar arası 5 farklı bağlantı tipi:

| Tip | Örnek Kullanım |
|-----|---------------|
| → etkiler | Feature → maliyet → fiyat |
| ← bağımlı | Fiyat ← pazar büyüklüğü |
| ⚡ çelişir | İki varsayım birbiriyle çelişiyor |
| ✓ destekler | Bir kanıt başka bir kararı destekliyor |
| ⟶ besler | Çıktı → başka node'un girdisi |

Tüm bağlantılar **force-directed graph** ile görselleştirilebilir.

### 📅 Haftalık Zorunlu Güncelleme
- Ne değişti?
- Hangi varsayım çöktü?
- Yeni karar ne?
- 7+ gün güncellenmemiş node'lar otomatik uyarı alır
- Geçmiş güncellemeler kayıt altında tutulur

---

## 🚀 Kullanım

```
index.html dosyasını tarayıcıda aç. Hepsi bu.
```

Build yok. Install yok. Dependency yok.  
Tüm veriler tarayıcının `localStorage`'ında saklanır.

### GitHub Pages ile Yayınlama

1. Bu repoyu GitHub'a pushla
2. **Settings → Pages → Source: main branch** seç
3. `kullanıcıadın.github.io/Brainstorm` adresinden kullan

---

## ⌨️ Klavye Kısayolları

| Kısayol | Aksiyon |
|---------|---------|
| `Ctrl + N` | Yeni node oluştur |
| `Ctrl + K` | Aramaya odaklan |
| `Ctrl + S` | Node'u kaydet (modal açıkken) |
| `Escape` | Aktif modalı kapat |

---

## 🏗️ Kategori Sistemi

Node'lar 11 farklı kategoride organize edilebilir:

| # | Kategori |
|---|----------|
| 01 | Stratejik Tanım |
| 02 | Pazar & Dış Analiz |
| 03 | Ürün / Hizmet |
| 04 | Teknik Mimari |
| 05 | Operasyon |
| 06 | Finansal Model |
| 07 | Risk & Senaryo |
| 08 | Go-To-Market |
| 09 | Ölçüm & Optimizasyon |
| 10 | Yol Haritası |
| 11 | Yönetim & Karar |

---

## 📁 Dosya Yapısı

```
Brainstorm/
├── index.html   → Uygulama yapısı
├── styles.css   → Design system (dark theme)
├── engine.js    → İş mantığı ve persistence
└── README.md    → Bu dosya
```

---

## 🔒 Gizlilik

- Hiçbir veri dışarıya gönderilmez
- Backend yoktur
- Tüm veriler sadece senin tarayıcında kalır
- Google Fonts dışında hiçbir dış kaynağa bağlanmaz

---

## 📄 Lisans

MIT — istediğin gibi kullan, değiştir, dağıt.
