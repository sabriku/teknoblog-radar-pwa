# Teknoblog Radar

Vercel, GitHub ve Supabase üzerinde çalışan editör odaklı bir PWA.

## İçerik
- Mobil uyumlu öneri paneli
- Discover, trafik, dönüşüm, sosyal ve editoryal skora göre sıralama
- Tıklanabilir haber linkleri
- Tek tek URL kopyalama
- Çoklu seçimle toplu URL kopyalama
- Yeni RSS kaynağı ekleme
- Feed görselini çekme
- PWA, manifest ve service worker
- Supabase tabanlı veri modeli
- Vercel serverless API uçları

## Kurulum özeti
1. `sql/schema.sql`
2. `sql/seed.sql`
3. Vercel env değişkenleri
4. `/api/health`
5. `/api/run-pipeline?token=...`

Eski veya yarım kurulumu uyarlamak için:
- `sql/schema_compat_patch.sql`
- gerekirse `sql/ui_upgrade.sql`
