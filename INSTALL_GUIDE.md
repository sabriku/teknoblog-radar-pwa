# Kurulum Rehberi

## Supabase
SQL Editor'da sırayla çalıştırın:
1. `sql/schema.sql`
2. `sql/seed.sql`

Eski kurulumu düzeltmek için bunun yerine:
1. `sql/schema_compat_patch.sql`
2. `sql/seed.sql`
3. `sql/ui_upgrade.sql`

## Vercel environment variables
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- CRON_TOKEN

## Test
- `/api/health`
- `/api/run-pipeline?token=CRON_TOKEN`

## Cron
Vercel Hobby kısıtı nedeniyle otomasyonu `sql/supabase_cron_setup.sql` ile Supabase tarafına taşıyın.
