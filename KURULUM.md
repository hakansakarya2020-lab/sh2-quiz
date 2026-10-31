# SH2 Quiz – Kurulum

## 1. Firebase projesi
1. https://console.firebase.google.com → **Proje ekle** → ad: `sh2-quiz` (Analytics gerekmez).
2. **Build → Authentication → Get started → Sign-in method**: *Google*, *Email/Password* ve *Anonymous* sağlayıcılarını aç.
3. **Build → Firestore Database → Create database** → konum `europe-west1` (ya da `eur3`) → *production mode*.
4. **Firestore → Rules** sekmesine `firestore.rules` dosyasının içeriğini yapıştır → **Publish**.
5. **Project settings (⚙) → Your apps → Web (</>)** → uygulama adı `sh2-quiz` → çıkan `firebaseConfig` değerlerini `public/config.js` içine yapıştır.

## 2. Yayına alma (Node.js kurulu bir bilgisayarda)
```
npm install -g firebase-tools
firebase login
firebase use --add      (projeyi seç)
firebase deploy
```
Site adresi: `https://<proje-id>.web.app`

## 3. Kullanım
- Hocalar siteye girip Google ya da e-posta ile hesap açar; her kullanıcının kütüphanesi sadece kendisine görünür.
- "Canlı başlat" → projeksiyonda QR kod + 6 haneli PIN çıkar. Öğrenciler telefondan QR'ı okutur, adını yazar, katılır (hesap gerekmez).
- Raporlar: her oyunun sıralaması, soru bazlı doğru oranı ve kişi × soru tablosu; CSV (Excel) olarak indirilebilir.
