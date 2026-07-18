# Teknoblog Radar

Yerel PostgreSQL ve Node.js üzerinde çalışan editör odaklı PWA.

## İçerik

- Discover, trafik, dönüşüm, sosyal ve editoryal skora göre sıralama
- RSS ingest ve puanlama pipeline'ı
- Google News ve Google Trends radarları
- Kaynak yönetimi ve otomatik seed
- Haber görselleri ve Slack paylaşımı
- Yerel PostgreSQL üzerinde kalıcı haber, trend ve pipeline kayıtları

## Veri katmanı

Supabase kullanılmaz. Eski API dosyalarının sorgu sözleşmesi `api/_lib.js` içindeki PostgreSQL adaptörüyle korunur. Şema ve seed uygulama başlangıcında idempotent biçimde hazırlanır.

## Kontrol

```bash
npm run check
npm run smoke
```

Ayrıntılar için `INSTALL_GUIDE.md` dosyasına bakın.
