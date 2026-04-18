# Kurulum Rehberi

## 1. GitHub
Bu klasörü GitHub'da boş bir repoya yükleyin.

## 2. Supabase
SQL Editor içinde şu sırayla çalıştırın:
1. `sql/schema.sql`
2. `sql/seed.sql`
3. `sql/ui_upgrade.sql`

İsteğe bağlı:
4. `sql/supabase_cron_setup.sql`

## 3. Vercel
Environment variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_TOKEN`

## 4. İlk test
- `/api/health`
- `/api/run-pipeline?token=CRON_TOKEN`
- Ana uygulama adresi

## 5. Supabase Cron
`sql/supabase_cron_setup.sql` dosyasındaki alan adını ve token'ı kendi değerlerinizle değiştirip çalıştırın.
