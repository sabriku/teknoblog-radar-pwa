# Teknoblog Radar PWA

Teknoblog için hazırlanmış, WordPress'ten bağımsız çalışan bir editoryal radar PWA iskeletidir.

## Özellikler

- PWA, çevrimdışı önbellekleme ve kurulabilir arayüz
- Supabase tabanlı hafif veri modeli
- Vercel serverless API uçları
- RSS ingest, scoring ve recommendation akışı
- Storage dostu retention yaklaşımı

## Klasör yapısı

- `public/` PWA dosyaları
- `api/` Vercel serverless fonksiyonları
- `sql/` Supabase şema ve bakım dosyaları

## Kurulum özeti

1. Supabase'te `sql/schema_lean.sql` çalıştırın.
2. İsterseniz `sql/cron_jobs.sql` ve `sql/retention_examples.sql` dosyalarını uygulayın.
3. Bu repo'yu GitHub'a yükleyin.
4. Vercel'de import edin.
5. Environment variables ekleyin.
6. `/api/health` ve `/api/run-pipeline?token=...` ile test edin.

Detaylı adımlar için `INSTALL_GUIDE.md` dosyasına bakın.
