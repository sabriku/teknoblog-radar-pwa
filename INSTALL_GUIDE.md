# Kurulum Rehberi

## 1. Supabase

Önce yeni bir Supabase projesi açın. SQL Editor içinden sırasıyla aşağıdaki dosyaları çalıştırın:

1. `sql/schema_lean.sql`
2. `sql/cron_jobs.sql`, isteğe bağlı
3. `sql/retention_examples.sql`, isteğe bağlı örnekler

## 2. GitHub

Bu klasörü yeni bir GitHub repository içine yükleyin.

## 3. Vercel

GitHub repository'sini Vercel'e import edin.

Environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_TOKEN`

## 4. Test

Deploy sonrası şu adresleri test edin:

- `/api/health`
- `/api/recommendations`
- `/api/run-pipeline?token=YOUR_CRON_TOKEN`

## 5. Güvenlik

`SUPABASE_SERVICE_ROLE_KEY` yalnızca sunucu tarafında kullanılmalı.
Tarayıcıya sadece `SUPABASE_ANON_KEY` çıkmalı.
